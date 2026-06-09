import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { listCheckinLists, performCheckin } from "@/lib/pretix/checkin";
import { NotImplemented } from "@/lib/pretix/errors";
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
      jsonResponse({
        count: 1,
        next: null,
        results: [{ id: 1, name: "Main", all_products: true }],
      }),
    );
    const lists = await listCheckinLists("strawberry", "expo");
    expect(spy.mock.calls[0][0]).toBe(
      "https://pretix.example.com/api/v1/organizers/strawberry/events/expo/checkinlists/",
    );
    expect(lists[0]).toMatchObject({ id: 1, name: "Main" });
  });
});

describe("performCheckin", () => {
  it("still throws NotImplemented in M2", () => {
    expect(() => performCheckin("strawberry", "expo", 1, "secret")).toThrow(
      NotImplemented,
    );
  });
});
