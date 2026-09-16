"use server";

import { getSessionContext } from "@/lib/auth/session";
import { checkinEligibility } from "@/lib/checkin/eligibility";
import { prisma } from "@/lib/db/client";
import { getEventForSession } from "@/lib/events/service";
import { resolvePretixContext } from "@/lib/pretix/context";
import { checkinCounters } from "@/lib/pretix/checkin";
import { createWalkIn } from "@/lib/staff/walkin";
import { resolveRoleLabel, type BadgeTagValue } from "@/lib/badges/tags";
import {
  assertCanCheckin,
  assertDoorRoleInOrg,
  recordPrintOutcome,
  searchAttendees,
  checkInOrder,
  checkInBySecret,
  reprintBadge,
  updateAttendeeDetails,
  getAttendeeForEdit,
  type AttendeeForEdit,
  type AttendeeCorrection,
  type CheckInResult,
} from "@/lib/checkin/service";

/**
 * The one shape for "this door has no session any more".
 *
 * Every action opens with it, and the panel gives it its own banner rather than
 * printing it as the reason an attendee was refused — see CheckInResult.
 */
const NOT_AUTHENTICATED: CheckInResult = {
  ok: false,
  authExpired: true,
  reason: "Your session has ended. Sign in again to keep checking people in.",
};

/**
 * What the door is told when something failed for reasons the door cannot see.
 *
 * `reason` is printed as the explanation for turning a person away, so it must
 * be a sentence an operator can act on. It used to be `(err as Error).message`:
 * whatever the database driver or HTTP client happened to say, clipped to one
 * line under a headline reading STOP. The real error goes to the console, where
 * whoever is debugging a bad morning will look for it.
 */
function doorFailure(err: unknown, context: string, advice: string): CheckInResult {
  console.error(`[door] ${context} failed`, err);
  return { ok: false, reason: advice };
}

export interface AttendeeRow {
  orderCode: string;
  email: string;
  name: string | null;
  phone: string | null;
  /**
   * Whether this order can actually be checked in, and why not.
   *
   * The row used to carry name, code and phone only — so an operator pressed
   * "Check in & print" on a cancelled or unapproved order and learned from a
   * red banner, with the person watching. Both columns were already on the row
   * the query returned. Decided with `checkinEligibility`, the same function
   * the server applies, so the row and the refusal can never disagree.
   */
  eligible: boolean;
  ineligibleReason?: string;
}

export type SearchResult =
  | { ok: true; rows: AttendeeRow[] }
  /** No session behind the call — see NOT_AUTHENTICATED. */
  | { ok: false; authExpired: true }
  /** The query itself failed. Distinct from "nobody matched": see below. */
  | { ok: false; failed: true };

export async function searchAction(
  eventId: string,
  query: string,
): Promise<SearchResult> {
  // Never throws. The door renders a "Searching…" indicator while this is in
  // flight; a rejected promise leaves that indicator up forever with no error
  // and no way back, in the primary find-by-name flow. An empty list is a far
  // better failure than a permanently spinning one.
  //
  // Neither an expired session NOR a failed query is an empty list, though.
  // Reported as one, either reads as "this person never registered" — and the
  // door's answer to that is the walk-in form, so a lapsed session or a
  // refused query would end in a second registration for someone who already
  // has one.
  try {
    const session = await getSessionContext();
    if (!session) return { ok: false, authExpired: true };
    if (!query.trim()) return { ok: true, rows: [] };
    const rows = await searchAttendees(session, eventId, query.trim());
    return {
      ok: true,
      rows: rows.map((r) => {
        const eligibility = checkinEligibility(r);
        return {
          orderCode: r.orderCode,
          email: r.email,
          name: r.attendeeName,
          phone: r.phone,
          eligible: eligibility.ok,
          ineligibleReason: eligibility.reason,
        };
      }),
    };
  } catch (err) {
    // A ForbiddenError or a database failure, not an absence of matches.
    console.error(`[door] searchAttendees failed (event=${eventId})`, err);
    return { ok: false, failed: true };
  }
}

export async function checkInAction(
  eventId: string,
  orderCode: string,
  listId: number,
): Promise<CheckInResult> {
  try {
    const session = await getSessionContext();
    if (!session) return NOT_AUTHENTICATED;
    return await checkInOrder(session, eventId, orderCode, listId);
  } catch (err) {
    return doorFailure(
      err,
      `checkInOrder (event=${eventId}, order=${orderCode})`,
      "Check-in failed — try again. If it keeps failing, send them to the help desk and note the order code.",
    );
  }
}

