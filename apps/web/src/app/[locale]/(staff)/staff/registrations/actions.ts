"use server";

import { getSessionContext } from "@/lib/auth/session";
import { createWalkIn } from "@/lib/staff/walkin";

export interface WalkInActionInput {
  itemId: number;
  roleTag: "media" | "partner" | "staff" | "speaker" | "visitor";
  locale?: "en" | "ar";
  attendee: {
    firstName: string;
    lastName: string;
    email: string;
    phoneCC?: string;
    phone?: string;
    company?: string | null;
  };
  seatIds?: string[];
}

export interface WalkInActionResult {
  ok: boolean;
  orderCode?: string;
  status?: "pending" | "paid";
  approvalStatus?: "not_required" | "pending";
  error?: string;
}

export async function walkInAction(
  eventId: string,
  input: WalkInActionInput,
): Promise<WalkInActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };
  try {
    const r = await createWalkIn(session, { eventId, ...input });
    return { ok: true, orderCode: r.orderCode, status: r.status, approvalStatus: r.approvalStatus };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
