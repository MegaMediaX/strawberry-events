import { describe, it, expect } from "vitest";
import { chooseActiveOrgId } from "@/lib/auth/active-org";

describe("chooseActiveOrgId", () => {
  it("org_admin gets their own org, ignoring any cookie", () => {
    expect(
      chooseActiveOrgId(["orgA"], false, "orgZ", ["orgA", "orgB"]),
    ).toBe("orgA");
  });

  it("super_admin with a valid cookie gets the cookie org", () => {
    expect(
      chooseActiveOrgId([], true, "orgB", ["orgA", "orgB"]),
    ).toBe("orgB");
  });

  it("super_admin with an invalid cookie falls back to the first org", () => {
    expect(chooseActiveOrgId([], true, "orgZ", ["orgA", "orgB"])).toBe("orgA");
  });

  it("super_admin with no cookie falls back to the first org", () => {
    expect(chooseActiveOrgId([], true, undefined, ["orgA", "orgB"])).toBe(
      "orgA",
    );
  });

  it("returns null when there are no orgs to choose from", () => {
    expect(chooseActiveOrgId([], true, undefined, [])).toBeNull();
  });
});
