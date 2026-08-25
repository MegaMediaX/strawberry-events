import { describe, it, expect } from "vitest";

import { looksScannable, SLUG_RE } from "@/lib/checkin/scan-shape";
import { resolveBadgeSlug } from "@/lib/checkin/badge-slug";

describe("looksScannable — is this a code, or something someone typed?", () => {
  // A wedge scanner is a keyboard: its payload lands in the search box. Sending
  // it to the search instead of the scan path is what made a badge slug match
  // strangers by phone on a third of all scans.
  it("recognises the badge QR payload exactly as printed", () => {
    expect(looksScannable("HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/SZSZEC50")).toBe(true);
  });

  it("recognises a bare slug", () => {
    expect(looksScannable("SZSZEC50")).toBe(true);
    expect(looksScannable("szszec50")).toBe(true); // a wedge may not preserve case
  });

  it("recognises a pretix e-ticket secret", () => {
    expect(looksScannable("k3j4h5g6f7d8s9a0q1w2")).toBe(true);
  });

  it("does NOT treat a name as a code", () => {
    expect(looksScannable("Elias Daou")).toBe(false);
    expect(looksScannable("Mouhamad Abdel Rahman")).toBe(false);
  });

  it("does NOT treat an order code as a code to scan", () => {
    // Order codes are 5 chars; slugs are 8. A search for one must stay a search.
    expect(looksScannable("B7TLU")).toBe(false);
    expect(looksScannable("FVB3M")).toBe(false);
  });

  it("does NOT treat a phone number as a code", () => {
    // 8 digits is both a Lebanese mobile and a shape-valid slug. Production
    // has 0 all-digit slugs out of 844 and 932 attendees with an 8-digit
    // phone, so the phone reading is the only sane one.
    expect(looksScannable("70123456")).toBe(false);
    expect(looksScannable("+961 70 123 456")).toBe(false);
    expect(looksScannable("03123456")).toBe(false);
  });

  it("still scans a slug that merely CONTAINS digits", () => {
    expect(looksScannable("SZSZEC50")).toBe(true);
    expect(looksScannable("9F3K2M10")).toBe(true);
  });

  it("still scans an all-digit slug when it arrives as a URL", () => {
    // Vanishingly rare, but /c/ states what it is, so nothing is ambiguous.
    expect(looksScannable("HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/70123456")).toBe(true);
  });

  it("ignores empty and whitespace", () => {
    expect(looksScannable("")).toBe(false);
    expect(looksScannable("   ")).toBe(false);
  });
});

describe("anything looksScannable accepts, the server can actually resolve", () => {
  // The two halves must agree. If this predicate says "scan" for something
  // resolveBadgeSlug returns null for, the door gets a dead end instead of a
  // search — the failure mode is invisible until someone is standing there.
  it.each([
    "HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/SZSZEC50",
    "https://register.strawberryagency.com/c/SZSZEC50",
    "SZSZEC50",
  ])("resolves %s", (payload) => {
    expect(looksScannable(payload)).toBe(true);
    expect(resolveBadgeSlug(payload)).toBe("SZSZEC50");
  });

  it("keeps one definition of a slug across both modules", () => {
    expect(SLUG_RE.test("SZSZEC50")).toBe(true);
    expect(SLUG_RE.test("SZSZEC5")).toBe(false);   // too short
    expect(SLUG_RE.test("SZSZECIO")).toBe(false);  // I and O are excluded
  });
});
