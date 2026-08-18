import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { ForbiddenError } from "@/lib/auth/guards";
import { canAccessEvent, rolesInOrg } from "@/lib/auth/org-scope";
import type { SessionContext } from "@/lib/auth/types";
import { emailMode } from "@/lib/email/service";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixProducts from "@/lib/pretix/products";
import { listOrders, type PretixOrder } from "@/lib/pretix/orders";
import { listWebhooks } from "@/lib/pretix/webhooks";

/**
 * Queries behind the Data section.
 *
 * The section exists because of a specific failure shape: this app and pretix
 * hold different halves of the truth, and nothing compares them. Which sessions
 * an attendee booked lives ONLY in pretix positions. Whether they were emailed
 * a ticket lives ONLY here. Every incident that has bitten so far was an
 * ABSENCE — an order with no local row, an item no session points at, an email
 * that silently stopped sending — and absences are invisible to the audit log,
 * which by construction records only what happened.
 *
 * So these are checks and lists, not charts. Every number is a count with a
 * list behind it and a sentence saying what breaks if it is non-zero.
 */

/**
 * Resolve the event AND authorise it in one step, scoped to the organization
 * that owns it.
 *
 * These were two independent checks — "holds organizer_admin somewhere" and
 * "is a member of this event's org in some role". `hasAnyRole` flattens roles
 * across every membership, so the pair was satisfiable by holding
 * organizer_admin in an unrelated organization while being mere checkin_staff
 * in this one, which handed over the full attendee roster. Role and org must be
 * checked together or not at all.
 */
async function authorizeEvent(session: SessionContext, eventId: string) {
  const mapping = await prisma.eventMapping.findUnique({ where: { id: eventId } });
  if (!mapping) throw new ForbiddenError("Event not found");

  if (!canAccessEvent(session, mapping.organizationId, mapping.localEventId)) {
    throw new ForbiddenError("Access denied");
  }
  // canAccessEvent also admits finance and assigned checkin_staff. This section
  // exports attendee PII in bulk, so require admin WITHIN this organization.
  const roles = rolesInOrg(session, mapping.organizationId);
  if (!session.isSuperAdmin && !roles.includes("organizer_admin")) {
    throw new ForbiddenError("Requires organizer admin or super admin");
  }
  return mapping;
}

/* ------------------------------------------------------------------ */
/* Email health                                                        */
/* ------------------------------------------------------------------ */

export interface EmailHealth {
  lastSentAt: Date | null;
  minutesSinceLastSend: number | null;
  sent24h: number;
  failed24h: number;
  disabled24h: number;
  /** Registrations taken since the last successful send — see `silentOutage`. */
  registrationsSinceLastSend: number;
  /**
   * The signal that actually matters. A failure RATE says nothing when sending
   * has stopped altogether: zero attempts is zero failures. What identifies an
   * outage is time passing, with registrations arriving, and nothing delivered.
   * The August outage ran two days and was found by chance; this comparison
   * would have shown it within the hour.
   */
  silentOutage: boolean;
  lastError: string | null;
  mode: string;
}

const OUTAGE_MINUTES = 60;

