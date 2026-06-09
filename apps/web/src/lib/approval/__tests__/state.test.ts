import { describe, it, expect } from "vitest";
import { registrationState, requiresApproval } from "@/lib/approval/state";

describe("registrationState", () => {
  const base = { approvalStatus: "not_required", status: "pending" } as const;
  it("pending approval", () => {
    expect(registrationState({ ...base, approvalStatus: "pending" })).toBe(
      "pending_approval",
    );
  });
  it("rejected", () => {
    expect(registrationState({ ...base, approvalStatus: "rejected" })).toBe(
      "rejected",
    );
  });
  it("canceled", () => {
    expect(
      registrationState({ approvalStatus: "approved", status: "canceled" }),
    ).toBe("canceled");
  });
  it("pending payment (approved/not-required + pending)", () => {
    expect(registrationState({ approvalStatus: "not_required", status: "pending" })).toBe(
      "pending_payment",
    );
    expect(registrationState({ approvalStatus: "approved", status: "pending" })).toBe(
      "pending_payment",
    );
  });
  it("issued (paid)", () => {
    expect(registrationState({ approvalStatus: "approved", status: "paid" })).toBe(
      "issued",
    );
  });
});

describe("requiresApproval", () => {
  it("none / automatic → false", () => {
    expect(requiresApproval("none", [7], [])).toBe(false);
    expect(requiresApproval("automatic", [7], [])).toBe(false);
  });
  it("manual → true", () => {
    expect(requiresApproval("manual", [7], [])).toBe(true);
    expect(requiresApproval("manual_and_automatic", [7], [])).toBe(true);
  });
  it("manual but all items auto-approved → false", () => {
    expect(requiresApproval("manual", [7, 8], [7, 8])).toBe(false);
  });
  it("manual with one non-auto item → true", () => {
    expect(requiresApproval("manual", [7, 9], [7])).toBe(true);
  });
});
