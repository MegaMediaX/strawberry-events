import { describe, it, expect } from "vitest";

import { splitName } from "../door-walk-in";

describe("splitName — carrying the search text into the walk-in form", () => {
  it("takes the first word as the given name and the rest as the family name", () => {
    // "Abdel Rahman Al-Hassan" is one family name, not two middle names. Taking
    // only the LAST word would put "Abdel Rahman" in the wrong field for a
    // large share of Lebanese attendees.
    expect(splitName("Mouhamad Abdel Rahman Al-Hassan")).toEqual({
      firstName: "Mouhamad",
      lastName: "Abdel Rahman Al-Hassan",
    });
  });

  it("handles the ordinary two-word case", () => {
    expect(splitName("Elias Daou")).toEqual({ firstName: "Elias", lastName: "Daou" });
  });

  it("leaves the surname empty for a single word, rather than guessing", () => {
    expect(splitName("Elias")).toEqual({ firstName: "Elias", lastName: "" });
  });

  it("survives the messy input a door produces", () => {
    expect(splitName("  Elias   Daou  ")).toEqual({ firstName: "Elias", lastName: "Daou" });
    expect(splitName("")).toEqual({ firstName: "", lastName: "" });
    expect(splitName("   ")).toEqual({ firstName: "", lastName: "" });
  });
});
