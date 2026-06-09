import { describe, it, expect } from "vitest";
import { isHoldExpired, canSelect, HOLD_MS } from "@/lib/seats/state";

const now = new Date("2026-09-01T12:00:00Z");
const past = new Date(now.getTime() - 1000);
const future = new Date(now.getTime() + 60_000);

describe("isHoldExpired", () => {
  it("true for a held seat past its expiry", () => {
    expect(isHoldExpired({ state: "temporarily_held", heldUntil: past }, now)).toBe(true);
  });
  it("false for a held seat still within window", () => {
    expect(isHoldExpired({ state: "temporarily_held", heldUntil: future }, now)).toBe(false);
  });
  it("false for non-held seats", () => {
    expect(isHoldExpired({ state: "available", heldUntil: null }, now)).toBe(false);
  });
});

describe("canSelect", () => {
  it("available and accessible are selectable", () => {
    expect(canSelect({ state: "available", heldUntil: null }, now)).toBe(true);
    expect(canSelect({ state: "accessible", heldUntil: null }, now)).toBe(true);
  });
  it("blocked and sold are not selectable", () => {
    expect(canSelect({ state: "blocked", heldUntil: null }, now)).toBe(false);
    expect(canSelect({ state: "sold_or_reserved", heldUntil: null }, now)).toBe(false);
  });
  it("held seat selectable only once its hold expired", () => {
    expect(canSelect({ state: "temporarily_held", heldUntil: future }, now)).toBe(false);
    expect(canSelect({ state: "temporarily_held", heldUntil: past }, now)).toBe(true);
  });
});

describe("HOLD_MS", () => {
  it("is 10 minutes", () => {
    expect(HOLD_MS).toBe(600_000);
  });
});
