import type { AttendeeOrder, AttendeeTag } from "@prisma/client";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixCheckin from "@/lib/pretix/checkin";
import { emit } from "@/lib/webhooks/service";
import { generateBadgeSlug, resolveBadgeSlug } from "./badge-slug";
import { JOB_TITLE_MAX, JOB_TITLE_OTHER } from "@/lib/registration/job-title";
import { BADGE_TAGS, type BadgeTagValue } from "@/lib/badges/tags";
import { checkinEligibility } from "./eligibility";

export interface CheckInResult {
  ok: boolean;
  reason?: string;
  badge?: {
    orderCode: string;
    tag: AttendeeTag;
    secret: string | null;
    fullName: string;
    company: string | null;
    /** Printed under the company. Null for everyone who was never asked. */
    jobTitle: string | null;
    /** Drives the printed contact-profile QR. Null only for legacy rows. */
    badgeSlug: string | null;
  };
  /**
   * Set ONLY when pretix refused because this ticket is already redeemed for
   * this list. Carries who it was, so the door can name them and offer a
   * reprint — a lost or torn badge is the common case, and without this the
   * only signal is "already redeemed" with no way to act on it.
   *
   * Deliberately NOT `badge`: this is a refusal, and `handleResult` prints on
   * `ok && badge`. Reprinting must stay an explicit, confirmed action.
   */
  alreadyCheckedIn?: { orderCode: string; fullName: string };
}

function assertCanCheckin(session: SessionContext) {
  if (session.impersonating) {
    throw new ForbiddenError("Cannot check in while impersonating");
  }
  if (!hasAnyRole(session, ["checkin_staff", "organizer_admin"])) {
    throw new ForbiddenError("Requires check-in staff or organizer admin");
  }
}

async function resolveEvent(session: SessionContext, eventId: string) {
  const mapping = await prisma.eventMapping.findUnique({ where: { id: eventId } });
  if (
    !mapping ||
    !canAccessEvent(session, mapping.organizationId, mapping.localEventId)
  ) {
    throw new ForbiddenError("Event not found or access denied");
  }
  return mapping;
}

/** Search attendees within an event the session can access. */
export async function searchAttendees(
  session: SessionContext,
  eventId: string,
  query: string,
) {
  // Enforce check-in role at the service layer: the layout guard is UI-only,
  // but server actions are directly invocable, so a finance member could
  // otherwise harvest attendee PII (orderCode/email/name) through searchAction.
  assertCanCheckin(session);
  const mapping = await resolveEvent(session, eventId);
  return searchAttendeeOrders(mapping.id, query);
}

/**
 * Minimum trigram word-similarity for a name to count as a fuzzy match.
 * "mohamad" vs "mouhamad" scores ~0.55, so 0.3 catches typos/spelling variants
 * comfortably while keeping unrelated names out. Tunable.
 */
export const NAME_SIMILARITY_THRESHOLD = 0.3;

/**
 * Search attendees within one event, typo-tolerantly.
 *
 * - order code / email / name: case-insensitive substring (exact-ish hits)
 * - name also: pg_trgm word_similarity, so "mohamad" matches "mouhamad"
 * - phone: digit-normalized on BOTH sides, so "+961 70 123 456", "70-123-456"
 *   and "70123456" all match a stored "70 123 456"
 *
 * Results are ranked by best name similarity first (exact substring = 1),
 * then most recent. Trigram GIN indexes (see the add_trgm_fuzzy_search
 * migration) keep this fast.
 *
 * UNAUTHORIZED BY DESIGN: this takes no SessionContext and returns attendee PII.
 * It is the query half of searchAttendees(), which does the role + event check.
 * Never call it from a server action or route handler directly — that would hand
 * out attendee PII to any authenticated session, finance included.
 */
