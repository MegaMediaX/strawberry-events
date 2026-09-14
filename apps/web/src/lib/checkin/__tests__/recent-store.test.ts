import { describe, it, expect, beforeEach } from "vitest";

import {
  clearRecent,
  loadRecent,
  recentKey,
  saveRecent,
  type RecentEntry,
} from "../recent-store";

class MemoryStorage {
  private map = new Map<string, string>();
  getItem(k: string) {
    return this.map.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.map.set(k, v);
  }
  removeItem(k: string) {
    this.map.delete(k);
  }
}

let storage: MemoryStorage;

beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { window?: unknown }).window = { sessionStorage: storage };
});

const entries: RecentEntry[] = [
  { id: 2, orderCode: "9ZZQ2", name: "Marven Mouaalem", kind: "in", at: "09:12" },
  { id: 1, orderCode: "3XKQ7", name: "Elias Daou", kind: "reprint", at: "09:10" },
];

/**
 * The "Just now" list is the only route to Fix and Reprint for the people who
 * just walked in — the window in which a misspelt badge is noticed. Held in
 * component state alone, a reload emptied it and recovery meant searching for
 * someone already inside.
 */
describe("the recent list survives a reload", () => {
  it("comes back in the order it went in", () => {
    saveRecent("evt", 7, entries);
    expect(loadRecent("evt", 7)).toEqual(entries);
  });

  it("is kept per event and per check-in day", () => {
    saveRecent("evt", 7, entries);
    expect(loadRecent("evt", 8)).toEqual([]);
    expect(loadRecent("other-event", 7)).toEqual([]);
  });

  it("can be emptied", () => {
    saveRecent("evt", 7, entries);
    clearRecent("evt", 7);
    expect(loadRecent("evt", 7)).toEqual([]);
  });
});

describe("what comes back is re-checked", () => {
  // sessionStorage is writable by anyone with the console open, and a stray
  // entry would render live Fix and Reprint buttons against whatever it held.
  it("ignores unparseable content", () => {
    storage.setItem(recentKey("evt", 7), "{not json");
    expect(loadRecent("evt", 7)).toEqual([]);
  });

  it("ignores a payload that is not a list", () => {
    storage.setItem(recentKey("evt", 7), '{"id":1}');
    expect(loadRecent("evt", 7)).toEqual([]);
  });

  it("drops entries missing an order code or carrying an unknown kind", () => {
    storage.setItem(
      recentKey("evt", 7),
      JSON.stringify([
        entries[0],
        { id: 3, orderCode: "", name: "No code", kind: "in", at: "09:15" },
        { id: 4, orderCode: "ABCDE", name: "Bad kind", kind: "deleted", at: "09:16" },
        { id: "5", orderCode: "ABCDE", name: "Bad id", kind: "in", at: "09:17" },
        null,
      ]),
    );
    expect(loadRecent("evt", 7)).toEqual([entries[0]]);
  });

  it("survives a storage that throws", () => {
    (globalThis as { window?: unknown }).window = {
      get sessionStorage(): never {
        throw new Error("blocked");
      },
    };
    expect(() => saveRecent("evt", 7, entries)).not.toThrow();
    expect(loadRecent("evt", 7)).toEqual([]);
  });
});