export async function emailHealth(
  session: SessionContext,
  eventId: string,
): Promise<EmailHealth> {
  // Scoped to one event: email_logs and attendee_orders are organization-wide
  // tables, and an unscoped read would report another organization's delivery
  // health to whoever opened this page.
  const mapping = await authorizeEvent(session, eventId);
  const scope = { eventMappingId: mapping.id };
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [last, sent24h, failed24h, disabled24h, lastFailure] = await Promise.all([
    prisma.emailLog.findFirst({
      where: { ...scope, status: "sent" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.emailLog.count({ where: { ...scope, status: "sent", createdAt: { gte: since } } }),
    prisma.emailLog.count({ where: { ...scope, status: "failed", createdAt: { gte: since } } }),
    prisma.emailLog.count({ where: { ...scope, status: "disabled", createdAt: { gte: since } } }),
    prisma.emailLog.findFirst({
      where: { ...scope, status: "failed" },
      orderBy: { createdAt: "desc" },
      select: { lastError: true },
    }),
  ]);

  const lastSentAt = last?.createdAt ?? null;
  const minutes = lastSentAt
    ? Math.floor((Date.now() - lastSentAt.getTime()) / 60000)
    : null;

  const registrationsSinceLastSend = lastSentAt
    ? await prisma.attendeeOrder.count({ where: { ...scope, createdAt: { gt: lastSentAt } } })
    : await prisma.attendeeOrder.count({ where: scope });

  return {
    lastSentAt,
    minutesSinceLastSend: minutes,
    sent24h,
    failed24h,
    disabled24h,
    registrationsSinceLastSend,
    silentOutage:
      (minutes === null || minutes >= OUTAGE_MINUTES) && registrationsSinceLastSend > 0,
    lastError: lastFailure?.lastError ?? null,
    mode: emailMode(),
  };
}

/* ------------------------------------------------------------------ */
/* Door risk                                                           */
/* ------------------------------------------------------------------ */

export type DoorRiskReason = "no_qr" | "no_ticket_email" | "not_eligible";

export interface DoorRiskRow {
  orderCode: string;
  attendeeName: string | null;
  email: string;
  reason: DoorRiskReason;
}

export interface DoorRisk {
  /** Hard blockers: this person cannot be checked in as things stand. */
  blocked: number;
  /** Soft: they can be checked in, but will arrive with no ticket in hand. */
  noTicket: number;
  rows: DoorRiskRow[];
  /**
   * Which causes this run actually covered. A number that silently omits a
   * category is the exact failure this section exists to kill, so the caller
   * must be able to say "3 of 5 checks" rather than implying completeness.
   */
  checksRun: string[];
  checksSkipped: string[];
}

/**
 * The one number a human acts on, computed from Postgres only.
 *
 * Two causes need a pretix sweep (orders present there but not here, and QR
 * secrets that do not match a real position) and are reported as SKIPPED rather
 * than quietly dropped.
 */
export async function doorRisk(
  session: SessionContext,
  eventId: string,
): Promise<DoorRisk> {
  const mapping = await authorizeEvent(session, eventId);

  // Not `as const`: Prisma's WhereInput wants a mutable array for `in`, and a
  // readonly tuple is rejected.
  const issued: Prisma.AttendeeOrderWhereInput = {
    eventMappingId: mapping.id,
    status: "paid",
    approvalStatus: { in: ["not_required", "approved"] },
  };

  const [noQr, orders, delivered] = await Promise.all([
    prisma.attendeeOrder.findMany({
      where: { ...issued, pretixSecret: null },
      select: { orderCode: true, attendeeName: true, email: true },
    }),
    prisma.attendeeOrder.findMany({
      where: issued,
      select: { orderCode: true, attendeeName: true, email: true },
    }),
    prisma.emailLog.findMany({
      where: { eventMappingId: mapping.id, templateType: "ticket_issued", status: "sent" },
      select: { attendeeRef: true },
    }),
  ]);

  const deliveredRefs = new Set(delivered.map((d) => d.attendeeRef).filter(Boolean));
  const rows: DoorRiskRow[] = [];

  for (const o of noQr) {
    // `checkInResolvedOrder` falls back to the ORDER code when pretixSecret is
    // null, but pretix redeems against a POSITION secret — so that fallback can
    // never succeed. A null here is a guaranteed refusal at the door.
    rows.push({ ...o, reason: "no_qr" });
  }
  for (const o of orders) {
    if (!deliveredRefs.has(o.orderCode)) {
      rows.push({ ...o, reason: "no_ticket_email" });
    }
  }

  const blocked = rows.filter((r) => r.reason !== "no_ticket_email").length;
  const noTicket = rows.filter((r) => r.reason === "no_ticket_email").length;

  return {
    blocked,
    noTicket,
    rows,
    checksRun: ["missing QR secret", "issued but no delivered ticket email"],
    checksSkipped: [
      "orders in pretix with no local row (needs pretix sweep)",
      "QR secret not matching a real pretix position (needs pretix sweep)",
    ],
  };
}

/* ------------------------------------------------------------------ */
/* Item map — sessions vs pretix products                              */
/* ------------------------------------------------------------------ */

export type ItemMapSeverity = "ok" | "warn" | "critical";

export interface ItemMapRow {
  itemId: number | null;
  itemName: string | null;
  subEventId: string | null;
  subEventTitle: string | null;
  category: string | null;
  quotaId: number | null;
  severity: ItemMapSeverity;
  finding: string;
}

/**
 * Reconcile `sub_events` against the pretix products that actually exist.
 *
 * Two real incidents live here and neither surfaced anywhere:
 *  - a session pointing at an item id that does not exist, so it can never be
 *    booked and reads zero forever;
 *  - an item carrying paid bookings that no session references, so those
 *    attendees appear in no list and no room is staffed for them.
 */
export async function itemMap(
  session: SessionContext,
  eventId: string,
): Promise<ItemMapRow[]> {
  const mapping = await authorizeEvent(session, eventId);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: mapping.organizationId },
  });
  const ctx = resolvePretixContext(org);

  const [subEvents, items, quotas] = await Promise.all([
    prisma.subEvent.findMany({ where: { eventMappingId: mapping.id }, orderBy: { dateFrom: "asc" } }),
    pretixProducts.listItems(ctx.organizerSlug, mapping.pretixEventSlug, ctx.token),
    pretixProducts.listQuotasWithItems(ctx.organizerSlug, mapping.pretixEventSlug, ctx.token),
  ]);

  const itemById = new Map(items.map((i) => [i.id, i]));
  const quotaItemIds = new Set(quotas.flatMap((q) => q.items ?? []));
  const referenced = new Set<number>();
  const rows: ItemMapRow[] = [];

  for (const se of subEvents) {
    const item = se.pretixItemId != null ? itemById.get(se.pretixItemId) : undefined;
    if (se.pretixItemId != null) referenced.add(se.pretixItemId);

    if (se.pretixItemId == null) {
      rows.push({
        itemId: null, itemName: null, subEventId: se.id, subEventTitle: se.titleEn,
        category: se.category, quotaId: se.pretixQuotaId, severity: "critical",
        finding: "Session has no pretix item — it cannot be booked at all.",
      });
    } else if (!item) {
      rows.push({
        itemId: se.pretixItemId, itemName: null, subEventId: se.id, subEventTitle: se.titleEn,
        category: se.category, quotaId: se.pretixQuotaId, severity: "critical",
        finding: `Session points at pretix item ${se.pretixItemId}, which does not exist. It can never be booked and will always read zero.`,
      });
    } else if (!quotaItemIds.has(se.pretixItemId)) {
      rows.push({
        itemId: se.pretixItemId, itemName: item.titleEn ?? null, subEventId: se.id,
        subEventTitle: se.titleEn, category: se.category, quotaId: se.pretixQuotaId,
        severity: "critical",
        finding: "Item belongs to no quota. pretix refuses orders for it, so the session is silently unbookable.",
      });
    } else {
      rows.push({
        itemId: se.pretixItemId, itemName: item.titleEn ?? null, subEventId: se.id,
        subEventTitle: se.titleEn, category: se.category, quotaId: se.pretixQuotaId,
        severity: "ok", finding: "Linked to a live item in a quota.",
      });
    }
  }

  // Items nobody points at. Also check the id lists on the event mapping, so a
  // product used only for tagging or invite-gating is not reported as orphaned.
  const otherwiseUsed = new Set<number>([
    ...(mapping.autoApproveItemIds ?? []),
    ...(mapping.inviteOnlyItemIds ?? []),
  ]);
  for (const item of items) {
    if (referenced.has(item.id) || otherwiseUsed.has(item.id)) continue;
    rows.push({
      itemId: item.id, itemName: item.titleEn ?? null, subEventId: null, subEventTitle: null,
      category: null, quotaId: null, severity: "warn",
      finding: "pretix product that no session references. Anyone who books it appears in no list and no room is staffed for them.",
    });
  }

  const rank: Record<ItemMapSeverity, number> = { critical: 0, warn: 1, ok: 2 };
  return rows.sort((a, b) => rank[a.severity] - rank[b.severity]);
}

