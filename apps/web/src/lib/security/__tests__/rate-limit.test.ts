import { describe, it, expect, beforeEach } from "vitest";
import { rateLimit, __resetRateLimits } from "@/lib/security/rate-limit";

beforeEach(() => __resetRateLimits());

describe("rateLimit", () => {
  it("allows up to the limit then blocks", () => {
    const t = 1_000_000;
    expect(rateLimit("k", 3, 60_000, t).allowed).toBe(true);
    expect(rateLimit("k", 3, 60_000, t).allowed).toBe(true);
    expect(rateLimit("k", 3, 60_000, t).allowed).toBe(true);
    const blocked = rateLimit("k", 3, 60_000, t);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
  });

  it("resets after the window elapses", () => {
    const t = 2_000_000;
    rateLimit("k2", 1, 60_000, t);
    expect(rateLimit("k2", 1, 60_000, t).allowed).toBe(false);
    expect(rateLimit("k2", 1, 60_000, t + 60_001).allowed).toBe(true);
  });

  it("keys are independent", () => {
    const t = 3_000_000;
    rateLimit("a", 1, 60_000, t);
    expect(rateLimit("a", 1, 60_000, t).allowed).toBe(false);
    expect(rateLimit("b", 1, 60_000, t).allowed).toBe(true);
  });
});