/**
 * Check in from a scanned QR.
 *
 * Two payloads arrive here: the pretix e-ticket QR (a pretix secret) and the
 * printed badge QR (a contact-profile URL carrying a badgeSlug). `checkInBySecret`
 * resolves both, trying the secret first.
 */
export async function scanAction(
  eventId: string,
  secret: string,
  listId: number,
): Promise<CheckInResult> {
  try {
    const session = await getSessionContext();
    if (!session) return NOT_AUTHENTICATED;
    return await checkInBySecret(session, eventId, secret, listId);
  } catch (err) {
    return doorFailure(
      err,
      `checkInBySecret (event=${eventId})`,
      "Scan failed — try again, or find them by name.",
    );
  }
}

/** Reprint a badge without re-checking-in (already-checked-in attendees). */
export async function reprintAction(
  eventId: string,
  orderCode: string,
): Promise<CheckInResult> {
  try {
    const session = await getSessionContext();
    if (!session) return NOT_AUTHENTICATED;
    return await reprintBadge(session, eventId, orderCode);
  } catch (err) {
    return doorFailure(
      err,
      `reprintBadge (event=${eventId}, order=${orderCode})`,
      "Reprint failed — check whether a badge came out before trying again.",
    );
  }
}

/**
 * Correct an attendee's printed details at the door.
 *
 * Not a check-in: nothing is redeemed and no badge print is logged. It returns
 * NO badge either — the caller goes through the ordinary reprint path, which
 * already refuses a badge for a cancelled or unpaid order and records the print.
 */
export async function correctAttendeeAction(
  eventId: string,
  orderCode: string,
  patch: AttendeeCorrection,
): Promise<CheckInResult> {
  try {
    const session = await getSessionContext();
    if (!session) return NOT_AUTHENTICATED;
    return await updateAttendeeDetails(session, eventId, orderCode, patch);
  } catch (err) {
    return doorFailure(
      err,
      `updateAttendeeDetails (event=${eventId}, order=${orderCode})`,
      "Could not save the correction — check their details before trying again; it may not have saved.",
    );
  }
}

/** Load one attendee's correctable details, for the door's Fix form. */
export async function attendeeForEditAction(
  eventId: string,
  orderCode: string,
): Promise<
  | { ok: true; attendee: AttendeeForEdit }
  | { ok: false; reason: string; authExpired?: true }
> {
  try {
    const session = await getSessionContext();
    // Carries the flag, not just the words: without it the panel routed this
    // one path to the red STOP banner — the exact failure the rest of this
    // change removes.
    if (!session) {
      return { ok: false, reason: NOT_AUTHENTICATED.reason!, authExpired: true };
    }
    return { ok: true, attendee: await getAttendeeForEdit(session, eventId, orderCode) };
  } catch (err) {
    console.error(`[door] getAttendeeForEdit failed (event=${eventId}, order=${orderCode})`, err);
    return { ok: false, reason: "Could not open their details — try Fix again." };
  }
}

export interface DoorWalkIn {
  firstName: string;
  lastName: string;
  email?: string;
  phoneCC?: string;
  phone?: string;
  company?: string | null;
  jobTitle?: string | null;
  roleTag: BadgeTagValue;
  /** Required when roleTag is `other`; it is what the band prints. */
  roleLabel?: string | null;
  itemId: number;
}

/**
 * Register someone at the door and check them in, in one action.
 *
 * The walk-in desk was a separate page: register there, then come back to
 * check-in, find them, and check them in. Two screens and a search for a person
 * already standing in front of you. This is the same two operations, in the
 * order a door actually performs them.
 *
 * They are deliberately NOT wrapped in a transaction — pretix has already
 * created a real order by the time the check-in runs, and there is nothing to
 * roll back to. If the check-in half fails the registration still stands, and
 * the message says so: the person exists and can be found by name.
 */
