import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Opening check-in without an event is a choice to offer, not a dead end.
 *
 * It used to call `notFound()` — and once the attendee flow gained a not-found
 * boundary at app/[locale], that 404 became the ATTENDEE's: a door operator
 * told their link may have expired, offered "Browse events" and "My
 * registrations". A named event that does not exist, or one this account may
 * not open, still 404s: there is nothing to choose from there.
 */

const { getSessionContext, findUnique, canAccessEvent } = vi.hoisted(() => ({
  getSessionContext: vi.fn(),
  findUnique: vi.fn(),
  canAccessEvent: vi.fn(),
}));

vi.mock("next-intl/server", () => ({ setRequestLocale: vi.fn() }));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
}));
vi.mock("@/lib/auth/session", () => ({ getSessionContext }));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findUnique },
    organization: { findUniqueOrThrow: vi.fn() },
    subEvent: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/auth/org-scope", () => ({ canAccessEvent, scopeWhere: () => ({}) }));
// Stubbed: this suite is about which SCREEN the route chooses, not about what
// either screen renders.
vi.mock("../../_components/event-picker", () => ({
  StaffEventPicker: () => null,
}));
vi.mock("../checkin-panel", () => ({ CheckinPanel: () => null }));

import { StaffEventPicker } from "../../_components/event-picker";
import CheckinPage from "../page";

const render = (searchParams: Record<string, string>) =>
  CheckinPage({
    params: Promise.resolve({ locale: "en" }),
    searchParams: Promise.resolve(searchParams),
  });

beforeEach(() => {
  vi.clearAllMocks();
  getSessionContext.mockResolvedValue({ userId: "u1", memberships: [] });
});

describe("check-in without an event", () => {
  it("offers the events this account can open", async () => {
    const node = (await render({})) as { type: unknown; props: Record<string, unknown> };
    expect(node.type).toBe(StaffEventPicker);
    expect(node.props.basePath).toBe("staff/checkin");
    expect(node.props.locale).toBe("en");
  });

  it("does not reach for an event that was never named", async () => {
    await render({});
    expect(findUnique).not.toHaveBeenCalled();
  });
});

describe("check-in with an event it cannot open", () => {
  it("404s for an unknown event", async () => {
    findUnique.mockResolvedValue(null);
    await expect(render({ event: "evt_gone" })).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("404s for an event this account is not assigned to", async () => {
    findUnique.mockResolvedValue({
      id: "evt_1",
      organizationId: "org_1",
      localEventId: "local_1",
    });
    canAccessEvent.mockReturnValue(false);
    await expect(render({ event: "evt_1" })).rejects.toThrow("NEXT_NOT_FOUND");
  });
});

describe("a signed-out request", () => {
  it("404s rather than listing events", async () => {
    getSessionContext.mockResolvedValue(null);
    await expect(render({})).rejects.toThrow("NEXT_NOT_FOUND");
  });
});
