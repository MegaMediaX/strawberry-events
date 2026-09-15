import { describe, it, expect } from "vitest";

import { decideEnter, looksScannable, SLUG_RE } from "@/lib/checkin/scan-shape";
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

describe("decideEnter — the branch that can admit the wrong person", () => {
  const row = (orderCode: string) => ({ orderCode });

  it("checks in the single match for what is currently typed", () => {
    expect(decideEnter("Elias", "Elias", [row("EH-001")])).toEqual({
      kind: "checkIn",
      orderCode: "EH-001",
    });
  });

  it("REFUSES to act on results that answer an earlier query", () => {
    // The race this exists for. Results are only written when the 220ms
    // debounce resolves, so just after a keystroke `rows` still holds the
    // previous answer:
    //   type "Elias"      -> one match, Elias Haddad
    //   type "Elias D"    -> to disambiguate a second Elias
    //   press Enter       -> inside the debounce window
    // Without this check, Elias HADDAD is checked in and his badge printed.
    // A check-in cannot be undone at a door.
    expect(decideEnter("Elias D", "Elias", [row("EH-001")])).toEqual({ kind: "none" });
  });

  it("refuses when several people match", () => {
    expect(decideEnter("Elias", "Elias", [row("A"), row("B")])).toEqual({ kind: "none" });
  });

  it("refuses when nobody matches", () => {
    // Registering a walk-in creates a real pretix order. Enter must not reach it.
    expect(decideEnter("Nobody", "Nobody", [])).toEqual({ kind: "none" });
  });

  it("refuses an empty box", () => {
    expect(decideEnter("", "", [])).toEqual({ kind: "none" });
    expect(decideEnter("   ", "", [])).toEqual({ kind: "none" });
  });

  it("sends a scanned payload to the scan path, whatever the rows say", () => {
    expect(
      decideEnter("HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/SZSZEC50", "Elias", [row("EH-001")]),
    ).toEqual({ kind: "scan", text: "HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/SZSZEC50" });
  });

  it("treats a phone number as a query, not a scan", () => {
    // 8 digits is also a shape-valid slug; the phone reading is the right one.
    expect(decideEnter("70123456", "70123456", [row("EH-001")])).toEqual({
      kind: "checkIn",
      orderCode: "EH-001",
    });
  });

  it("ignores whitespace differences between the query and its results", () => {
    expect(decideEnter("  Elias  ", "Elias", [row("EH-001")])).toEqual({
      kind: "checkIn",
      orderCode: "EH-001",
    });
  });
});

/**
 * The slug alphabet drops exactly I, L, O and U — so an eight-letter name is a
 * slug by shape, and the door stopped searching for anyone called Samantha.
 *
 * What the operator saw: they type the name of a woman standing in front of
 * them, who IS registered; no lookup is sent; the empty result turns on "No
 * one matches Samantha — register her as a walk-in", which is the duplicate
 * registration this screen exists to prevent. Enter instead refused her with
 * "QR not recognized for this event".
 */
describe("an eight-letter name is not a badge code", () => {
  it.each(["SAMANTHA", "MARGARET", "STEPHANE", "JEANETTE", "Samantha"])(
    "searches for %s rather than scanning it",
    (name) => {
      expect(looksScannable(name)).toBe(false);
    },
  );

  it("is exactly the ambiguity that made the rule necessary", () => {
    // Not a typo in the test: these names really do pass the slug shape.
    // The digit is what tells the two apart.
    expect(SLUG_RE.test("SAMANTHA")).toBe(true);
    expect(looksScannable("SZSZEC50")).toBe(true);
  });

  it("does not cost the digitless slug its scan — Enter recovers it", () => {
    // ~1 in 8 real slugs has no digit, and that one is indistinguishable from
    // a name until the search answers. So it is searched first, and Enter
    // sends it to the scanner once nobody has matched it.
    expect(looksScannable("ZSZECKMN")).toBe(false);
    expect(decideEnter("ZSZECKMN", "ZSZECKMN", [])).toEqual({
      kind: "scan",
      text: "ZSZECKMN",
    });
  });

  it("does NOT scan a name once the search has found her", () => {
    // The same fallback, on the case that matters: Samantha is registered, so
    // the search answers with her row and Enter checks her in.
    expect(decideEnter("SAMANTHA", "SAMANTHA", [{ orderCode: "SM-001" }])).toEqual({
      kind: "checkIn",
      orderCode: "SM-001",
    });
  });

  it("does NOT fall back on results that answer an earlier query", () => {
    // Same race as the check-in branch: rows empty for "SAMANTH" says nothing
    // about "SAMANTHA", so Enter must wait rather than scan a name.
    expect(decideEnter("SAMANTHA", "SAMANTH", [])).toEqual({ kind: "none" });
  });
});
