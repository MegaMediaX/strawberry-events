import { describe, it, expect } from "vitest";
import { splitName } from "@/lib/registration/names";

describe("splitName", () => {
  it("splits a plain two-part name", () => {
    expect(splitName("Roy Boulos")).toEqual({ firstName: "Roy", lastName: "Boulos" });
  });

  it("keeps an honorific with the given name", () => {
    expect(splitName("Dr. Bachir Zoghbi")).toEqual({
      firstName: "Dr. Bachir",
      lastName: "Zoghbi",
    });
  });

  it("treats everything after the first token as the family name", () => {
    expect(splitName("Roy Bou Harb")).toEqual({ firstName: "Roy", lastName: "Bou Harb" });
  });

  it("collapses irregular whitespace", () => {
    expect(splitName("  Roy   Boulos  ")).toEqual({ firstName: "Roy", lastName: "Boulos" });
  });

  it("survives an empty string rather than throwing mid-import", () => {
    expect(splitName("   ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("splitName — names with no family name", () => {
  it("repeats a mononym, because pretix rejects an empty family name", () => {
    expect(splitName("Madonna")).toEqual({ firstName: "Madonna", lastName: "Madonna" });
  });

  it("does not repeat the honorific alongside a single given name", () => {
    // Putting "Dr. Bachir" in both fields renders "Dr. Bachir Dr. Bachir" on a
    // badge. The repetition is unavoidable — pretix needs a family name — but
    // the title appearing twice is not.
    expect(splitName("Dr. Bachir")).toEqual({ firstName: "Dr. Bachir", lastName: "Bachir" });
    expect(splitName("Eng. Sami")).toEqual({ firstName: "Eng. Sami", lastName: "Sami" });
  });

  it("treats a bare honorific as an ordinary single token", () => {
    expect(splitName("Dr.")).toEqual({ firstName: "Dr.", lastName: "Dr." });
  });
});

describe("splitName — round trip", () => {
  it("reproduces the supplied name whenever there is a family name", () => {
    for (const name of ["Roy Boulos", "Dr. Bachir Zoghbi", "Roy Bou Harb", "Hélène Waked"]) {
      const { firstName, lastName } = splitName(name);
      expect(`${firstName} ${lastName}`).toBe(name);
    }
  });

  it("does NOT round-trip a name with no family name, by necessity", () => {
    // Pinned rather than left implicit: the old doc claimed the round trip held
    // universally, and it never did. A caller that concatenates must expect this.
    const { firstName, lastName } = splitName("Madonna");
    expect(`${firstName} ${lastName}`).toBe("Madonna Madonna");
  });
});
