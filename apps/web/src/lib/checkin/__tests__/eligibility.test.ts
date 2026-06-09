import { describe, it, expect } from "vitest";
import { checkinEligibility, tagForItem } from "@/lib/checkin/eligibility";

describe("checkinEligibility", () => {
  it("allows an issued order", () => {
    expect(
      checkinEligibility({ approvalStatus: "not_required", status: "paid" }).ok,
    ).toBe(true);
  });
  it("rejects pending payment", () => {
    const r = checkinEligibility({ approvalStatus: "not_required", status: "pending" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/payment/i);
  });
  it("rejects pending approval", () => {
    const r = checkinEligibility({ approvalStatus: "pending", status: "pending" });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/approval/i);
  });
  it("rejects rejected and canceled", () => {
    expect(checkinEligibility({ approvalStatus: "rejected", status: "pending" }).ok).toBe(false);
    expect(checkinEligibility({ approvalStatus: "approved", status: "canceled" }).ok).toBe(false);
  });
});

describe("tagForItem", () => {
  it("maps item id to its configured tag", () => {
    expect(tagForItem({ "7": "media", "8": "partner" }, 7)).toBe("media");
  });
  it("defaults to visitor when unmapped", () => {
    expect(tagForItem({}, 99)).toBe("visitor");
    expect(tagForItem({ "7": "media" }, 8)).toBe("visitor");
  });
  it("ignores invalid tag values", () => {
    expect(tagForItem({ "7": "bogus" }, 7)).toBe("visitor");
  });
});
