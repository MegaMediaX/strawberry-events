import { describe, it, expect } from "vitest";
import type { BadgeData } from "@/components/badges/badge-template";
import {
  buildBadgeZpl,
  sanitizeZplText,
  hasUnprintableName,
  LABEL_WIDTH,
  LABEL_HEIGHT,
} from "@/lib/checkin/badge-zpl";

const badge = (overrides: Partial<BadgeData> = {}): BadgeData => ({
  tag: "speaker",
  fullName: "Mouhamad Al-Hassan",
  company: "Strawberry Agency",
  ...overrides,
});

describe("sanitizeZplText", () => {
  it("strips ZPL control prefixes ^ and ~", () => {
    expect(sanitizeZplText("a^b~c")).toBe("a b c");
  });

  it("preserves spaces and hyphens in names", () => {
    expect(sanitizeZplText("Al-Hassan John")).toBe("Al-Hassan John");
  });

  it("drops ASCII control characters", () => {
    expect(sanitizeZplText("a\u0001bc")).toBe("abc");
  });
});

describe("buildBadgeZpl", () => {
  it("wraps the label in ^XA/^XZ with 60x40mm landscape @203dpi dimensions", () => {
    const zpl = buildBadgeZpl(badge());
    expect(zpl.startsWith("^XA")).toBe(true);
    expect(zpl.trimEnd().endsWith("^XZ")).toBe(true);
    expect(LABEL_WIDTH).toBe(480); // 60mm wide
    expect(LABEL_HEIGHT).toBe(320); // 40mm tall
    expect(zpl).toContain(`^PW${LABEL_WIDTH}`);
    expect(zpl).toContain(`^LL${LABEL_HEIGHT}`);
  });

  it("renders the tag uppercased in a reversed band", () => {
    const zpl = buildBadgeZpl(badge({ tag: "media" }));
    expect(zpl).toContain("^GB"); // band box
    expect(zpl).toContain("^FR"); // reversed text
    expect(zpl).toContain("^FDMEDIA^FS");
  });

  it("includes full name and company", () => {
    const zpl = buildBadgeZpl(badge());
    expect(zpl).toContain("^FDMouhamad Al-Hassan^FS");
    expect(zpl).toContain("^FDStrawberry Agency^FS");
  });

  it("does not render a QR code", () => {
    const zpl = buildBadgeZpl(badge());
    expect(zpl).not.toContain("^BQ");
  });

  it("omits the company line when there is no company", () => {
    const zpl = buildBadgeZpl(badge({ company: null }));
    expect(zpl).not.toContain("Strawberry Agency");
    expect(zpl).toContain("^XA");
    expect(zpl).toContain("^XZ");
  });

  it("neutralizes a malicious ^ in a name so it can't inject a command", () => {
    const zpl = buildBadgeZpl(badge({ fullName: "Evil^XZName" }));
    expect(zpl).toContain("^FDEvil XZName^FS");
  });
});

describe("names the printer cannot render", () => {
  it("flags an Arabic name rather than letting it print as mojibake", () => {
    // The printer's resident fonts are Latin-only and its code page is
    // single-byte, so UTF-8 Arabic arrives as bytes and prints as garbage on a
    // badge someone wears for three days.
    expect(hasUnprintableName("محمد الحسن")).toBe(true);
    expect(hasUnprintableName("Mouhamad Al-Hassan")).toBe(false);
  });

  it("keeps accented Latin, which the printer CAN render", () => {
    expect(hasUnprintableName("José Müller")).toBe(false);
    expect(sanitizeZplText("José Müller")).toBe("José Müller");
  });

  it("drops non-Latin from the ZPL rather than emitting raw bytes", () => {
    expect(sanitizeZplText("محمد Ali")).toBe("Ali");
  });
});

