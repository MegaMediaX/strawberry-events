import { describe, it, expect } from "vitest";
import { capacityState } from "@/lib/events/capacity";

describe("capacityState", () => {
  it("available below 60%", () => {
    expect(capacityState(0, 100)).toBe("available");
    expect(capacityState(59, 100)).toBe("available");
  });
  it("filling 60-84%", () => {
    expect(capacityState(60, 100)).toBe("filling");
    expect(capacityState(84, 100)).toBe("filling");
  });
  it("almost_full 85-99%", () => {
    expect(capacityState(85, 100)).toBe("almost_full");
    expect(capacityState(99, 100)).toBe("almost_full");
  });
  it("sold_out at 100%+", () => {
    expect(capacityState(100, 100)).toBe("sold_out");
    expect(capacityState(120, 100)).toBe("sold_out");
  });
  it("treats null/zero total as available (unlimited)", () => {
    expect(capacityState(10, null)).toBe("available");
    expect(capacityState(10, 0)).toBe("available");
  });
});
