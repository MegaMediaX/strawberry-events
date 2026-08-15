import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The auth/rate-limit wrapper is covered by the api handler suite. What matters
// here is only WHICH pretix check-in list the endpoint redeems against: pretix
// tracks redemption per list, so picking day one's list on day two refuses
// every returning attendee as "already redeemed".
vi.mock("@/lib/api/handler", () => ({
  withApi: (_request: Request, _scope: string | null, fn: (ctx: unknown) => Promise<Response>) =>
    fn({ organizationId: "orgA" }),
  resolveApiEvent: vi.fn(),
  methodNotAllowed: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({
  prisma: {
    attendeeOrder: { findFirst: vi.fn() },
    organization: { findUniqueOrThrow: vi.fn() },
    subEvent: { findMany: vi.fn() },
    badgePrintLog: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/context", () => ({ resolvePretixContext: vi.fn() }));
vi.mock("@/lib/pretix/checkin", () => ({
  listCheckinLists: vi.fn(),
  redeemCheckin: vi.fn(),
}));
vi.mock("@/lib/checkin/eligibility", () => ({ checkinEligibility: () => ({ ok: true }) }));

import { resolveApiEvent } from "@/lib/api/handler";
import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import { listCheckinLists, redeemCheckin } from "@/lib/pretix/checkin";
import { POST } from "@/app/api/v1/events/[id]/checkins/route";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ id: "e1" });
const body = (extra: Record<string, unknown> = {}) =>
  new Request("https://app/api/v1/events/e1/checkins", {
    method: "POST",
    body: JSON.stringify({ orderCode: "ABC12", ...extra }),
  });

/** The live LEBTECH shape: three per-day lists, three distinct session dates. */
const LISTS = [
  { id: 1, name: "Day 1 - Fri 28 Aug" },
  { id: 2, name: "Day 2 - Sat 29 Aug" },
  { id: 3, name: "Day 3 - Sun 30 Aug" },
];
const SESSIONS = [
  { dateFrom: new Date("2026-08-28T09:30:00.000Z") },
  { dateFrom: new Date("2026-08-28T16:00:00.000Z") },
  { dateFrom: new Date("2026-08-29T09:30:00.000Z") },
  { dateFrom: new Date("2026-08-30T09:30:00.000Z") },
];

/** The list id the endpoint actually sent to pretix. */
const redeemedList = () => mock(redeemCheckin).mock.calls[0][2];

beforeEach(() => {
  vi.clearAllMocks();
  // Only Date is faked. Faking the whole timer set would stall the awaits in
  // the route, since nothing advances the clock.
  vi.useFakeTimers({ toFake: ["Date"] });
  mock(resolveApiEvent).mockResolvedValue({
    id: "e1",
    pretixEventSlug: "leb-tech",
    organizationId: "orgA",
  });
  mock(prisma.attendeeOrder.findFirst).mockResolvedValue({
    id: "o1",
    orderCode: "ABC12",
    pretixSecret: "sec",
  });
  mock(prisma.organization.findUniqueOrThrow).mockResolvedValue({ id: "orgA" });
  mock(prisma.subEvent.findMany).mockResolvedValue(SESSIONS);
  mock(prisma.badgePrintLog.create).mockResolvedValue({ id: "b1", createdAt: new Date() });
  mock(prisma.auditLog.create).mockResolvedValue({});
  mock(resolvePretixContext).mockReturnValue({ organizerSlug: "org", token: "t" });
  mock(listCheckinLists).mockResolvedValue(LISTS);
  mock(redeemCheckin).mockResolvedValue({ status: "ok" });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("POST /api/v1/events/{id}/checkins — which list it redeems against", () => {
  it("uses day two's list on day two, not the first list", async () => {
    // The regression this endpoint shipped with: `lists[0]` meant an attendee
    // scanned in on the 28th was refused on the 29th as "already redeemed".
    vi.setSystemTime(new Date("2026-08-29T09:00:00Z")); // 12:00 in Beirut
    const res = await POST(body(), { params });
    expect(res.status).toBe(201);
    expect(redeemedList()).toBe(2);
  });

  it("uses day three's list on day three", async () => {
    vi.setSystemTime(new Date("2026-08-30T09:00:00Z"));
    await POST(body(), { params });
    expect(redeemedList()).toBe(3);
  });

  it("uses day one's list on day one", async () => {
    vi.setSystemTime(new Date("2026-08-28T09:00:00Z"));
    await POST(body(), { params });
    expect(redeemedList()).toBe(1);
  });

  it("lets an explicit listId win, for reconciliation", async () => {
    vi.setSystemTime(new Date("2026-08-30T09:00:00Z"));
    await POST(body({ listId: 1 }), { params });
    expect(redeemedList()).toBe(1);
  });

  it("rejects a listId that is not a list on this event", async () => {
    // Without this the id goes to pretix and fails opaquely, which at a door
    // reads as "the scanner is broken" rather than "you sent the wrong id".
    const res = await POST(body({ listId: 999 }), { params });
    expect(res.status).toBe(400);
    expect(redeemCheckin).not.toHaveBeenCalled();
  });

  it("rejects a non-integer listId", async () => {
    const res = await POST(body({ listId: "1" }), { params });
    expect(res.status).toBe(400);
    expect(redeemCheckin).not.toHaveBeenCalled();
  });

  it("falls back to the first list when days and lists cannot be paired", async () => {
    // A session added on a fourth date makes the ordinal pairing meaningless.
    // The helper declines and the endpoint keeps its previous behaviour rather
    // than guessing — same contract as the staff page.
    mock(prisma.subEvent.findMany).mockResolvedValue([
      { dateFrom: new Date("2026-08-27T18:00:00.000Z") },
      ...SESSIONS,
    ]);
    vi.setSystemTime(new Date("2026-08-29T09:00:00Z"));
    await POST(body(), { params });
    expect(redeemedList()).toBe(1);
  });

  it("409s when the event has no check-in lists at all", async () => {
    mock(listCheckinLists).mockResolvedValue([]);
    const res = await POST(body(), { params });
    expect(res.status).toBe(409);
    expect(redeemCheckin).not.toHaveBeenCalled();
  });
});
