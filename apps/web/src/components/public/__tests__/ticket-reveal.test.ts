import { describe, it, expect } from "vitest";
import { shouldShowTicketQr, shouldOfferTicketRecovery } from "../ticket-reveal";

describe("shouldShowTicketQr", () => {
  it("shows the QR only on an issued ticket when the caller is authorized", () => {
    expect(shouldShowTicketQr("issued", true)).toBe(true);
  });

  it("withholds the QR for an issued ticket when the caller is not authorized", () => {
    // This is the enumeration guard: the order-code-addressed confirmation page
    // reaches 'issued' too, and its URL is a five-character guessable string.
    expect(shouldShowTicketQr("issued", false)).toBe(false);
  });

  it("never shows a QR for a state that has no ticket, authorized or not", () => {
    for (const state of ["pending_approval", "pending_payment", "rejected", "canceled"] as const) {
      expect(shouldShowTicketQr(state, true)).toBe(false);
      expect(shouldShowTicketQr(state, false)).toBe(false);
    }
  });
});

describe("shouldOfferTicketRecovery", () => {
  it("offers recovery exactly when a ticket exists but this surface may not show it", () => {
    expect(shouldOfferTicketRecovery("issued", false)).toBe(true);
  });

  it("does not offer recovery on the authorized surface — the QR is right there", () => {
    expect(shouldOfferTicketRecovery("issued", true)).toBe(false);
  });

  it("does not offer recovery when there is no ticket to recover", () => {
    for (const state of ["pending_approval", "pending_payment", "rejected", "canceled"] as const) {
      expect(shouldOfferTicketRecovery(state, false)).toBe(false);
    }
  });
});
