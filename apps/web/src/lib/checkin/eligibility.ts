import type { AttendeeApprovalStatus, AttendeeOrderStatus, AttendeeTag } from "@prisma/client";
import { registrationState } from "@/lib/approval/state";

export interface Eligibility {
  ok: boolean;
  reason?: string;
}

/** Only an issued (paid + approved/not-required) registration can be checked in. */
export function checkinEligibility(order: {
  approvalStatus: AttendeeApprovalStatus;
  status: AttendeeOrderStatus;
}): Eligibility {
  switch (registrationState(order)) {
    case "issued":
      return { ok: true };
    case "pending_payment":
      return { ok: false, reason: "Payment pending — not eligible for check-in" };
    case "pending_approval":
      return { ok: false, reason: "Awaiting approval — not eligible for check-in" };
    case "rejected":
      return { ok: false, reason: "Registration was rejected" };
    case "canceled":
      return { ok: false, reason: "Registration was canceled" };
  }
}

const TAGS: AttendeeTag[] = ["media", "partner", "staff", "speaker", "visitor"];

/** Resolve a pretix item id to its configured role tag (default visitor). */
export function tagForItem(
  itemTagMap: Record<string, unknown>,
  itemId: number,
): AttendeeTag {
  const raw = itemTagMap?.[String(itemId)];
  return TAGS.includes(raw as AttendeeTag) ? (raw as AttendeeTag) : "visitor";
}
