import { describe, it, expect } from "vitest";
import { isTicketIssued } from "@/lib/finance/ticket";

describe("isTicketIssued", () => {
  it("a pending COD order has no issued ticket (no QR)", () => {
    expect(isTicketIssued("pending")).toBe(false);
  });
  it("a paid order issues the ticket", () => {
    expect(isTicketIssued("paid")).toBe(true);
  });
  it("a canceled order has no ticket", () => {
    expect(isTicketIssued("canceled")).toBe(false);
  });
});
