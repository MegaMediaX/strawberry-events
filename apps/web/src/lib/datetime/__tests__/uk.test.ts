import { describe, it, expect } from "vitest";
import { isoToLocalInput, localInputToIso, formatUk } from "@/lib/datetime/uk";

describe("isoToLocalInput", () => {
  it("extracts the wall-clock for a datetime-local input", () => {
    expect(isoToLocalInput("2026-09-01T09:00:00Z")).toBe("2026-09-01T09:00");
  });
  it("preserves the written wall-clock regardless of offset (no tz shift)", () => {
    expect(isoToLocalInput("2026-09-01T09:00:00+03:00")).toBe("2026-09-01T09:00");
  });
  it("returns empty for absent/unparseable input", () => {
    expect(isoToLocalInput(null)).toBe("");
    expect(isoToLocalInput(undefined)).toBe("");
    expect(isoToLocalInput("not-a-date")).toBe("");
  });
});

describe("localInputToIso", () => {
  it("appends seconds + UTC marker", () => {
    expect(localInputToIso("2026-09-01T09:00")).toBe("2026-09-01T09:00:00Z");
  });
  it("returns null for empty/malformed", () => {
    expect(localInputToIso("")).toBeNull();
    expect(localInputToIso(null)).toBeNull();
    expect(localInputToIso("2026-09")).toBeNull();
  });
  it("round-trips with isoToLocalInput", () => {
    const iso = "2026-12-31T23:59:00Z";
    expect(localInputToIso(isoToLocalInput(iso))).toBe(iso);
  });
});

describe("formatUk", () => {
  it("renders dd/mm/yyyy hh:mm (24h)", () => {
    expect(formatUk("2026-09-01T09:05:00Z")).toBe("01/09/2026 09:05");
    expect(formatUk("2026-12-31T23:59:00Z")).toBe("31/12/2026 23:59");
  });
  it("returns empty for unparseable input", () => {
    expect(formatUk(null)).toBe("");
    expect(formatUk("garbage")).toBe("");
  });
});
