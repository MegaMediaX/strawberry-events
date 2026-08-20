"use server";

import { getSessionContext } from "@/lib/auth/session";
import {
  searchAttendees,
  checkInOrder,
  checkInBySecret,
  reprintBadge,
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