export function searchAttendeeOrders(
  eventMappingId: string,
  query: string,
): Promise<AttendeeOrder[]> {
  const q = query.trim();
  const like = `%${q}%`;
  const digits = q.replace(/\D/g, "");
  const phoneClause =
    digits.length >= 3
      ? Prisma.sql`OR regexp_replace(coalesce("phone", ''), '\D', '', 'g') LIKE ${`%${digits}%`}`
      : Prisma.empty;

  return prisma.$queryRaw<AttendeeOrder[]>`
    SELECT *
    FROM "attendee_orders"
    WHERE "eventMappingId" = ${eventMappingId}
      AND (
        "orderCode" ILIKE ${like}
        OR "email" ILIKE ${like}
        OR "attendeeName" ILIKE ${like}
        OR word_similarity(${q}, coalesce("attendeeName", '')) >= ${NAME_SIMILARITY_THRESHOLD}
        ${phoneClause}
      )
    ORDER BY
      GREATEST(
        CASE WHEN "attendeeName" ILIKE ${like} THEN 1 ELSE 0 END,
        word_similarity(${q}, coalesce("attendeeName", ''))
      ) DESC,
      "createdAt" DESC
    LIMIT 25
  `;
}

/** Badge payload for the print template (ZPL + on-screen) from an order. */
function badgeOf(order: AttendeeOrder): NonNullable<CheckInResult["badge"]> {
  return {
    orderCode: order.orderCode,
    tag: order.roleTag,
    secret: order.pretixSecret,
    fullName: order.attendeeName ?? order.email,
    company: order.company,
    jobTitle: order.jobTitle,
    badgeSlug: order.badgeSlug,
  };
}

/**
 * Return the order's badge slug, minting one on first print if the backfill
 * never reached this row (an order created after the migration ran, say).
 *
 * Assigned lazily at PRINT time, not at registration, because that is the
 * moment the code becomes physical. Once written it is never rotated: the slug
 * is on a badge someone is wearing, and changing it would 404 a page they may
 * already have shared.
 *
 * A collision is a lost race against the unique index, not a failure — re-read
 * and use whatever won, or try once more. 40 bits over 812 rows makes this
 * effectively unreachable; it is here so that if it ever does happen the door
 * keeps working.
 */
async function ensureBadgeSlug(order: AttendeeOrder): Promise<string | null> {
  if (order.badgeSlug) return order.badgeSlug;

  // EVERYTHING here is inside one try. This function runs AFTER pretix has
  // already redeemed the ticket and after the badge-print and audit rows are
  // committed — so an exception escaping this point would report a failure for
  // someone who is, in pretix, checked in. Staff would re-scan, pretix would
  // correctly answer "already redeemed", and a paying attendee would be stuck
  // at the door while no badge ever printed.
  //
  // The earlier version guarded only the write and left the re-read bare, which
  // is exactly that bug. A slug is a decoration; entry is not.
  try {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const candidate = generateBadgeSlug();
      try {
        // updateMany, not update: this is a compare-and-set. `badgeSlug: null`
        // is a filter rather than a unique lookup, so only the first concurrent
        // print wins and the rest see count 0 and re-read. `update` cannot
        // express that — its where clause takes unique fields only.
        const { count } = await prisma.attendeeOrder.updateMany({
          where: { id: order.id, badgeSlug: null },
          data: { badgeSlug: candidate },
        });
        if (count === 1) return candidate;
      } catch (err) {
        // P2002 is the unique violation this retry loop exists for: the
        // candidate belongs to another order, so pick a different one.
        // Anything else — a missing column mid-migration, a dead connection —
        // is NOT a lost race, and silently treating it as one hides a real
        // outage behind a missing QR.
        if ((err as { code?: string }).code !== "P2002") throw err;
      }

      const fresh = await prisma.attendeeOrder.findUnique({
        where: { id: order.id },
        select: { badgeSlug: true },
      });
      if (fresh?.badgeSlug) return fresh.badgeSlug;
    }
  } catch (err) {
    // Loud, because a silent failure here means badges quietly stop carrying
    // QR codes mid-event and nobody finds out until attendees complain.
    console.error(
      `[checkin] could not assign a badge slug to order ${order.orderCode}:`,
      (err as Error).message,
    );
  }

  // Printing a badge without a QR beats refusing entry over a decoration.
  return null;
}

/**
 * Core check-in for an already-resolved order: validates eligibility, redeems
 * against the pretix check-in list (source of truth), logs the badge print,
 * audits, and emits webhooks. Shared by order-code and QR-secret entry points.
 */