/* ------------------------------------------------------------------ */
/* Config assertions                                                   */
/* ------------------------------------------------------------------ */

export interface Assertion {
  name: string;
  ok: boolean;
  detail: string;
}

export async function configAssertions(
  session: SessionContext,
  eventId: string,
): Promise<Assertion[]> {
  const mapping = await authorizeEvent(session, eventId);
  const out: Assertion[] = [];

  const appUrl = process.env.APP_URL;
  out.push({
    name: "APP_URL",
    ok: Boolean(appUrl),
    detail: appUrl
      ? appUrl
      : "Unset — ticket links built by the pretix webhook handler would be relative and unusable, with no error raised.",
  });

  const mode = emailMode();
  out.push({
    name: "Outbound email",
    ok: mode !== "disabled",
    detail: mode === "disabled" ? "Disabled — nothing is being sent." : `mode: ${mode}`,
  });

  out.push({
    name: "PRETIX_WEBHOOK_SECRET",
    ok: Boolean(process.env.PRETIX_WEBHOOK_SECRET),
    detail: process.env.PRETIX_WEBHOOK_SECRET
      ? "set"
      : "Unset — inbound pretix deliveries cannot be verified and are rejected.",
  });

  try {
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: mapping.organizationId },
    });
    resolvePretixContext(org);
    out.push({ name: "pretix credentials", ok: true, detail: "resolve and decrypt" });
  } catch (err) {
    out.push({
      name: "pretix credentials",
      ok: false,
      detail: (err as Error).message,
    });
  }

  return out;
}

