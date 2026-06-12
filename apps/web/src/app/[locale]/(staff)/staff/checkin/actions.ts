"use server";

import { getSessionContext } from "@/lib/auth/session";
import { searchAttendees, checkInOrder, type CheckInResult } from "@/lib/checkin/service";

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
