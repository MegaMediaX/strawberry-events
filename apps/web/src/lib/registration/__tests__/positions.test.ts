import { describe, it, expect } from "vitest";
import { buildOrderPositions } from "@/lib/registration/service";

const attendee = { firstName: "Abdulrahman", lastName: "Alman", email: "a@b.com" };

describe("buildOrderPositions", () => {
  it("expands each ticket into one priced position per quantity", () => {
    const priceById = new Map([
      [1, 2500],
      [2, 0],
    ]);
    const { positions, totalCents } = buildOrderPositions(
      [
        { itemId: 1, quantity: 2 },
        { itemId: 2, quantity: 1 },
      ],
      priceById,
      attendee,
    );
    expect(positions).toHaveLength(3);
    expect(positions.map((p) => p.item)).toEqual([1, 1, 2]);
    expect(positions.map((p) => p.price)).toEqual(["25.00", "25.00", "0.00"]);
    expect(totalCents).toBe(5000);
  });

  it("attaches the registrant name + email to every position (pretix requires it for admission items)", () => {
    const { positions } = buildOrderPositions(
      [
        { itemId: 10, quantity: 1 }, // General admission
        { itemId: 11, quantity: 1 }, // Day One
        { itemId: 12, quantity: 1 }, // Day Two
        { itemId: 13, quantity: 1 }, // Day Three
      ],
      new Map([
        [10, 0],
        [11, 0],
        [12, 0],
        [13, 0],
      ]),
      attendee,
    );
    expect(positions).toHaveLength(4);
    for (const p of positions) {
      expect(p.attendee_name).toBe("Abdulrahman Alman");
      expect(p.attendee_email).toBe("a@b.com");
    }
  });

  it("omits attendee_name when the registrant name is blank, but keeps the email", () => {
    const { positions } = buildOrderPositions(
      [{ itemId: 1, quantity: 1 }],
      new Map([[1, 0]]),
      { firstName: "", lastName: "", email: "a@b.com" },
    );
    expect(positions[0].attendee_name).toBeUndefined();
    expect(positions[0].attendee_email).toBe("a@b.com");
  });

  it("prices unknown items at zero without throwing", () => {
    const { positions, totalCents } = buildOrderPositions(
      [{ itemId: 999, quantity: 1 }],
      new Map(),
      attendee,
    );
    expect(positions[0].price).toBe("0.00");
    expect(totalCents).toBe(0);
  });
});
