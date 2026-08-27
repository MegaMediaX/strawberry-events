import { describe, it, expect } from "vitest";
import {
  BADGE_TAGS, BADGE_TAG_LABEL, badgeBandText, resolveRoleLabel, ROLE_LABEL_MAX,
} from "@/lib/badges/tags";
import { bandFontSize, BAND_MIN_SIZE, TAG_SIZE } from "@/lib/checkin/badge-layout";

describe("the badge role list", () => {
  // A role in the database enum but missing from BADGE_TAGS is assignable
  // nowhere AND rejected by updateAttendeeDetails — it would exist and be
  // unusable, with nothing failing. A security review caught exactly that
  // window while the two lists were briefly out of step mid-edit.
  it("carries every role the product offers", () => {
    expect([...BADGE_TAGS]).toEqual([
      "visitor", "media", "partner", "investor", "startup", "government",
      "speaker", "moderator", "staff",
      "exhibitor", "organising_committee", "organiser", "cofounder", "strawberry",
      "other",
    ]);
  });

  it("gives every role a human label — no raw enum value can face an operator", () => {
    for (const tag of BADGE_TAGS) {
      expect(BADGE_TAG_LABEL[tag]).toBeTruthy();
      expect(BADGE_TAG_LABEL[tag]).not.toContain("_");
    }
  });

  it("prints the label, not the enum value, on the band", () => {
    expect(badgeBandText("organising_committee")).toBe("ORGANISING COMMITTEE");
    expect(badgeBandText("cofounder")).toBe("CO-FOUNDER");
  });

  it("opens out an unknown value rather than printing an underscore", () => {
    expect(badgeBandText("future_role")).toBe("FUTURE ROLE");
  });
});

describe("the Other role's band text", () => {
  it("prints what the operator typed, upper-cased", () => {
    expect(badgeBandText("other", "Accelerator")).toBe("ACCELERATOR");
  });

  // The band is the one line a badge cannot do without. An `other` that
  // reached the printer with no label — via an invite tag or an item mapping,
  // neither of which collects one — must still say something.
  it("falls back to OTHER rather than an empty black bar", () => {
    expect(badgeBandText("other", null)).toBe("OTHER");
    expect(badgeBandText("other", "   ")).toBe("OTHER");
  });

  // A label left behind on a row that was switched to a real role must never
  // win: the role is what the person IS.
  it("ignores a stale label on every fixed role", () => {
    expect(badgeBandText("speaker", "Accelerator")).toBe("SPEAKER");
    expect(badgeBandText("organising_committee", "Accelerator")).toBe("ORGANISING COMMITTEE");
  });
});

describe("resolving the Other role's free text", () => {
  it("stores the trimmed text", () => {
    expect(resolveRoleLabel("other", "  Accelerator  ")).toEqual({ ok: true, value: "Accelerator" });
  });

  it("refuses Other with nothing typed", () => {
    expect(resolveRoleLabel("other", "").ok).toBe(false);
    expect(resolveRoleLabel("other", "   ").ok).toBe(false);
    expect(resolveRoleLabel("other", null).ok).toBe(false);
  });

  it("refuses text the band cannot print", () => {
    expect(resolveRoleLabel("other", "x".repeat(ROLE_LABEL_MAX)).ok).toBe(true);
    expect(resolveRoleLabel("other", "x".repeat(ROLE_LABEL_MAX + 1)).ok).toBe(false);
  });

  // Switching AWAY from Other clears the column. Without this the old text sits
  // there and reappears the next time someone picks Other, looking deliberate.
  it("clears the label for every fixed role, whatever was typed", () => {
    expect(resolveRoleLabel("visitor", "Accelerator")).toEqual({ ok: true, value: null });
    expect(resolveRoleLabel("strawberry", "Accelerator")).toEqual({ ok: true, value: null });
  });

  // The cap must stay inside what bandFontSize can actually shrink to fit:
  // BAND_TEXT_WIDTH / (BAND_ADVANCE * BAND_MIN_SIZE) = 25 characters. At 26 the
  // font floors and both renderers clip, silently.
  it("keeps the cap inside what the band can print", () => {
    const longest = "W".repeat(ROLE_LABEL_MAX);
    expect(bandFontSize(longest, TAG_SIZE)).toBeGreaterThan(BAND_MIN_SIZE);
  });
});
