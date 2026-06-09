import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findMany: vi.fn(), findFirst: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/products", () => ({
  listItems: vi.fn(),
  listQuotas: vi.fn(),
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
    expect(open.map((e) => e.id)).toEqual(["e1"]);
    expect(comingSoon.map((e) => e.id)).toEqual(["e2"]);
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
});