describe("the contact-profile QR", () => {
  it("encodes the profile URL, never the pretix secret", () => {
    // The whole reason the previous QR was removed: it carried the live
    // check-in credential on an attendee's chest, photographable all day.
    const zpl = buildBadgeZpl(badge({ badgeSlug: "ABC12345" }));
    expect(zpl).toContain("HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/ABC12345");
    expect(zpl).not.toMatch(/secret/i);
  });

  it("prints nothing where there is no slug", () => {
    // TEST_BADGE and any row predating the column must still yield a valid
    // label. Throwing here would take the door down to protect a decoration.
    const zpl = buildBadgeZpl(badge({ badgeSlug: null }));
    expect(zpl).not.toContain("^BQ");
    expect(zpl.startsWith("^XA")).toBe(true);
    expect(zpl.trimEnd().endsWith("^XZ")).toBe(true);

    expect(buildBadgeZpl(badge({ badgeSlug: undefined }))).not.toContain("^BQ");
  });

  it("gives the symbol a spec-compliant quiet zone on all four sides", () => {
    // THE bug from the first printed badge. The QR sat 16 dots from the label
    // edge — 3.2 modules — and would not scan on any phone. A decoder needs at
    // least 4 blank modules to find the symbol's edge; below that it does not
    // read a damaged code, it declines to see a code at all.
    //
    // "Inside the label" was the assertion this replaces, and it passed the
    // whole time. Fitting is not the requirement; clearance is.
    const MAG = 5;
    const SIZE = 29 * MAG; // version 3
    const MIN_QUIET = 4 * MAG; // QR spec floor, in dots

    const zpl = buildBadgeZpl(badge({ badgeSlug: "ABC12345" }));
    const origin = /\^FO(\d+),(\d+)\^BQ/.exec(zpl);
    expect(origin).not.toBeNull();

    const [x, y] = [Number(origin![1]), Number(origin![2])];
    expect(x).toBeGreaterThanOrEqual(MIN_QUIET);
    expect(y).toBeGreaterThanOrEqual(MIN_QUIET);
    expect(LABEL_WIDTH - (x + SIZE)).toBeGreaterThanOrEqual(MIN_QUIET);
    expect(LABEL_HEIGHT - (y + SIZE)).toBeGreaterThanOrEqual(MIN_QUIET);
  });

  it("keeps the quiet zone clear of the role band", () => {
    // The band is solid black. Printed inside the quiet zone it is
    // indistinguishable from symbol data, so the decoder sees a malformed code.
    const zpl = buildBadgeZpl(badge({ badgeSlug: "ABC12345" }));
    const y = Number(/\^FO\d+,(\d+)\^BQ/.exec(zpl)![1]);
    const bandBottom = 10 + 76;
    expect(y - bandBottom).toBeGreaterThanOrEqual(4 * 5);
  });

  it("asks for error-correction level Q", () => {
    // Q survives a creased, worn badge. H would push the payload to version 4
    // and shrink the modules below the size a phone camera handles reliably.
    const zpl = buildBadgeZpl(badge({ badgeSlug: "ABC12345" }));
    expect(zpl).toContain("^BQN,2,5,Q,7");
    expect(zpl).toContain("^FDQA,");
  });

  it("does not let the text column run under the QR", () => {
    // A long name wrapping into the QR's corner would overprint the symbol and
    // leave a label that looks fine but will not scan.
    const zpl = buildBadgeZpl(
      badge({ fullName: "Abdulrahman Constantinopoulos-Fitzgerald", badgeSlug: "ABC12345" }),
    );

    // Only blocks BELOW the role band can collide — the band is full-width by
    // design and sits above the QR, so including it would fail this correctly
    // laid out label.
    const blocks = [...zpl.matchAll(/\^FO(\d+),(\d+)[^\n]*?\^FB(\d+),/g)].map((m) => ({
      x: Number(m[1]),
      y: Number(m[2]),
      width: Number(m[3]),
    }));
    const beside = blocks.filter((b) => b.y >= 90);

    // Text must stop a full quiet zone short of the symbol, not merely short of
    // it — glyphs inside the quiet zone break the scan exactly like a clipped
    // edge does.
    const qrX = Number(/\^FO(\d+),\d+\^BQ/.exec(zpl)![1]);
    expect(beside.length).toBeGreaterThan(0);
    for (const b of beside) {
      expect(qrX - (b.x + b.width)).toBeGreaterThanOrEqual(4 * 5);
    }
  });
});
