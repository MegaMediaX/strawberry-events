import { describe, it, expect } from "vitest";
import {
  buildVCard,
  escapeVCardValue,
  formatPhone,
  vCardFilename,
} from "@/lib/checkin/vcard";

describe("escapeVCardValue", () => {
  it("escapes the characters that are structural in vCard", () => {
    // A company like "Smith, Jones & Co" would otherwise split into two fields
    // and the contact imports mangled — or not at all.
    expect(escapeVCardValue("Smith, Jones")).toBe("Smith\\, Jones");
    // NOTE the doubled backslash. This line previously read "A\;B", which is
    // not an escape sequence in a JS string and collapses to "A;B" — the
    // same typo the implementation had, so the test asserted the no-op and
    // passed while nothing was escaped.
    expect(escapeVCardValue("A;B")).toBe("A\\;B");
    expect(escapeVCardValue("line1\nline2")).toBe("line1\\nline2");
    expect(escapeVCardValue("back\\slash")).toBe("back\\\\slash");
  });

  it("escapes the backslash before anything else", () => {
    // Wrong order double-escapes and the value arrives corrupted.
    expect(escapeVCardValue("\\,")).toBe("\\\\\\,");
  });
});

describe("buildVCard", () => {
  const base = { fullName: "Salwa Eid", company: "GPCS company", role: "Visitor" };

  it("produces a well-formed 3.0 card", () => {
    const v = buildVCard(base);
    expect(v.startsWith("BEGIN:VCARD\r\nVERSION:3.0\r\n")).toBe(true);
    expect(v.endsWith("END:VCARD\r\n")).toBe(true);
    // CRLF is required by the spec; LF-only cards are rejected by some readers.
    expect(v.split("\r\n").length).toBeGreaterThan(5);
    expect(v).not.toMatch(/[^\r]\n/);
  });

  it("carries the display name exactly as given", () => {
    // N is a guess; FN is authoritative and is what phones display.
    expect(buildVCard({ fullName: "Salwa Eid" })).toContain("FN:Salwa Eid");
  });

  it("splits a structured name, family last", () => {
    expect(buildVCard({ fullName: "Salwa Eid" })).toContain("N:Eid;Salwa;;;");
  });

  it("handles a single-word name without inventing a surname", () => {
    expect(buildVCard({ fullName: "Prince" })).toContain("N:;Prince;;;");
  });

  it("treats everything before the last token as given names", () => {
    expect(buildVCard({ fullName: "Maria del Carmen Ruiz" })).toContain(
      "N:Ruiz;Maria del Carmen;;;",
    );
  });

  it("omits fields that are absent rather than emitting empty ones", () => {
    const v = buildVCard({ fullName: "Solo" });
    expect(v).not.toMatch(/^EMAIL/m);
    expect(v).not.toMatch(/^TEL/m);
    expect(v).not.toMatch(/^ORG/m);
  });

  it("includes contact details when present", () => {
    const v = buildVCard({ ...base, email: "a@b.com", phone: "+961 3 123456" });
    expect(v).toContain("EMAIL;TYPE=INTERNET,WORK:a@b.com");
    expect(v).toContain("TEL;TYPE=CELL,VOICE:+961 3 123456");
    expect(v).toContain("ORG:GPCS company");
    expect(v).toContain("TITLE:Visitor");
  });

  it("escapes a comma inside a company name", () => {
    const v = buildVCard({ fullName: "X", company: "Smith, Jones" });
    expect(v).toContain("ORG:Smith\\, Jones");

  });

  it("escapes a semicolon inside a company name", () => {
    // Semicolon is structural in vCard, and was not actually escaped: the
    // source read .replace(/;/g, "\;") — and "\;" is not an escape sequence
    // in a JS string, so it collapses to a bare ";" and the replace did
    // nothing at all. "GPCS; Beirut" imported as a company plus a stray
    // second field.
    const v = buildVCard({ fullName: "X", company: "GPCS; Beirut" });
    expect(v).toContain("ORG:GPCS\\; Beirut");
  });

  it("escapes a semicolon inside a job title", () => {
    // TITLE now carries the attendee's own free text (the "Other" path), so
    // this is a live input, not a hypothetical one.
    const v = buildVCard({ fullName: "X", role: "Head; Ops" });
    expect(v).toContain("TITLE:Head\\; Ops");
  });
});

describe("vCardFilename", () => {
  it("is safe for a phone filesystem", () => {
    expect(vCardFilename("Salwa Eid")).toBe("Salwa-Eid.vcf");
    expect(vCardFilename("Ali  Al-Hassan")).toBe("Ali-Al-Hassan.vcf");
  });

  it("falls back when the name has no usable characters", () => {
    // An Arabic-only name strips to nothing; a nameless .vcf still imports.
    expect(vCardFilename("مروان")).toBe("contact.vcf");
    expect(vCardFilename("   ")).toBe("contact.vcf");
  });
});

describe("formatPhone", () => {
  it("joins a country code and national number", () => {
    expect(formatPhone("3123456", "+961")).toBe("+961 3123456");
    expect(formatPhone("3123456", "961")).toBe("+961 3123456");
  });

  it("does not double the plus when the number already has one", () => {
    expect(formatPhone("+961 3123456", "+961")).toBe("+961 3123456");
  });

  it("returns null when there is no number", () => {
    expect(formatPhone(null, "+961")).toBeNull();
    expect(formatPhone("   ", "+961")).toBeNull();
    expect(formatPhone(undefined, undefined)).toBeNull();
  });

  it("returns the number alone when there is no country code", () => {
    expect(formatPhone("03123456", null)).toBe("03123456");
  });
});
