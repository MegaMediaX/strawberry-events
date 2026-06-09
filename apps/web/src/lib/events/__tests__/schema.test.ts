import { describe, it, expect } from "vitest";
import { eventInputSchema, ticketInputSchema } from "@/lib/events/schema";

describe("eventInputSchema", () => {
  const valid = {
    titleEn: "Expo",
    slug: "expo-2026",
    dateFrom: "2026-09-01T09:00:00Z",
  };

  it("accepts a valid event", () => {
    expect(eventInputSchema.safeParse(valid).success).toBe(true);
  });

  it("requires titleEn", () => {
    expect(
      eventInputSchema.safeParse({ ...valid, titleEn: "" }).success,
    ).toBe(false);
  });

  it("rejects a bad slug", () => {
    expect(
      eventInputSchema.safeParse({ ...valid, slug: "Has Spaces!" }).success,
    ).toBe(false);
  });

  it("requires dateFrom", () => {
    const { dateFrom, ...rest } = valid;
    void dateFrom;
    expect(eventInputSchema.safeParse(rest).success).toBe(false);
  });
});

describe("ticketInputSchema", () => {
  it("accepts a valid ticket", () => {
    expect(
      ticketInputSchema.safeParse({
        titleEn: "Visitor",
        priceCents: 2500,
        quotaSize: 100,
      }).success,
    ).toBe(true);
  });

  it("allows null quotaSize (unlimited)", () => {
    expect(
      ticketInputSchema.safeParse({
        titleEn: "Visitor",
        priceCents: 0,
        quotaSize: null,
      }).success,
    ).toBe(true);
  });

  it("rejects negative price", () => {
    expect(
      ticketInputSchema.safeParse({
        titleEn: "X",
        priceCents: -1,
        quotaSize: 1,
      }).success,
    ).toBe(false);
  });
});
