import { describe, it, expect } from "vitest";

import { createPrintOwnership } from "@/lib/checkin/print-ownership";

describe("print ownership", () => {
  it("lets a lone print write to the screen", () => {
    const o = createPrintOwnership();
    const t = o.claim();
    expect(o.owns(t)).toBe(true);
  });

  it("drops an earlier print once the next attendee is served", () => {
    // THE bug this exists to prevent: A's print fails slowly while B checks in.
    // A must not render its failure under B's name.
    const o = createPrintOwnership();
    const a = o.claim();
    const b = o.claim();

    expect(o.owns(a)).toBe(false);
    expect(o.owns(b)).toBe(true);
  });

  it("ignores resolution order entirely", () => {
    // Prints resolve out of order all the time — a jam takes seconds, a good
    // label takes a moment. Only recency of the CLAIM matters, never of the
    // resolution.
    const o = createPrintOwnership();
    const first = o.claim();
    const second = o.claim();
    const third = o.claim();

    for (const stale of [first, second]) expect(o.owns(stale)).toBe(false);
    expect(o.owns(third)).toBe(true);
  });

  it("never lets two attempts own the screen at once", () => {
    const o = createPrintOwnership();
    const tickets = Array.from({ length: 25 }, () => o.claim());
    expect(tickets.filter((t) => o.owns(t))).toHaveLength(1);
  });

  it("does not recognise a ticket it never issued", () => {
    const o = createPrintOwnership();
    o.claim();
    expect(o.owns(999)).toBe(false);
    expect(o.owns(0)).toBe(false);
  });
});
