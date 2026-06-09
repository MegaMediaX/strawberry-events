import type {
  AttendeeApprovalStatus,
  AttendeeOrderStatus,
  ApprovalMode,
} from "@prisma/client";

export type RegistrationState =
  | "pending_approval"
  | "rejected"
  | "pending_payment"
  | "issued"
  | "canceled";

/** Derive the attendee-facing registration state from approval + payment status. */
export function registrationState(order: {
  approvalStatus: AttendeeApprovalStatus;
  status: AttendeeOrderStatus;
}): RegistrationState {
  if (order.approvalStatus === "pending") return "pending_approval";
  if (order.approvalStatus === "rejected") return "rejected";
  // approved or not_required:
  if (order.status === "canceled") return "canceled";
  if (order.status === "paid") return "issued";
  return "pending_payment";
}

/**
 * Whether a registration needs manual approval before issuance/payment.
 * - none / automatic → no manual hold.
 * - manual / manual_and_automatic → yes, unless every selected item is auto-approved.
 */
export function requiresApproval(
  approvalMode: ApprovalMode,
  selectedItemIds: number[],
  autoApproveItemIds: number[],
): boolean {
  if (approvalMode === "none" || approvalMode === "automatic") return false;
  const auto = new Set(autoApproveItemIds);
  return !selectedItemIds.every((id) => auto.has(id));
}
