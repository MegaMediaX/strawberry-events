import { describe, expect, it } from "vitest";
import { hasEnded } from "../ended";

const NOW = new Date("2026-09-27T12:00:00Z");

describe("hasEnded", () => {
  it("is true once the end date has passed", () => {
    expect(hasEnded("2026-08-28T09:00:00Z", "2026-08-30T18:00:00Z", NOW)).toBe(true);
  });

  it("is false while the event is still on", () => {
    expect(hasEnded("2026-09-26T09:00:00Z", "2026-09-28T18:00:00Z", NOW)).toBe(false);
  });

  it("is false for an event that has not started", () => {
    expect(hasEnded("2026-10-10T09:00:00Z", "2026-10-11T18:00:00Z", NOW)).toBe(false);
  });

  it("keeps a start-only event open for its whole first day", () => {
    expect(hasEnded("2026-09-27T09:00:00Z", null, NOW)).toBe(false);
    expect(hasEnded("2026-09-25T09:00:00Z", null, NOW)).toBe(true);
  });

  it("accepts Date objects as well as ISO strings", () => {
    expect(hasEnded(new Date("2026-08-28T09:00:00Z"), new Date("2026-08-30T18:00:00Z"), NOW)).toBe(true);
  });

  it("never closes an event it cannot date", () => {
    expect(hasEnded(null, null, NOW)).toBe(false);
    expect(hasEnded(undefined, undefined, NOW)).toBe(false);
    expect(hasEnded("not a date", "not a date", NOW)).toBe(false);
  });
});
