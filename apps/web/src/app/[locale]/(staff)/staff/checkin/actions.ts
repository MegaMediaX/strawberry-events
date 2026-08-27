"use server";

import { getSessionContext } from "@/lib/auth/session";
import { createWalkIn } from "@/lib/staff/walkin";
import { resolveRoleLabel, type BadgeTagValue } from "@/lib/badges/tags";
import {
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

export interface AttendeeRow {
  orderCode: string;
  email: string;
  name: string | null;
  phone: string | null;
}

export async function searchAction(
  eventId: string,
  query: string,
): Promise<AttendeeRow[]> {
  // Never throws. The door renders a "Searching…" indicator while this is in
  // flight; a rejected promise leaves that indicator up forever with no error
  // and no way back, in the primary find-by-name flow. An empty list is a far
  // better failure than a permanently spinning one.
  try {
    const session = await getSessionContext();
    if (!session || !query.trim()) return [];
    const rows = await searchAttendees(session, eventId, query.trim());
    return rows.map((r) => ({
      orderCode: r.orderCode,
      email: r.email,
      name: r.attendeeName,
      phone: r.phone,
    }));
  } catch {
    return [];
  }
}

export async function checkInAction(
  eventId: string,
  orderCode: string,
  listId: number,
): Promise<CheckInResult> {
  try {
    const session = await getSessionContext();
    if (!session) return { ok: false, reason: "Not authenticated" };
    return await checkInOrder(session, eventId, orderCode, listId);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
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
    if (!session) return { ok: false, reason: "Not authenticated" };
    return await checkInBySecret(session, eventId, secret, listId);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/** Reprint a badge without re-checking-in (already-checked-in attendees). */
export async function reprintAction(
  eventId: string,
  orderCode: string,
): Promise<CheckInResult> {
  try {
    const session = await getSessionContext();
    if (!session) return { ok: false, reason: "Not authenticated" };
    return await reprintBadge(session, eventId, orderCode);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
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
    if (!session) return { ok: false, reason: "Not authenticated" };
    return await updateAttendeeDetails(session, eventId, orderCode, patch);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/** Load one attendee's correctable details, for the door's Fix form. */
export async function attendeeForEditAction(
  eventId: string,
  orderCode: string,
): Promise<{ ok: true; attendee: AttendeeForEdit } | { ok: false; reason: string }> {
  try {
    const session = await getSessionContext();
    if (!session) return { ok: false, reason: "Not authenticated" };
    return { ok: true, attendee: await getAttendeeForEdit(session, eventId, orderCode) };
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
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
    return { ok: false, reason: (err as Error).message };
  }
  if (!session) return { ok: false, reason: "Not authenticated" };

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
    return { ok: false, reason: (err as Error).message };
  }

  try {
    const res = await checkInOrder(session, eventId, orderCode, listId);
    if (!res.ok) {
      return {
        ok: false,
        reason: `Registered as ${orderCode}, but check-in failed: ${res.reason ?? "unknown"}. Find them by name to retry.`,
      };
    }
    return res;
  } catch (err) {
    return {
      ok: false,
      reason: `Registered as ${orderCode}, but check-in failed: ${(err as Error).message}. Find them by name to retry.`,
    };
  }
}
