import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findMany: vi.fn(), findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
    subEvent: { findMany: vi.fn().mockResolvedValue([]) },
  },
}));
vi.mock("@/lib/pretix/products", () => ({
  listItems: vi.fn(),
  listQuotas: vi.fn(),
}));
vi.mock("@/lib/pretix/events", () => ({
  getEvent: vi.fn().mockResolvedValue({
    dateFrom: "2026-09-01T09:00:00Z",
    dateTo: null,
  }),
}));

import { prisma } from "@/lib/db/client";
import * as pretixProducts from "@/lib/pretix/products";
import { listPublicEvents, getPublicEvent } from "@/lib/events/public";

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRETIX_API_TOKEN = "env_tok";
});

describe("listPublicEvents", () => {
  it("queries only public, non-coming-soon split", async () => {
    (prisma.eventMapping.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: "e1", titleEn: "Open", comingSoon: false, visibility: "public" },
      { id: "e2", titleEn: "Soon", comingSoon: true, visibility: "public" },
    ]);
    const { open, comingSoon } = await listPublicEvents();
    const where = (prisma.eventMapping.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0].where;
    expect(where.visibility).toBe("public");
    expect(where.liveOnPretix).toBe(true);
    expect(open.map((e) => e.id)).toEqual(["e1"]);
    expect(comingSoon.map((e) => e.id)).toEqual(["e2"]);
  });
});

describe("storefront gate (D7): public AND live", () => {
  it("getPublicEvent requires liveOnPretix in the query", async () => {
    (prisma.eventMapping.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    await getPublicEvent("draft");
    const where = (prisma.eventMapping.findFirst as ReturnType<typeof vi.fn>).mock
      .calls[0][0].where;
    expect(where.visibility).toBe("public");
    expect(where.liveOnPretix).toBe(true);
  });
});

describe("getPublicEvent", () => {
  it("returns null for a non-public event", async () => {
    (prisma.eventMapping.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue(null);
    expect(await getPublicEvent("nope")).toBeNull();
  });

  it("returns event + tickets + aggregated capacity", async () => {
    (prisma.eventMapping.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "e1",
      titleEn: "Expo",
      pretixEventSlug: "expo",
      organizationId: "orgA",
      visibility: "public",
    });
    (prisma.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "orgA",
      pretixOrganizerSlug: "acme",
      pretixApiToken: null,
    });
    (pretixProducts.listItems as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 7, titleEn: "Visitor", titleAr: null, priceCents: 2500, active: true },
    ]);
    (pretixProducts.listQuotas as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 1, size: 100, available_number: 80 },
    ]);

    const res = await getPublicEvent("expo");
    expect(res?.event.id).toBe("e1");
    expect(res?.tickets[0].priceCents).toBe(2500);
    // total 100, available 80 -> sold 20
    expect(res?.capacity).toEqual({ sold: 20, total: 100 });
  });

  it("excludes sub-event items from the main ticket list", async () => {
    (prisma.eventMapping.findFirst as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "e1",
      titleEn: "Expo",
      pretixEventSlug: "expo",
      organizationId: "orgA",
      visibility: "public",
      inviteOnlyItemIds: [],
    });
    (prisma.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "orgA",
      pretixOrganizerSlug: "acme",
      pretixApiToken: null,
    });
    // item 7 is a real ticket; item 33 is a sub-event's pretix item.
    (pretixProducts.listItems as ReturnType<typeof vi.fn>).mockResolvedValue([
      { id: 7, titleEn: "General Admission", titleAr: null, priceCents: 0, active: true },
      { id: 33, titleEn: "Workshop A", titleAr: null, priceCents: 0, active: true },
    ]);
    (pretixProducts.listQuotas as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    (prisma.subEvent.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([
      { pretixItemId: 33 },
    ]);

    const res = await getPublicEvent("expo");
    const ids = res?.tickets.map((t) => t.id);
    expect(ids).toEqual([7]); // sub-event item 33 excluded from main tickets
  });
});