export async function walkInAndCheckInAction(
  eventId: string,
  input: DoorWalkIn,
  listId: number,
): Promise<CheckInResult> {
  // Wrapped like every sibling action. An uncaught throw here never reaches the
  // caller's .then(), so the form's busy flag is never cleared and the walk-in
  // form stays dead until the page is reloaded — mid-event, mid-queue.
  let session;
  try {
    session = await getSessionContext();
  } catch (err) {
    return doorFailure(err, "getSessionContext", "Could not register them — try again.");
  }
  if (!session) return NOT_AUTHENTICATED;

  // Strict here, lenient in register(). The operator is standing at the door
  // with the person in front of them, so an `other` with no text is a mistake
  // that can be fixed in two seconds — not something to paper over with a band
  // reading OTHER. A malformed client cannot get past this either.
  const role = resolveRoleLabel(input.roleTag, input.roleLabel);
  if (!role.ok) return { ok: false, reason: role.error };

  let orderCode: string;
  try {
    const created = await createWalkIn(session, {
      eventId,
      itemId: input.itemId,
      roleTag: input.roleTag,
      roleLabel: role.value,
      attendee: {
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        phoneCC: input.phoneCC,
        phone: input.phone,
        company: input.company ?? null,
        jobTitle: input.jobTitle ?? null,
      },
    });
    orderCode = created.orderCode;
  } catch (err) {
    return doorFailure(
      err,
      `createWalkIn (event=${eventId})`,
      "Could not register them — search their name before retrying, in case the order was created.",
    );
  }

  try {
    const res = await checkInOrder(session, eventId, orderCode, listId);
    if (!res.ok) {
      return {
        ok: false,
        registeredOrderCode: orderCode,
        reason: `Registered as ${orderCode}, but check-in failed: ${res.reason ?? "unknown"}.`,
      };
    }
    return res;
  } catch (err) {
    // The order EXISTS — that half succeeded — so the code stays in the message
    // whatever went wrong afterwards. Only the cause is withheld.
    console.error(`[door] walk-in check-in failed (event=${eventId}, order=${orderCode})`, err);
    return {
      ok: false,
      registeredOrderCode: orderCode,
      reason: `Registered as ${orderCode}, but check-in failed.`,
    };
  }
}

export interface DoorCounters {
  total: number;
  checkedIn: number;
}

/**
 * The door's running count, for the panel to poll.
 *
 * The header number was rendered once, server-side, and the panel below it
 * never causes the page to re-render — so after an hour of scanning the screen
 * still showed the figure from before the doors opened, which is the figure
 * staff are asked for all day.
 *
 * Returns null rather than throwing on any failure: a count that cannot be
 * fetched must leave the last known one on screen, not replace it with zeros
 * and not take the lane down.
 */
export async function counterAction(
  eventId: string,
  listId: number,
): Promise<DoorCounters | null> {
  try {
    const session = await getSessionContext();
    if (!session || !listId) return null;
    // Event access alone is what every org-scoped member has — finance
    // included. Check-in counts are door data, so they take the door's own
    // authorization, the same assertion the service applies to every other
    // operation on this screen. It throws, and the catch below turns that into
    // "no figure available" rather than a broken header.
    assertCanCheckin(session);
    const mapping = await getEventForSession(session, eventId);
    if (!mapping) return null;
    // ...and the same role again in THIS event's organization. The assertion
    // above is satisfied by a check-in membership anywhere, which is how a
    // finance member of this org reached these counts on the strength of a
    // door role held somewhere else entirely.
    assertDoorRoleInOrg(session, mapping.organizationId);
    const org = await prisma.organization.findUniqueOrThrow({
      where: { id: mapping.organizationId },
    });
    const ctx = resolvePretixContext(org);
    return await checkinCounters(
      ctx.organizerSlug,
      mapping.pretixEventSlug,
      listId,
      ctx.token,
    );
  } catch (err) {
    console.error(`[door] counterAction failed (event=${eventId}, list=${listId})`, err);
    return null;
  }
}

/**
 * Tell the server what the printer did with a badge it dispatched.
 *
 * Fire-and-forget from the door's point of view: the attendee is already
 * through, and nothing on screen depends on this landing. It returns nothing
 * and swallows its own failures, so a bookkeeping error can never surface as a
 * refusal in front of a queue.
 */
export async function printOutcomeAction(
  eventId: string,
  printLogId: string,
  failureReason: string | null,
): Promise<void> {
  try {
    const session = await getSessionContext();
    if (!session) return;
    await recordPrintOutcome(session, eventId, printLogId, failureReason);
  } catch (err) {
    console.error(`[door] printOutcomeAction failed (event=${eventId}, log=${printLogId})`, err);
  }
}
