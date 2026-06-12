import { describe, it, expect } from "vitest";
import type { BadgeData } from "@/components/badges/badge-template";
import {
  buildBadgeZpl,
  sanitizeZplText,
  LABEL_WIDTH,
  LABEL_HEIGHT,
} from "@/lib/checkin/badge-zpl";

const badge = (overrides: Partial<BadgeData> = {}): BadgeData => ({
  tag: "speaker",
  fullName: "Mouhamad Al-Hassan",
  company: "Strawberry Agency",
  qrValue: "SEC123ABC",
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
  it("wraps the label in ^XA/^XZ with 6x4 landscape @203dpi dimensions", () => {
    const zpl = buildBadgeZpl(badge());
    expect(zpl.startsWith("^XA")).toBe(true);
    expect(zpl.trimEnd().endsWith("^XZ")).toBe(true);
    expect(LABEL_WIDTH).toBe(1218); // 6in wide
    expect(LABEL_HEIGHT).toBe(812); // 4in tall
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

  it("encodes the QR with the pretix secret payload", () => {
    const zpl = buildBadgeZpl(badge({ qrValue: "SEC999" }));
    expect(zpl).toContain("^BQN,2,");
    expect(zpl).toContain("^FDLA,SEC999^FS");
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
