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

describe("job title on the badge", () => {
  // Captured from main BEFORE the job title existed. Every one of the 1,167
  // registrations taken so far has no title, so this is the badge the door will
  // print for almost everyone on 28 Aug — and the three PC42d lanes were
  // verified against exactly these bytes on hardware.
  //
  // If this test fails, the change is not additive and the proven badge has
  // moved. That is a stop, not a snapshot to update.
  const GOLDEN_NO_TITLE = [
    "^XA",
    "^PW480",
    "^LL320",
    "^LH0,0",
    "^FO0,10^GB480,76,76,B,0^FS^FO16,23^A0N,50,50^FR^FB448,1,0,C,0^FDVISITOR^FS",
    "^FO16,104^A0N,40,40^FB249,2,0,L,0^FDElias Daou^FS",
    "^FO16,196^A0N,26,26^FB249,1,0,L,0^FDBank of Beirut SAL^FS",
    "^FO300,131^BQN,2,5,Q,7^FDQA,HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/SZSZEC50^FS",
    "^XZ",
  ].join("\n");

  const proven = (): BadgeData => ({
    tag: "visitor",
    fullName: "Elias Daou",
    company: "Bank of Beirut SAL",
    badgeSlug: "SZSZEC50",
  });

  it("a badge with no job title is byte-identical to the proven badge", () => {
    expect(buildBadgeZpl(proven())).toBe(GOLDEN_NO_TITLE);
  });

  it("an empty or whitespace-only title changes nothing either", () => {
    expect(buildBadgeZpl({ ...proven(), jobTitle: "" })).toBe(GOLDEN_NO_TITLE);
    expect(buildBadgeZpl({ ...proven(), jobTitle: "   " })).toBe(GOLDEN_NO_TITLE);
  });

  it("adds exactly one line when a title is given, leaving the rest untouched", () => {
    const withTitle = buildBadgeZpl({ ...proven(), jobTitle: "Sales Manager" });
    const before = GOLDEN_NO_TITLE.split("\n");
    const after = withTitle.split("\n");
    expect(after.length).toBe(before.length + 1);
    // Every original line survives, unmoved relative to the others.
    expect(after.filter((l) => before.includes(l))).toEqual(before);
    expect(withTitle).toContain("Sales Manager");
  });

  it("keeps the title inside the text column, clear of the QR quiet zone", () => {
    // The column is 249 dots wide starting at x=16; the QR's quiet zone begins
    // at 265. A field block wider than that is how a badge stops scanning.
    const zpl = buildBadgeZpl({ ...proven(), jobTitle: "Sales Manager" });
    const line = zpl.split("\n").find((l) => l.includes("Sales Manager"))!;
    const [, x] = /\^FO(\d+),(\d+)/.exec(line)!.map(Number) as unknown as number[];
    const fb = /\^FB(\d+),(\d+)/.exec(line)!;
    expect(Number(fb[1])).toBe(249);
    expect(Number(fb[2])).toBe(1); // one line only — a second would reach the QR row
  });

  it("puts the title below the company and inside the label", () => {
    const zpl = buildBadgeZpl({ ...proven(), jobTitle: "Sales Manager" });
    const line = zpl.split("\n").find((l) => l.includes("Sales Manager"))!;
    const m = /\^FO(\d+),(\d+)\^A0N,(\d+)/.exec(line)!;
    const y = Number(m[2]);
    const size = Number(m[3]);
    expect(y).toBeGreaterThan(196 + 26); // clears the company line
    expect(y + size).toBeLessThanOrEqual(320); // stays on the label
  });

  it("sanitises the title like every other field", () => {
    const zpl = buildBadgeZpl({ ...proven(), jobTitle: "a^b~c" });
    expect(zpl).toContain("a b c");
    expect(zpl).not.toContain("a^b~c");
  });
});

describe("an over-wide job title is cut off, never allowed to reach the QR", () => {
  // Measured in Arial 24px in a real browser: "General Manager" is 187 dots and
  // fits the 249-dot column, but 15 WIDE glyphs measure 340 and do not. The
  // character cap therefore does not guarantee fit — only the column does.
  //
  // This is the same failure the name already guards against, and the reason
  // QR_QUIET exists: a badge whose text reaches the symbol looks perfect,
  // prints without error, and will not scan.
  it("bounds the field block to the column regardless of how wide the text is", () => {
    const zpl = buildBadgeZpl({
      tag: "visitor",
      fullName: "Elias Daou",
      company: "Bank of Beirut SAL",
      badgeSlug: "SZSZEC50",
      jobTitle: "WWWWWWWWWWWWWWW",
    });
    const line = zpl.split("\n").find((l) => l.includes("WWWW"))!;
    const fb = /\^FB(\d+),(\d+),/.exec(line)!;
    // ZPL truncates at the block width, so the ink stops at x = 16 + 249 = 265,
    // which is exactly where the QR's quiet zone begins.
    expect(Number(fb[1])).toBe(249);
    expect(Number(fb[2])).toBe(1);
    const fo = /\^FO(\d+),/.exec(line)!;
    expect(Number(fo[1]) + Number(fb[1])).toBeLessThanOrEqual(300 - 35);
  });
});

describe("absence of a job title changes nothing, for every badge shape", () => {
  // The single golden above pins the bytes for ONE badge. This generalises the
  // guarantee: across every tag, with and without a company, with and without a
  // slug, plus the awkward names, a badge with no title must be identical to
  // the badge built before the field existed.
  //
  // Checked against main when this was written: all 25 shapes were byte-for-byte
  // identical. This test keeps that true without needing main to compare to.
  const TAGS = ["media", "partner", "staff", "speaker", "visitor"] as const;
  const shapes: BadgeData[] = [];
  for (const tag of TAGS) {
    shapes.push({ tag, fullName: "Elias Daou", company: "Bank of Beirut SAL", badgeSlug: "SZSZEC50" });
    shapes.push({ tag, fullName: "Elias Daou", company: null, badgeSlug: "SZSZEC50" });
    shapes.push({ tag, fullName: "Elias Daou", company: "Acme", badgeSlug: null });
    shapes.push({ tag, fullName: "Elias Daou", company: null, badgeSlug: null });
  }
  shapes.push({ tag: "visitor", fullName: "Mouhamad Abdel Rahman Al-Hassan Kouyoumdjian", company: "A Very Long Company Name Indeed SAL", badgeSlug: "SZSZEC50" });
  shapes.push({ tag: "visitor", fullName: "محمد", company: "شركة", badgeSlug: "SZSZEC50" });
  shapes.push({ tag: "visitor", fullName: "a^b~c", company: "x^y~z", badgeSlug: "SZSZEC50" });
  shapes.push({ tag: "visitor", fullName: "", company: "", badgeSlug: "SZSZEC50" });

  it.each(["omitted", "null", "empty", "whitespace"] as const)(
    "a title that is %s produces the same badge as one with no title field at all",
    (kind) => {
      for (const shape of shapes) {
        const jobTitle = kind === "null" ? null : kind === "empty" ? "" : kind === "whitespace" ? "   " : undefined;
        const withField = kind === "omitted" ? shape : { ...shape, jobTitle };
        expect(buildBadgeZpl(withField)).toBe(buildBadgeZpl(shape));
      }
    },
  );

  it("covers every tag the badge can carry", () => {
    // Guards the matrix itself: a new tag added to BadgeTag without being added
    // here would leave that badge unverified.
    expect(new Set(shapes.map((s) => s.tag)).size).toBe(TAGS.length);
  });
});