async function checkInResolvedOrder(
  session: SessionContext,
  mapping: { id: string; organizationId: string; pretixEventSlug: string },
  order: AttendeeOrder,
  listId: number,
): Promise<CheckInResult> {
  const elig = checkinEligibility(order);
  if (!elig.ok) return { ok: false, reason: elig.reason };

  const org = await prisma.organization.findUnique({
    where: { id: mapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);

  const redeem = await pretixCheckin.redeemCheckin(
    ctx.organizerSlug,
    mapping.pretixEventSlug,
    listId,
    order.pretixSecret ?? order.orderCode,
    ctx.token,
  );
  if (redeem.status !== "ok") {
    // pretix tracks redemption PER LIST, so this means "already in, on this
    // day" — not "already in the building". Name them and let the door decide.
    const alreadyRedeemed = /already|redeemed/i.test(redeem.reason ?? "");
    return {
      ok: false,
      reason: redeem.reason ?? "Check-in failed",
      ...(alreadyRedeemed
        ? {
            alreadyCheckedIn: {
              orderCode: order.orderCode,
              fullName: order.attendeeName ?? order.email,
            },
          }
        : {}),
    };
  }

  await prisma.badgePrintLog.create({
    data: {
      eventMappingId: mapping.id,
      attendeeRef: order.orderCode,
      printedByUserId: session.userId,
      reprint: false,
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: mapping.organizationId,
      actorUserId: session.userId,
      action: "attendee.checked_in",
      entityType: "order",
      entityId: order.id,
    },
  });

  void emit(mapping.organizationId, "checkin.created", { orderCode: order.orderCode }, mapping.id);
  void emit(mapping.organizationId, "badge.printed", { orderCode: order.orderCode }, mapping.id);

  // Mint the slug only once the check-in has actually succeeded, so a refused
  // scan does not burn a code onto a row whose badge was never printed.
  const badgeSlug = await ensureBadgeSlug(order);
  return { ok: true, badge: { ...badgeOf(order), badgeSlug } };
}

/**
 * Check in an attendee by order code (manual search → Check in / Print).
 */
export async function checkInOrder(
  session: SessionContext,
  eventId: string,
  orderCode: string,
  listId: number,
): Promise<CheckInResult> {
  assertCanCheckin(session);
  const mapping = await resolveEvent(session, eventId);

  const order = await prisma.attendeeOrder.findFirst({
    where: { eventMappingId: mapping.id, orderCode },
  });
  if (!order) throw new ForbiddenError("Registration not found");

  return checkInResolvedOrder(session, mapping, order, listId);
}

/**
 * Check in an attendee by a scanned code (camera scan path).
 *
 * Two payloads reach here. The e-ticket QR, which pretix issues and which
 * encodes `pretixSecret`, and the printed BADGE QR, which encodes a
 * contact-profile URL carrying a `badgeSlug`. Both resolve to an order; the
 * secret is tried first so a slug can never shadow the real credential.
 */
export async function checkInBySecret(
  session: SessionContext,
  eventId: string,
  secret: string,
  listId: number,
): Promise<CheckInResult> {
  assertCanCheckin(session);
  const mapping = await resolveEvent(session, eventId);

  const trimmed = secret.trim();
  if (!trimmed) return { ok: false, reason: "Empty QR code" };

  let order = await prisma.attendeeOrder.findFirst({
    where: { eventMappingId: mapping.id, pretixSecret: trimmed },
  });

  // The badge QR carries a contact-profile URL, not the pretix secret. Door
  // staff scan the badge — especially on days two and three, when everyone is
  // already wearing one — so a scan that is not a secret gets a second look as
  // a badge slug before we refuse it. Without this the whole event fails closed
  // the second morning.
  //
  // Secret first, deliberately: it is the pretix-issued credential, and a slug
  // shaped like one must never shadow it. `badgeProfileRevokedAt` is NOT
  // consulted here — taking a profile offline is a privacy action and must
  // never cost someone entry to an event they paid for.
  if (!order) {
    const slug = resolveBadgeSlug(trimmed);
    if (slug) {
      order = await prisma.attendeeOrder.findFirst({
        where: { eventMappingId: mapping.id, badgeSlug: slug },
      });
    }
  }

  if (!order) {
    return { ok: false, reason: "QR not recognized for this event" };
  }

  return checkInResolvedOrder(session, mapping, order, listId);
}

/**
 * Reprint a badge WITHOUT re-checking-in. For someone already checked in whose
 * badge was lost/misprinted: no pretix redeem, logs the print as a reprint, and
 * audits. Still requires the registration to be issued (eligible).
 */
export async function reprintBadge(
  session: SessionContext,
  eventId: string,
  orderCode: string,
): Promise<CheckInResult> {
  assertCanCheckin(session);
  const mapping = await resolveEvent(session, eventId);

  const order = await prisma.attendeeOrder.findFirst({
    where: { eventMappingId: mapping.id, orderCode },
  });
  if (!order) throw new ForbiddenError("Registration not found");

  const elig = checkinEligibility(order);
  if (!elig.ok) return { ok: false, reason: elig.reason };

  await prisma.badgePrintLog.create({
    data: {
      eventMappingId: mapping.id,
      attendeeRef: order.orderCode,
      printedByUserId: session.userId,
      reprint: true,
    },
  });
  await prisma.auditLog.create({
    data: {
      organizationId: mapping.organizationId,
      actorUserId: session.userId,
      action: "badge.reprinted",
      entityType: "order",
      entityId: order.id,
    },
  });

  void emit(mapping.organizationId, "badge.printed", { orderCode: order.orderCode }, mapping.id);

  // Mint the slug only once the check-in has actually succeeded, so a refused
  // scan does not burn a code onto a row whose badge was never printed.
  const badgeSlug = await ensureBadgeSlug(order);
  return { ok: true, badge: { ...badgeOf(order), badgeSlug } };
}

/** Live counters for a check-in list (pretix source of truth). */
export async function liveCounters(
  session: SessionContext,
  eventId: string,
  listId: number,
) {
  // Same reasoning as searchAttendees: resolveEvent() alone is NOT a role gate.
  // canAccessEvent() grants organizer_admin AND finance org-wide event access, so
  // without this a finance member could read live door numbers (turnout, no-show
  // rate, arrival pacing) for any event in the org through a directly-invocable
  // server action. Counters are check-in operational data, not finance data.
  assertCanCheckin(session);
  const mapping = await resolveEvent(session, eventId);
  const org = await prisma.organization.findUnique({
    where: { id: mapping.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);
  return pretixCheckin.checkinCounters(ctx.organizerSlug, mapping.pretixEventSlug, listId, ctx.token);
}

/**
 * Everything a door operator may correct on someone standing in front of them:
 * their name, how to reach them, who they are with, and which badge they get.
 *
 * An absent key means "leave it alone". An empty string means "clear it" —
 * which is why company, jobTitle and phone are clearable and fullName is not:
 * a badge with no name is worse than a badge with a misspelt one.
 *
 * NOT here, and not an oversight: order status, approval, tickets, seats,
 * pretixSecret and badgeSlug. Those live in pretix or are the credentials the
 * badge is built from — changing them locally would put this database and
 * pretix into two different opinions about the same order, mid-event, with no
 * way to tell which is right.
 */
/** Ceiling for door-entered free text. Generous for a real name, far under a paste. */
const FREE_TEXT_MAX = 120;

export interface AttendeeCorrection {
  fullName?: string;
  email?: string;
  phone?: string;
  phoneCC?: string;
  company?: string;
  jobTitle?: string;
  roleTag?: BadgeTagValue;
}

/**
 * Correct an attendee's printed details at the door, and hand back a badge
 * ready to reprint.
 *
 * Deliberately NOT a check-in: it redeems nothing in pretix, logs no badge
 * print, and does not change eligibility. Staff use it when someone's name was
 * mistyped at registration or they never gave a job title — then reprint.
 */
export async function updateAttendeeDetails(
  session: SessionContext,
  eventId: string,
  orderCode: string,
  patch: AttendeeCorrection,
): Promise<CheckInResult> {
  assertCanCheckin(session);
  const mapping = await resolveEvent(session, eventId);

  const order = await prisma.attendeeOrder.findFirst({
    where: { eventMappingId: mapping.id, orderCode },
  });
  if (!order) throw new ForbiddenError("Registration not found");

  // Built key by key rather than spread, so a field the caller was never
  // allowed to send cannot reach Prisma by riding along on the object.
  const data: {
    attendeeName?: string;
    email?: string;
    phone?: string | null;
    phoneCC?: string | null;
    company?: string | null;
    jobTitle?: string | null;
    roleTag?: BadgeTagValue;
  } = {};

  // Free text from a door has no natural ceiling, and these columns are
  // unbounded TEXT. Nothing downstream can be injected — sanitizeZplText
  // strips ZPL control prefixes and non-Latin-1 before anything prints — but a
  // pasted blob would still land in the database, the CSV and the roster.
  const tooLong = (v: string, max: number) => v.length > max;

  if (patch.fullName !== undefined) {
    const name = patch.fullName.trim();
    if (!name) return { ok: false, reason: "A name is required." };
    if (tooLong(name, FREE_TEXT_MAX)) return { ok: false, reason: "That name is too long." };
    data.attendeeName = name;
  }
  if (patch.email !== undefined) {
    const email = patch.email.trim();
    // A blank email is allowed (walk-ins get a synthesised one), but a
    // malformed one is not: it flows to the ticket mail and to pretix.
    if (tooLong(email, FREE_TEXT_MAX)) return { ok: false, reason: "That email address is too long." };
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, reason: "That email address is not valid." };
    }
    if (email) data.email = email;
  }
  if (patch.phone !== undefined) {
    const phone = patch.phone.trim();
    if (tooLong(phone, 32)) return { ok: false, reason: "That phone number is too long." };
    data.phone = phone || null;
  }
  if (patch.phoneCC !== undefined) {
    const cc = patch.phoneCC.trim();
    if (tooLong(cc, 8)) return { ok: false, reason: "That country code is too long." };
    data.phoneCC = cc || null;
  }
  if (patch.roleTag !== undefined) {
    if (!(BADGE_TAGS as readonly string[]).includes(patch.roleTag)) {
      return { ok: false, reason: "That is not a badge role." };
    }
    data.roleTag = patch.roleTag;
  }
  if (patch.company !== undefined) {
    const company = patch.company.trim();
    if (tooLong(company, FREE_TEXT_MAX)) return { ok: false, reason: "That company name is too long." };
    data.company = company || null;
  }
  if (patch.jobTitle !== undefined) {
    const title = patch.jobTitle.trim();
    if (title === JOB_TITLE_OTHER) {
      return { ok: false, reason: "Enter the job title, not \"Other\"." };
    }
    if (title.length > JOB_TITLE_MAX) {
      return { ok: false, reason: `Job title must be ${JOB_TITLE_MAX} characters or fewer.` };
    }
    data.jobTitle = title || null;
  }

  if (Object.keys(data).length === 0) return { ok: false, reason: "Nothing to change." };

  const updated = await prisma.attendeeOrder.update({ where: { id: order.id }, data });

  // before/after carry only the fields this action can touch, so the row reads
  // as "what an operator corrected" rather than a dump of the attendee.
  const pick = (o: AttendeeOrder) => ({
    attendeeName: o.attendeeName,
    email: o.email,
    phone: o.phone,
    phoneCC: o.phoneCC,
    company: o.company,
    jobTitle: o.jobTitle,
    roleTag: o.roleTag,
  });
  await prisma.auditLog.create({
    data: {
      organizationId: mapping.organizationId,
      eventMappingId: mapping.id,
      actorUserId: session.userId,
      action: "attendee.details_corrected",
      entityType: "order",
      entityId: order.id,
      before: pick(order),
      after: pick(updated),
    },
  });

  return { ok: true, badge: badgeOf(updated) };
}

/** Everything the door's correction form needs to open pre-filled. */
export interface AttendeeForEdit {
  orderCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  phoneCC: string | null;
  company: string | null;
  jobTitle: string | null;
  roleTag: BadgeTagValue;
}

/**
 * Read the correctable details for one order.
 *
 * Separate from the badge payload on purpose: a badge carries what is PRINTED,
 * and email and phone are not. Widening the badge to prefill a form would put
 * contact details into every check-in response, the recent list and the print
 * fallback — places that have no use for them.
 */
export async function getAttendeeForEdit(
  session: SessionContext,
  eventId: string,
  orderCode: string,
): Promise<AttendeeForEdit> {
  assertCanCheckin(session);
  const mapping = await resolveEvent(session, eventId);
  const order = await prisma.attendeeOrder.findFirst({
    where: { eventMappingId: mapping.id, orderCode },
    select: {
      orderCode: true, attendeeName: true, email: true, phone: true,
      phoneCC: true, company: true, jobTitle: true, roleTag: true,
    },
  });
  if (!order) throw new ForbiddenError("Registration not found");
  return {
    orderCode: order.orderCode,
    fullName: order.attendeeName ?? order.email,
    email: order.email,
    phone: order.phone,
    phoneCC: order.phoneCC,
    company: order.company,
    jobTitle: order.jobTitle,
    roleTag: order.roleTag as BadgeTagValue,
  };
}
