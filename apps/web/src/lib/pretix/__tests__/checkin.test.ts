import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  listCheckinLists,
  redeemCheckin,
  checkinCounters,
} from "@/lib/pretix/checkin";
import { installFetchMock, jsonResponse, setPretixEnv } from "./helpers";

const originalEnv = { ...process.env };
beforeEach(() => setPretixEnv());
afterEach(() => {
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

describe("listCheckinLists", () => {
  it("GETs the checkinlists (paginated)", async () => {
    const spy = installFetchMock(
      jsonResponse({ count: 1, next: null, results: [{ id: 1, name: "Main", all_products: true }] }),
    );
    const lists = await listCheckinLists("strawberry", "expo");
    expect(spy.mock.calls[0][0]).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/checkinlists/",
    );
    expect(lists[0].name).toBe("Main");
  });
});

describe("redeemCheckin", () => {
  it("POSTs redeem with the secret and returns ok", async () => {
    const spy = installFetchMock(jsonResponse({ status: "ok" }));
    const res = await redeemCheckin("strawberry", "expo", 5, "SECRET123");
    const [url, init] = spy.mock.calls[0];
    expect(url).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/checkinlists/5/positions/SECRET123/redeem/",
    );
    expect(init?.method).toBe("POST");
    expect(res.status).toBe("ok");
  });

  it("surfaces an already-redeemed error without throwing", async () => {
    installFetchMock(jsonResponse({ status: "error", reason: "already_redeemed" }, 400));
    const res = await redeemCheckin("strawberry", "expo", 5, "SECRET123");
    expect(res.status).toBe("error");
    expect(res.reason).toBe("already_redeemed");
  });
});

describe("checkinCounters", () => {
  it("reads position + checkin counts from the list", async () => {
    const spy = installFetchMock(
      jsonResponse({ id: 5, name: "Main", position_count: 120, checkin_count: 30 }),
    );
    const c = await checkinCounters("strawberry", "expo", 5);
    expect(spy.mock.calls[0][0]).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/checkinlists/5/",
    );
    expect(c).toEqual({ total: 120, checkedIn: 30 });
  });
});