/* ------------------------------------------------------------------ */
/* Webhook registration                                                */
/* ------------------------------------------------------------------ */

export interface WebhookStatus {
  registered: boolean;
  expectedUrl: string;
  hooks: { id: number; enabled: boolean; target_url: string; action_types: string[] }[];
  missingActions: string[];
  error: string | null;
}

export async function webhookStatus(
  session: SessionContext,
  eventId: string,
): Promise<WebhookStatus> {
  const mapping = await authorizeEvent(session, eventId);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: mapping.organizationId },
  });
  const expectedUrl = `${process.env.APP_URL ?? ""}/api/webhooks/pretix`;

  try {
    const ctx = resolvePretixContext(org);
    const hooks = await listWebhooks(ctx.organizerSlug, ctx.token);
    const ours = hooks.filter((h) => h.target_url === expectedUrl && h.enabled);
    const have = new Set(ours.flatMap((h) => h.action_types));
    const missingActions = [
      "pretix.event.order.paid",
      "pretix.event.order.canceled",
      "pretix.event.checkin",
    ].filter((a) => !have.has(a));
    return {
      registered: ours.length > 0 && missingActions.length === 0,
      expectedUrl,
      hooks: hooks.map((h) => ({
        id: h.id, enabled: h.enabled, target_url: h.target_url, action_types: h.action_types,
      })),
      missingActions,
      error: null,
    };
  } catch (err) {
    // Keep pretix's own message — which carries the internal base URL — in the
    // log, and hand the UI a flag rather than a description.
    console.error("[data] listWebhooks failed:", (err as Error).message);
    return {
      registered: false, expectedUrl, hooks: [], missingActions: [],
      error: "unavailable",
    };
  }
}

/* ------------------------------------------------------------------ */
/* Rosters                                                             */
/* ------------------------------------------------------------------ */

export interface RosterEntry {
  orderCode: string;
  name: string;
  email: string;
  company: string;
  phone: string;
  attendeeType: string;
  /** False when the order exists in pretix but has no row here — see below. */
  inAppDb: boolean;
}

export interface Roster {
  itemId: number;
  itemName: string;
  subEventTitle: string | null;
  category: string | null;
  dateFrom: Date | null;
  entries: RosterEntry[];
}

/**
 * Attendee lists per pretix product.
 *
 * Keyed on the pretix ITEM, not on `sub_events`. That is deliberate: driving it
 * off our own sessions table reproduces exactly the blindness that let an item
 * with live bookings exist in no list at all. Anything sold shows up here, named
 * or not.
 *
 * Requires a full order sweep, so it is called from an explicit page load rather
 * than anything that polls.
 */
