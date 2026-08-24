import { describe, it, expect } from "vitest";

import { rosterCsv, type Roster, type RosterEntry } from "@/lib/admin/data";

const entry = (over: Partial<RosterEntry> = {}): RosterEntry => ({
  orderCode: "ABC12",
  name: "Jane",
  email: "j@x.com",
  company: "Acme",
  jobTitle: "CTO",
  phone: "+96170123456",
  attendeeType: "company",
  seats: 1,
  inAppDb: true,
  ...over,
});

const roster = (entries: RosterEntry[]): Roster => ({
  itemId: 7,
  itemName: "Workshop",
  subEventTitle: null,
  category: null,
  dateFrom: null,
  entries,
  headcount: entries.reduce((n, e) => n + e.seats, 0),
});

describe("rosterCsv — job title", () => {
  it("keeps the job title under its own header", () => {
    // A column inserted into the header array but not the cell array shifts
    // Phone, Attendee type, Seats and In app DB one place left. The roster is
    // printed and handed to session staff, so a silent shift is read as fact.
    const [header, row] = rosterCsv(roster([entry()])).split("\n");
    const at = header.split(",").indexOf("Job title");
    expect(at).toBeGreaterThan(-1);
    expect(row.split(",")[at]).toBe("CTO");
  });

  it("neutralizes formula injection in the job title", () => {
    // Free text via the "Other" path, printed into a spreadsheet.
    const csv = rosterCsv(roster([entry({ jobTitle: "=HYPERLINK(\"http://evil\")" })]));
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).not.toMatch(/,=HYPERLINK/);
  });

  it("renders an absent job title as an empty cell, not the word null", () => {
    // Every roster line for the registrations taken before the field existed.
    const [header, row] = rosterCsv(roster([entry({ jobTitle: "" })])).split("\n");
    const at = header.split(",").indexOf("Job title");
    expect(row.split(",")[at]).toBe("");
  });
});
