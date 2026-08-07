import { describe, it, expect } from "vitest";
import { postRegisterPath } from "../post-register-path";

describe("postRegisterPath", () => {
  it("sends an issued ticket to the signed magic-link URL, not the order-code page", () => {
    // Regression guard: routing 'paid' to /confirmation/<orderCode> put a
    // scannable pretix secret behind a five-character guessable URL.
    expect(
      postRegisterPath("en", "demo-expo", {
        orderCode: "3XKQ7",
        status: "paid",
        approvalStatus: "not_required",
        magicLinkToken: "M1RB.sig",
      }),
    ).toBe("/en/t/M1RB.sig");
  });

  it("keeps approval-pending on the confirmation page (no ticket exists yet)", () => {
    expect(
      postRegisterPath("ar", "demo-expo", {
        orderCode: "3XKQ7",
        status: "pending",
        approvalStatus: "pending",
        magicLinkToken: "M1RB.sig",
      }),
    ).toBe("/ar/events/demo-expo/confirmation/3XKQ7");
  });

  it("treats a held-but-paid order as approval-pending, mirroring registrationState", () => {
    expect(
      postRegisterPath("en", "demo-expo", {
        orderCode: "3XKQ7",
        status: "paid",
        approvalStatus: "pending",
        magicLinkToken: "M1RB.sig",
      }),
    ).toBe("/en/events/demo-expo/confirmation/3XKQ7");
  });

  it("sends COD-without-approval to the payment-pending page", () => {
    expect(
      postRegisterPath("en", "demo-expo", {
        orderCode: "3XKQ7",
        status: "pending",
        approvalStatus: "not_required",
        magicLinkToken: "M1RB.sig",
      }),
    ).toBe("/en/events/demo-expo/payment-pending/3XKQ7");
  });
});
