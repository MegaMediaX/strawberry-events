import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { canAccessEvent, subEventScope, canAccessSubEvent } from "@/lib/auth/org-scope";
import { ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { registrationState, type RegistrationState } from "@/lib/approval/state";
import { orderScope } from "./scope";
import { resolvePretixContext } from "@/lib/pretix/context";
import { listOrders } from "@/lib/pretix/orders";

export interface RegistrationFilters {
  organizationId?: string;
  eventId?: string;
  /**
   * Show only registrations that booked this sub-event (session / workshop).
   *
   * Which sessions an order holds lives ONLY in pretix order positions — the app
   * stores the item id on `sub_events` but never the bookings against it. So
   * unlike every other filter here this one cannot be expressed in SQL; it
   * resolves to a set of order codes by sweeping pretix, in the same shape as
   * `checkedIn` below. That sweep is ~16 sequential API calls, so it runs only
   * when this filter is actually set, never on an unfiltered page load.
   */
  subEventId?: string;
  roleTag?: string;
  approvalStatus?: string;
  paymentStatus?: string;
  issued?: boolean;
  checkedIn?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  q?: string;
}

const ISSUED: Prisma.AttendeeOrderWhereInput = {
  status: "paid",
  approvalStatus: { in: ["not_required", "approved"] },
};

/** Build the scoped + filtered AttendeeOrder where clause (no async filters here). */
function buildWhere(session: SessionContext, f: RegistrationFilters): Prisma.AttendeeOrderWhereInput {
  const and: Prisma.AttendeeOrderWhereInput[] = [orderScope(session)];
  if (f.organizationId) and.push({ eventMapping: { organizationId: f.organizationId } });
  if (f.eventId) and.push({ eventMappingId: f.eventId });
  if (f.roleTag) and.push({ roleTag: f.roleTag as Prisma.AttendeeOrderWhereInput["roleTag"] });
  if (f.approvalStatus) and.push({ approvalStatus: f.approvalStatus as Prisma.AttendeeOrderWhereInput["approvalStatus"] });
  if (f.paymentStatus) and.push({ status: f.paymentStatus as Prisma.AttendeeOrderWhereInput["status"] });
  if (f.issued === true) and.push(ISSUED);
  else if (f.issued === false) and.push({ NOT: ISSUED });
  if (f.createdFrom || f.createdTo) {
    and.push({ createdAt: { ...(f.createdFrom ? { gte: f.createdFrom } : {}), ...(f.createdTo ? { lte: f.createdTo } : {}) } });
  }
  if (f.q && f.q.trim()) {
    const q = f.q.trim();
    and.push({
      OR: [
        { attendeeName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { orderCode: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  return { AND: and };
}

export interface RegistrationRow {
  id: string;
  orderCode: string;
  event: string;
  eventId: string;
  attendee: string;
  email: string;
  phone: string | null;
  company: string | null;
  roleTag: string;
  method: "Free" | "COD";
  status: string;
  approvalStatus: string;
  state: RegistrationState;
  createdAt: Date;
}

export interface SubEventCodes {
  codes: string[];
  /**
   * False when pretix could not be read. The filter still fails CLOSED (no
   * codes, so no rows) because failing open would quietly show every
   * registration under a session's name — but the caller must be able to tell
   * "pretix is down" from "nobody booked this", since both otherwise render as
   * a confident zero.
   */
  ok: boolean;
  /** True when the session has no pretix item, so it cannot be booked at all. */
  notBookable: boolean;
}

/**
 * Order codes holding a booking for one sub-event, read from pretix.
 */
async function orderCodesForSubEvent(
  session: SessionContext,
  subEventId: string,
): Promise<SubEventCodes> {
  const subEvent = await prisma.subEvent.findUnique({
    where: { id: subEventId },
    include: { eventMapping: { select: { id: true, organizationId: true, localEventId: true, pretixEventSlug: true } } },
  });
  if (!subEvent) return { codes: [], ok: true, notBookable: true };
  const m = subEvent.eventMapping;
  if (!canAccessEvent(session, m.organizationId, m.localEventId)) {
    throw new ForbiddenError("Access denied");
  }
  if (subEvent.pretixItemId == null) return { codes: [], ok: true, notBookable: true };

  const org = await prisma.organization.findUnique({ where: { id: m.organizationId } });
  if (!org) return { codes: [], ok: false, notBookable: false };

  try {
    const ctx = resolvePretixContext(org);
    const orders = await listOrders(ctx.organizerSlug, m.pretixEventSlug, ctx.token);
    const codes: string[] = [];
    for (const order of orders) {
      if (order.status === "c" || order.status === "r") continue;
      const holds = (order.positions ?? []).some(
        (pos) => !pos.canceled && pos.item === subEvent.pretixItemId,
      );
      if (holds) codes.push(order.code);
    }
    return { codes, ok: true, notBookable: false };
  } catch (err) {
    // pretix messages carry the internal base URL; keep them server-side.
    console.error("[registrations] sub-event filter failed:", (err as Error).message);
    return { codes: [], ok: false, notBookable: false };
  }
}

/**
 * List registrations the session may view, scoped by {@link orderScope} and the
 * given filters. The `checkedIn` filter is applied via a scoped BadgePrintLog
 * lookup (there is no direct relation). Never returns QR/secret material.
 */
export interface RegistrationPage {
  rows: RegistrationRow[];
  /** Total matching rows, ignoring take/skip. */
  total: number;
  /** True when `rows` is a truncated view of `total`. */
  capped: boolean;
  /**
   * Set only when a session filter was applied: whether pretix could be read,
   * and whether the session is bookable at all. Without this an empty table is
   * ambiguous between "nobody booked" and "pretix is unreachable".
   */
  sessionFilter?: { ok: boolean; notBookable: boolean };
}

/**
 * Rows PLUS the true total, so a caller can say "showing 200 of 812" instead of
 * presenting a truncated page as the whole answer.
 *
 * The default limit had been silently cutting the list: with 812 orders the page
 * rendered 200 and labelled it "200 registrations", and a session filter made
 * that worse by turning a capped list into a headcount someone might staff a
 * room from.
 */
export async function listRegistrationsPage(
  session: SessionContext,
  filters: RegistrationFilters = {},
  opts: { take?: number; skip?: number } = {},
): Promise<RegistrationPage> {
  const where = buildWhere(session, filters);

  // A workshop organiser may only ever see registrations booked into their own
  // sessions. That cannot be expressed in the SQL scope, because the booking
  // lives in pretix — so it is enforced here, at the single point every list and
  // export passes through.
  const allowedSubEvents = subEventScope(session);
  let effectiveSubEventId = filters.subEventId;
  if (allowedSubEvents !== null) {
    if (allowedSubEvents.length === 0) {
      // Restricted, but assigned nothing. Fail closed rather than fall through
      // to an unfiltered list.
      return { rows: [], total: 0, capped: false, sessionFilter: { ok: true, notBookable: false } };
    }
    if (!effectiveSubEventId) {
      // No session chosen: default to their own rather than showing everything.
      effectiveSubEventId = allowedSubEvents[0];
    } else if (!canAccessSubEvent(session, effectiveSubEventId)) {
      throw new ForbiddenError("Access denied for that session");
    }
  }

  let sessionFilter: { ok: boolean; notBookable: boolean } | undefined;
  if (effectiveSubEventId) {
    const res = await orderCodesForSubEvent(session, effectiveSubEventId);
    sessionFilter = { ok: res.ok, notBookable: res.notBookable };
    where.AND = [
      ...(where.AND as Prisma.AttendeeOrderWhereInput[]),
      { orderCode: { in: res.codes } },
    ];
  }

  if (filters.checkedIn !== undefined) {
    // Resolve checked-in order codes within the same scope, then constrain.
    const scopedCodes = await prisma.attendeeOrder.findMany({ where, select: { orderCode: true } });
    const logs = await prisma.badgePrintLog.findMany({
      where: { attendeeRef: { in: scopedCodes.map((o) => o.orderCode) } },
      select: { attendeeRef: true },
    });
    const checkedSet = new Set(logs.map((l) => l.attendeeRef));
    const wanted = scopedCodes
      .map((o) => o.orderCode)
      .filter((c) => (filters.checkedIn ? checkedSet.has(c) : !checkedSet.has(c)));
    where.AND = [...(where.AND as Prisma.AttendeeOrderWhereInput[]), { orderCode: { in: wanted } }];
  }

  const orders = await prisma.attendeeOrder.findMany({
    where,
    include: { eventMapping: { select: { titleEn: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 200,
    skip: opts.skip ?? 0,
  });

  const total = await prisma.attendeeOrder.count({ where });

  // Annotated: without the contextual type, `method` widens to string and no
  // longer satisfies the "Free" | "COD" union.
  const rows: RegistrationRow[] = orders.map((o) => ({
    id: o.id,
    orderCode: o.orderCode,
    event: o.eventMapping.titleEn,
    eventId: o.eventMappingId,
    attendee: o.attendeeName ?? o.email,
    email: o.email,
    phone: o.phone,
    company: o.company,
    roleTag: o.roleTag,
    method: o.provider === "free" ? "Free" : "COD",
    status: o.status,
    approvalStatus: o.approvalStatus,
    state: registrationState(o),
    createdAt: o.createdAt,
  }));

  return { rows, total, capped: total > rows.length + (opts.skip ?? 0), sessionFilter };
}

/**
 * Rows only. Kept so existing callers and their tests are unaffected; prefer
 * {@link listRegistrationsPage} anywhere the count is shown to a human.
 */
export async function listRegistrations(
  session: SessionContext,
  filters: RegistrationFilters = {},
  opts: { take?: number; skip?: number } = {},
): Promise<RegistrationRow[]> {
  return (await listRegistrationsPage(session, filters, opts)).rows;
}

/**
 * CSV escape + serialize. Scope is the caller's responsibility (pass scoped rows).
 * When `answersByOrder` is supplied, a "Custom fields" column is appended with the
 * order's modular answers (label=value; joined).
 */
export function buildCsv(rows: RegistrationRow[], answersByOrder?: Map<string, string>): string {
  const withCustom = !!answersByOrder;
  const headers = ["Event", "Order", "Attendee", "Email", "Phone", "Company", "Role", "Method", "State", "Created", ...(withCustom ? ["Custom fields"] : [])];
  const esc = (v: unknown) => {
    let s = v == null ? "" : String(v);
    // Neutralize CSV formula injection: spreadsheet apps execute a cell that
    // starts with = + - @ (or tab/CR). Attendee-controlled fields (name, company,
    // custom answers) flow here, so prefix a single quote to force a literal.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    const cells: unknown[] = [r.event, r.orderCode, r.attendee, r.email, r.phone, r.company, r.roleTag, r.method, r.state, r.createdAt.toISOString()];
    if (withCustom) cells.push(answersByOrder!.get(r.orderCode) ?? "");
    lines.push(cells.map(esc).join(","));
  }
  return lines.join("\n");
}

export interface RegistrationDetail {
  order: {
    id: string; orderCode: string; attendee: string; email: string;
    phone: string | null; phoneCC: string | null; company: string | null;
    roleTag: string; method: "Free" | "COD"; status: string; approvalStatus: string;
    state: RegistrationState; totalCents: number; createdAt: Date;
  };
  /** QR payload — present ONLY when the ticket is issued. */
  qrValue: string | null;
  modularAnswers: { label: string; value: string }[];
  seat: { id: string; label: string | null } | null;
  waitlist: { id: string; status: string; position: number; createdAt: Date }[];
  badgePrints: { id: string; reprint: boolean; createdAt: Date }[];
  audit: { id: string; action: string; createdAt: Date }[];
}

/**
 * Load the full registration detail for an order the session may access.
 * Throws ForbiddenError on cross-org/unauthorized access. QR is exposed only
 * when the registration state is `issued`.
 */
export async function getRegistrationDetail(
  session: SessionContext,
  id: string,
): Promise<RegistrationDetail> {
  const order = await prisma.attendeeOrder.findUnique({
    where: { id },
    include: { eventMapping: { select: { organizationId: true, localEventId: true } } },
  });
  if (!order || !canAccessEvent(session, order.eventMapping.organizationId, order.eventMapping.localEventId)) {
    throw new ForbiddenError("Registration not found or access denied");
  }

  // Event access is not enough for a sub-event-restricted session: without this
  // a workshop organiser could open any order in the event by id, which is the
  // whole attendee list one row at a time.
  const allowed = subEventScope(session);
  if (allowed !== null) {
    const codes = await Promise.all(allowed.map((id) => orderCodesForSubEvent(session, id)));
    const permitted = new Set(codes.flatMap((c) => c.codes));
    if (!permitted.has(order.orderCode)) {
      throw new ForbiddenError("Registration not found or access denied");
    }
  }

  const state = registrationState(order);
  const issued = state === "issued";

  const [answers, seat, waitlist, badgePrints, audit] = await Promise.all([
    prisma.customFormAnswer.findMany({
      where: { attendeeRef: order.orderCode },
      include: { field: { select: { labelEn: true } } },
    }),
    prisma.seatAssignment.findFirst({ where: { attendeeRef: order.orderCode } }),
    prisma.waitlistEntry.findMany({
      where: { eventMappingId: order.eventMappingId, email: order.email },
      orderBy: { createdAt: "desc" },
    }),
    prisma.badgePrintLog.findMany({
      where: { eventMappingId: order.eventMappingId, attendeeRef: order.orderCode },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "order", OR: [{ entityId: order.id }, { entityId: order.orderCode }] },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    order: {
      id: order.id, orderCode: order.orderCode,
      attendee: order.attendeeName ?? order.email, email: order.email,
      phone: order.phone, phoneCC: order.phoneCC, company: order.company,
      roleTag: order.roleTag, method: order.provider === "free" ? "Free" : "COD",
      status: order.status, approvalStatus: order.approvalStatus, state,
      totalCents: order.totalCents, createdAt: order.createdAt,
    },
    qrValue: issued ? (order.pretixSecret ?? order.orderCode) : null,
    modularAnswers: answers.map((a) => ({ label: a.field.labelEn, value: a.value })),
    seat: seat ? { id: seat.id, label: seat.label } : null,
    waitlist: waitlist.map((w) => ({ id: w.id, status: w.status, position: w.position, createdAt: w.createdAt })),
    badgePrints: badgePrints.map((b) => ({ id: b.id, reprint: b.reprint, createdAt: b.createdAt })),
    audit: audit.map((a) => ({ id: a.id, action: a.action, createdAt: a.createdAt })),
  };
}
