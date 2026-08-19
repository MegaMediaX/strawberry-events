import { describe, it, expect } from "vitest";
import {
  badgeProfileUrl,
  generateBadgeSlug,
  isBadgeSlug,
  resolveBadgeSlug,
} from "../badge-slug";

describe("generateBadgeSlug", () => {
  it("produces 8 characters from the reduced alphabet", () => {
    for (let i = 0; i < 200; i += 1) {
      const slug = generateBadgeSlug();
      expect(slug).toHaveLength(8);
      expect(isBadgeSlug(slug)).toBe(true);
    }
  });

  it("omits the letters that misread on a printed badge", () => {
    // I/L/O collide with 1/1/0 under a thermal head, and the slug is a fallback
    // someone may have to read aloud or type.
    const sample = Array.from({ length: 400 }, () => generateBadgeSlug()).join("");
    expect(sample).not.toMatch(/[ILOU]/);
  });

  it("is uniform enough not to concentrate on one character", () => {
    // A generator that always emitted ALPHABET[0] would satisfy every test
    // above. Feed it a known sequence and check it walks the alphabet.
    let i = 0;
    const cycling = () => (i++ % 32) / 32;
    expect(generateBadgeSlug(cycling)).toBe("01234567");
  });
});

describe("badgeProfileUrl", () => {
  it("is entirely within the QR alphanumeric charset", () => {
    // Byte mode is ~31% less dense. One lowercase character silently pushes the
    // symbol a version larger than the space under the role band allows.
    const ALNUM = /^[0-9A-Z $%*+\-./:]+$/;
    expect(badgeProfileUrl("ABC12345")).toMatch(ALNUM);
  });

  it("points at the registration host by default", () => {
    expect(badgeProfileUrl("ABC12345")).toBe(
      "HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/ABC12345",
    );
  });

  it("round-trips through the scanner path", () => {
    const slug = generateBadgeSlug();
    expect(resolveBadgeSlug(badgeProfileUrl(slug))).toBe(slug);
  });
});

describe("resolveBadgeSlug", () => {
  it("reads the slug from the printed payload", () => {
    expect(resolveBadgeSlug("HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/ABC12345")).toBe(
      "ABC12345",
    );
  });

  it("tolerates what real scanners actually emit", () => {
    // Keyboard-wedge models append a newline; some strip the scheme; the case
    // that comes back depends on the model and its config.
    const cases = [
      "https://register.strawberryagency.com/c/abc12345",
      "register.strawberryagency.com/c/ABC12345",
      "  HTTPS://REGISTER.STRAWBERRYAGENCY.COM/C/ABC12345\n",
      "https://register.strawberryagency.com/c/ABC12345?utm=x",
      "https://register.strawberryagency.com/c/ABC12345#top",
      "ABC12345",
      "abc12345",
    ];
    for (const input of cases) {
      expect(resolveBadgeSlug(input)).toBe("ABC12345");
    }
  });

  it("refuses anything that is not slug-shaped", () => {
    // The caller falls through to "QR not recognized". Returning a guess here
    // would send a stranger's code into a check-in lookup.
    for (const input of [
      "",
      "   ",
      "/c/",
      "/c/SHORT",
      "/c/TOOLONGFORASLUG",
      "/c/ABC1234!",
      "https://register.strawberryagency.com/en/admin/events",
      "ABC12I45", // contains an excluded letter
    ]) {
      expect(resolveBadgeSlug(input)).toBeNull();
    }
  });

  it("does not mistake a pretix secret for a slug", () => {
    // pretix secrets are 32 lowercase hex-ish characters. If one of those ever
    // resolved as a slug the door would look up the wrong row.
    expect(resolveBadgeSlug("k4n8x2m9p1q7w3e5r6t8y0u2i4o6a8s0")).toBeNull();
  });
});
