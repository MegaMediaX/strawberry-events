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
  const session = await getSessionContext();
  if (!session || !query.trim()) return [];
  const rows = await searchAttendees(session, eventId, query.trim());
  return rows.map((r) => ({
    orderCode: r.orderCode,
    email: r.email,
    name: r.attendeeName,
    phone: r.phone,
  }));
}

export async function checkInAction(
  eventId: string,
  orderCode: string,
  listId: number,
): Promise<CheckInResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, reason: "Not authenticated" };
  try {
    return await checkInOrder(session, eventId, orderCode, listId);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}

/** Check in from a scanned QR (the badge encodes the pretix secret). */
export async function scanAction(
  eventId: string,
  secret: string,
  listId: number,
): Promise<CheckInResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, reason: "Not authenticated" };
  try {
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
  const session = await getSessionContext();
  if (!session) return { ok: false, reason: "Not authenticated" };
  try {
    return await reprintBadge(session, eventId, orderCode);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }
}
