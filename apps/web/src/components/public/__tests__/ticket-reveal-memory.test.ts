import { describe, it, expect } from "vitest";
import {
  claimFirstView,
  browserRevealStore,
  REVEAL_KEY_PREFIX,
  type RevealStore,
} from "../ticket-reveal-memory";

const fakeStore = (): RevealStore & { data: Map<string, string> } => {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
  };
};

describe("claimFirstView", () => {
  it("is true once and false every time after", () => {
    const store = fakeStore();
    expect(claimFirstView("ABC12", store)).toBe(true);
    expect(claimFirstView("ABC12", store)).toBe(false);
    expect(claimFirstView("ABC12", store)).toBe(false);
  });

  /** Two tickets in one inbox are two payoffs. */
  it("tracks each order separately", () => {
    const store = fakeStore();
    expect(claimFirstView("ABC12", store)).toBe(true);
    expect(claimFirstView("XYZ99", store)).toBe(true);
    expect(claimFirstView("ABC12", store)).toBe(false);
  });

  it("namespaces what it writes", () => {
    const store = fakeStore();
    claimFirstView("ABC12", store);
    expect([...store.data.keys()]).toEqual([`${REVEAL_KEY_PREFIX}ABC12`]);
  });

  /**
   * Every failure answers "already seen". A ticket that quietly skips its
   * animation is still a ticket; one that replays it at the door, in a queue,
   * in front of a scanner, is the bug this exists to prevent.
   */
  it.each([
    ["no storage at all", null],
    [
      "a store whose read throws, as with site data blocked",
      {
        getItem: () => {
          throw new Error("SecurityError");
        },
        setItem: () => {},
      } as RevealStore,
    ],
    [
      "a store whose write throws, as in Safari private mode",
      {
        getItem: () => null,
        setItem: () => {
          throw new Error("QuotaExceededError");
        },
      } as RevealStore,
    ],
    ["an empty order code", fakeStore()],
  ])("answers false given %s", (label, store) => {
    expect(claimFirstView(label === "an empty order code" ? "" : "ABC12", store)).toBe(false);
  });

  /**
   * The write-throws case deserves its own statement: the read said "new", so
   * a naive implementation would animate — and would animate again next time,
   * because nothing was recorded. Once-ever is the promise; unable-to-record
   * means the promise cannot be kept, so it is not made.
   */
  it("does not reveal when it cannot record that it did", () => {
    let reads = 0;
    const store: RevealStore = {
      getItem: () => {
        reads += 1;
        return null;
      },
      setItem: () => {
        throw new Error("QuotaExceededError");
      },
    };
    expect(claimFirstView("ABC12", store)).toBe(false);
    expect(claimFirstView("ABC12", store)).toBe(false);
    expect(reads).toBe(2);
  });
});

describe("browserRevealStore", () => {
  it("is null on the server, where there is no window", () => {
    expect(browserRevealStore()).toBeNull();
  });
});