export async function rosters(
  session: SessionContext,
  eventId: string,
): Promise<Roster[]> {
  const mapping = await authorizeEvent(session, eventId);
  const org = await prisma.organization.findUniqueOrThrow({
    where: { id: mapping.organizationId },
  });
  const ctx = resolvePretixContext(org);

  const [orders, items, subEvents, appOrders] = await Promise.all([
    listOrders(ctx.organizerSlug, mapping.pretixEventSlug, ctx.token),
    pretixProducts.listItems(ctx.organizerSlug, mapping.pretixEventSlug, ctx.token),
    prisma.subEvent.findMany({ where: { eventMappingId: mapping.id } }),
    prisma.attendeeOrder.findMany({ where: { eventMappingId: mapping.id } }),
  ]);

  const appByCode = new Map(appOrders.map((o) => [o.orderCode, o]));
  const seByItem = new Map(
    subEvents.filter((s) => s.pretixItemId != null).map((s) => [s.pretixItemId!, s]),
  );
  const itemName = new Map(items.map((i) => [i.id, i.titleEn ?? `item ${i.id}`]));

  const byItem = new Map<number, Map<string, RosterEntry>>();

  for (const order of orders as PretixOrder[]) {
    // Only orders that are actually valid. Canceled and refunded people are not
    // in the room.
    if (order.status !== "p" && order.status !== "n") continue;
    for (const pos of order.positions ?? []) {
      if (pos.canceled || pos.item == null) continue;
      const app = appByCode.get(order.code);
      const bucket = byItem.get(pos.item) ?? new Map<string, RosterEntry>();
      // One row per ORDER per item — a duplicate position should not become a
      // duplicate human in a printed roster.
      if (!bucket.has(order.code)) {
        bucket.set(order.code, {
          orderCode: order.code,
          name: app?.attendeeName || pos.attendee_name || "",
          email: app?.email || pos.attendee_email || order.email || "",
          company: app?.company || pos.company || "",
          phone: normalisePhone(app?.phoneCC ?? null, app?.phone ?? null),
          attendeeType: app?.attendeeType ?? "",
          inAppDb: Boolean(app),
        });
      }
      byItem.set(pos.item, bucket);
    }
  }

  const out: Roster[] = [];
  for (const [itemId, entries] of byItem) {
    const se = seByItem.get(itemId);
    out.push({
      itemId,
      itemName: itemName.get(itemId) ?? `item ${itemId}`,
      subEventTitle: se?.titleEn ?? null,
      category: se?.category ?? null,
      dateFrom: se?.dateFrom ?? null,
      entries: [...entries.values()].sort((a, b) =>
        (a.name || "￿").localeCompare(b.name || "￿"),
      ),
    });
  }
  return out.sort((a, b) => {
    const at = a.dateFrom?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bt = b.dateFrom?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return at - bt || a.itemId - b.itemId;
  });
}

/**
 * The country code was concatenated onto numbers that already carried it,
 * producing "+961+96170...". Repaired on the way out; the stored value is left
 * alone, since rewriting 700+ rows days before an event is risk without payoff.
 */
export function normalisePhone(cc: string | null, phone: string | null): string {
  const raw = `${cc ?? ""}${phone ?? ""}`;
  const m = /^(\+\d{1,4})\+(\d.*)$/.exec(raw);
  if (!m) return raw;
  const [, prefix, rest] = m;
  return rest.startsWith(prefix.slice(1)) ? `+${rest}` : `${prefix}${rest}`;
}

/** CSV with the same formula-injection guard the registrations export uses. */
export function rosterCsv(roster: Roster): string {
  const headers = ["Order", "Name", "Email", "Company", "Phone", "Attendee type", "In app DB"];
  const esc = (v: unknown) => {
    let s = v == null ? "" : String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const e of roster.entries) {
    lines.push(
      [e.orderCode, e.name, e.email, e.company, e.phone, e.attendeeType, e.inAppDb ? "yes" : "NO"]
        .map(esc)
        .join(","),
    );
  }
  return lines.join("\n");
}
