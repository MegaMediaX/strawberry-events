import { describe, it, expect } from "vitest";
import { BADGE_TAGS, BADGE_TAG_LABEL, badgeBandText } from "@/lib/badges/tags";

describe("the badge role list", () => {
  // A role in the database enum but missing from BADGE_TAGS is assignable
  // nowhere AND rejected by updateAttendeeDetails — it would exist and be
  // unusable, with nothing failing. A security review caught exactly that
  // window while the two lists were briefly out of step mid-edit.
  it("carries every role the product offers", () => {
    expect([...BADGE_TAGS]).toEqual([
      "visitor", "media", "partner", "investor", "startup", "government",
      "speaker", "moderator", "staff",
      "exhibitor", "organising_committee", "organiser", "cofounder",
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
