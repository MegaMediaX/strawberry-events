import { describe, it, expect, beforeEach } from "vitest";

import {
  clearDraft,
  draftHasContent,
  draftKey,
  loadDraft,
  saveDraft,
  type RegistrationDraft,
} from "../draft";

/** A stand-in for sessionStorage; the test environment is node. */
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

const draft: RegistrationDraft = {
  attendee: {
    firstName: "Marven",
    lastName: "Mouaalem",
    email: "marven@strawberry.agency",
    phoneCC: "+961",
    phone: "70123456",
    company: "Strawberry",
    attendeeType: "company",
    jobTitle: "CEO",
    jobTitleOther: "",
  },
  quantities: { 7: 1 },
  optedIn: ["Workshops"],
  subEvents: [{ itemId: 12, quantity: 1 }],
  answers: { "field-1": "Vegetarian" },
};

describe("a registration survives a reload", () => {
  it("comes back as it went in", () => {
    saveDraft("summit", draft);
    expect(loadDraft("summit")).toEqual(draft);
  });

  it("is kept per event, so two open tabs don't overwrite each other", () => {
    saveDraft("summit", draft);
    expect(loadDraft("other-event")).toBeNull();
  });

  it("is gone once the registration succeeds", () => {
    saveDraft("summit", draft);
    clearDraft("summit");
    expect(loadDraft("summit")).toBeNull();
  });
});

describe("what comes back out is re-checked, never trusted", () => {
  // sessionStorage is writable by anyone with the console open, and a draft
  // written before a change to this shape must not put a malformed object
  // into the form's state.
  it("ignores unparseable content", () => {
    storage.setItem(draftKey("summit"), "{not json");
    expect(loadDraft("summit")).toBeNull();
  });

  it("ignores a payload that isn't an object", () => {
    storage.setItem(draftKey("summit"), '"just a string"');
    expect(loadDraft("summit")).toBeNull();
  });

  it("drops fields of the wrong type rather than passing them through", () => {
    storage.setItem(
      draftKey("summit"),
      JSON.stringify({
        attendee: { firstName: 42, email: "a@b.co" },
        quantities: { "7": "lots", "8": 2, notANumber: 3 },
        optedIn: ["Workshops", 5],
        subEvents: [{ itemId: 12, quantity: 1 }, { itemId: "x", quantity: 1 }, null],
        answers: { ok: "yes", bad: 9 },
      }),
    );
    const loaded = loadDraft("summit");
    expect(loaded?.attendee.firstName).toBe("");
    expect(loaded?.attendee.email).toBe("a@b.co");
    expect(loaded?.quantities).toEqual({ 8: 2 });
    expect(loaded?.optedIn).toEqual(["Workshops"]);
    expect(loaded?.subEvents).toEqual([{ itemId: 12, quantity: 1 }]);
    expect(loaded?.answers).toEqual({ ok: "yes" });
  });

  it("survives a storage that throws", () => {
    (globalThis as { window?: unknown }).window = {
      get sessionStorage(): never {
        throw new Error("blocked");
      },
    };
    expect(() => saveDraft("summit", draft)).not.toThrow();
    expect(loadDraft("summit")).toBeNull();
  });
});

describe("draftHasContent", () => {
  it("is false for an untouched form, so nothing is written on page load", () => {
    expect(
      draftHasContent({
        attendee: {
          firstName: "",
          lastName: "",
          email: "",
          phoneCC: "+961",
          phone: "",
          company: "",
          attendeeType: "",
          jobTitle: "",
          jobTitleOther: "",
        },
        quantities: {},
        optedIn: [],
        subEvents: [],
        answers: {},
      }),
    ).toBe(false);
  });

  it("is true once anything has been entered", () => {
    expect(draftHasContent(draft)).toBe(true);
  });
});
