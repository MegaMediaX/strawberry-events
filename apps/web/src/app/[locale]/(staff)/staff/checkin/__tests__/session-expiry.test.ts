import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * A door whose session has ended is not refusing anybody.
 *
 * Every action used to answer `{ ok: false, reason: "Not authenticated" }`,
 * which the panel rendered through the same red banner a bad ticket uses —
 * STOP, against a valid attendee, once per person for the rest of the queue,
 * with nothing on screen leading back to a sign-in.
 */

const { getSessionContext } = vi.hoisted(() => ({ getSessionContext: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getSessionContext }));
vi.mock("@/lib/checkin/service", () => ({
  searchAttendees: vi.fn(),
  checkInOrder: vi.fn(),
  checkInBySecret: vi.fn(),
  reprintBadge: vi.fn(),
  updateAttendeeDetails: vi.fn(),
  getAttendeeForEdit: vi.fn(),
}));
vi.mock("@/lib/staff/walkin", () => ({ createWalkIn: vi.fn() }));

import {
  checkInAction,
  scanAction,
  reprintAction,
  correctAttendeeAction,
  attendeeForEditAction,
  searchAction,
  walkInAndCheckInAction,
} from "../actions";

beforeEach(() => {
  getSessionContext.mockReset();
  getSessionContext.mockResolvedValue(null);
});

const walkIn = {
  firstName: "Marven",
  lastName: "Mouaalem",
  roleTag: "visitor" as const,
  itemId: 1,
};

describe("an expired session is flagged, not reported as a refusal", () => {
  it("flags every check-in path", async () => {
    for (const res of [
      await checkInAction("evt", "ABCDE", 7),
      await scanAction("evt", "some-secret", 7),
      await reprintAction("evt", "ABCDE"),
      await correctAttendeeAction("evt", "ABCDE", {
        fullName: "Marven Mouaalem",
      } as never),
      await walkInAndCheckInAction("evt", walkIn, 7),
    ]) {
      expect(res.ok).toBe(false);
      expect(res.authExpired).toBe(true);
      // And it says what to do, rather than naming a system state.
      expect(res.reason).toMatch(/sign in again/i);
    }
  });

  it("flags the paths that do not return a CheckInResult", async () => {
    // Every consumer of this flag has to read it — three of them did not, in
    // three separate rounds. These two carry their own result shapes, which is
    // how they were missed.
    expect(await attendeeForEditAction("evt", "ABCDE")).toEqual({
      ok: false,
      authExpired: true,
      reason: expect.stringMatching(/sign in again/i),
    });
    expect(await searchAction("evt", "marven")).toEqual({
      ok: false,
      authExpired: true,
    });
  });

  it("does not flag an ordinary refusal", async () => {
    getSessionContext.mockResolvedValue({ userId: "u1", memberships: [] });
    const { checkInOrder } = await import("@/lib/checkin/service");
    vi.mocked(checkInOrder).mockResolvedValue({ ok: false, reason: "Ticket not found" });

    const res = await checkInAction("evt", "ABCDE", 7);
    expect(res.ok).toBe(false);
    expect(res.authExpired).toBeUndefined();
  });
});

describe("failures the door cannot see are not read out to attendees", () => {
  it("replaces the thrown message with something actionable", async () => {
    getSessionContext.mockResolvedValue({ userId: "u1", memberships: [] });
    const { checkInOrder } = await import("@/lib/checkin/service");
    vi.mocked(checkInOrder).mockRejectedValue(
      new Error("connect ECONNREFUSED 10.0.0.4:5432"),
    );

    const res = await checkInAction("evt", "ABCDE", 7);
    expect(res.ok).toBe(false);
    expect(res.reason).not.toContain("ECONNREFUSED");
    expect(res.reason).toMatch(/try again/i);
  });

  it("keeps the order code when a walk-in registered but did not check in", async () => {
    getSessionContext.mockResolvedValue({ userId: "u1", memberships: [] });
    const { createWalkIn } = await import("@/lib/staff/walkin");
    const { checkInOrder } = await import("@/lib/checkin/service");
    vi.mocked(createWalkIn).mockResolvedValue({ orderCode: "9ZZQ2" } as never);
    vi.mocked(checkInOrder).mockRejectedValue(new Error("pretix 502 Bad Gateway"));

    const res = await walkInAndCheckInAction("evt", walkIn, 7);
    // The order EXISTS — losing that code would strand a real registration.
    expect(res.reason).toContain("9ZZQ2");
    expect(res.reason).not.toContain("502");
    expect(res.reason).toMatch(/find them by name/i);
  });
});
