import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

// --- mocks ---
vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    organization: { findUnique: vi.fn() },
    pretixObjectMapping: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/events", () => ({
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
}));
vi.mock("@/lib/pretix/products", () => ({
  createItem: vi.fn(),
  createQuota: vi.fn(),
}));

import { prisma } from "@/lib/db/client";
import * as pretixEvents from "@/lib/pretix/events";
import * as pretixProducts from "@/lib/pretix/products";
import {
  listEventsForSession,
  getEventForSession,
  createEvent,
  createTicket,
} from "@/lib/events/service";

const superAdmin: SessionContext = {
  userId: "u1",
  isSuperAdmin: true,
  memberships: [],
};
const orgAdmin: SessionContext = {
  userId: "u2",
  isSuperAdmin: false,
  memberships: [
    { organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] },
  ],
};

const org = {
  id: "orgA",
  pretixOrganizerSlug: "acme",
  pretixApiToken: null,
} as never;

beforeEach(() => {
  vi.clearAllMocks();
  process.env.PRETIX_API_TOKEN = "env_tok";
});

describe("listEventsForSession", () => {
  it("scopes to the member's org for non-super-admins", async () => {
    (prisma.eventMapping.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await listEventsForSession(orgAdmin);
    const arg = (prisma.eventMapping.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(arg.where).toEqual({ organizationId: { in: ["orgA"] } });
  });

  it("does not constrain super admins", async () => {
    (prisma.eventMapping.findMany as ReturnType<typeof vi.fn>).mockResolvedValue([]);
    await listEventsForSession(superAdmin);
    const arg = (prisma.eventMapping.findMany as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(arg.where).toEqual({});
  });
});

describe("getEventForSession", () => {
  it("returns null when the event belongs to another org", async () => {
    (prisma.eventMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "e1",
      organizationId: "orgB",
      localEventId: "loc1",
    });
    expect(await getEventForSession(orgAdmin, "e1")).toBeNull();
  });

  it("returns the mapping when in the user's org", async () => {
    const mapping = { id: "e1", organizationId: "orgA", localEventId: "loc1" };
    (prisma.eventMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      mapping,
    );
    expect(await getEventForSession(orgAdmin, "e1")).toBe(mapping);
  });
});

describe("createEvent", () => {
  const input = {
    titleEn: "Expo",
    titleAr: null,
    slug: "expo",
    dateFrom: "2026-09-01T09:00:00Z",
    visibility: "public" as const,
    accountMode: "optional" as const,
    approvalMode: "none" as const,
    comingSoon: false,
    live: false,
  };

  it("creates in pretix then writes a scoped mapping + audit", async () => {
    (pretixEvents.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue({
      slug: "expo",
    });
    (prisma.eventMapping.create as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "e1",
    });

    await createEvent(orgAdmin, org, input);

    expect(pretixEvents.createEvent).toHaveBeenCalledWith(
      "acme",
      expect.objectContaining({ slug: "expo", titleEn: "Expo" }),
      "env_tok",
    );
    const createArg = (prisma.eventMapping.create as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(createArg.data.organizationId).toBe("orgA");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("rolls back the pretix event when the DB write fails", async () => {
    (pretixEvents.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue({
      slug: "expo",
    });
    (prisma.eventMapping.create as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("db down"),
    );
    (pretixEvents.deleteEvent as ReturnType<typeof vi.fn>).mockResolvedValue(
      undefined,
    );

    await expect(createEvent(orgAdmin, org, input)).rejects.toThrow("db down");
    expect(pretixEvents.deleteEvent).toHaveBeenCalledWith("acme", "expo", "env_tok");
  });
});

describe("createTicket", () => {
  it("creates a pretix item + quota and records mappings", async () => {
    const mapping = {
      id: "e1",
      organizationId: "orgA",
      localEventId: "loc1",
      pretixEventSlug: "expo",
    };
    (prisma.eventMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      mapping,
    );
    (prisma.organization.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue(
      org,
    );
    (pretixProducts.createItem as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 7,
    });
    (pretixProducts.createQuota as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: 1,
    });

    await createTicket(orgAdmin, "e1", {
      titleEn: "Visitor",
      titleAr: null,
      priceCents: 2500,
      quotaSize: 100,
    });

    expect(pretixProducts.createItem).toHaveBeenCalledWith(
      "acme",
      "expo",
      expect.objectContaining({ titleEn: "Visitor", priceCents: 2500 }),
      "env_tok",
    );
    expect(pretixProducts.createQuota).toHaveBeenCalledWith(
      "acme",
      "expo",
      expect.objectContaining({ size: 100, items: [7] }),
      "env_tok",
    );
    expect(prisma.pretixObjectMapping.create).toHaveBeenCalled();
  });

  it("denies creating a ticket on another org's event", async () => {
    (prisma.eventMapping.findUnique as ReturnType<typeof vi.fn>).mockResolvedValue({
      id: "e1",
      organizationId: "orgB",
      localEventId: "loc1",
      pretixEventSlug: "expo",
    });
    await expect(
      createTicket(orgAdmin, "e1", {
        titleEn: "X",
        titleAr: null,
        priceCents: 0,
        quotaSize: null,
      }),
    ).rejects.toThrow();
    expect(pretixProducts.createItem).not.toHaveBeenCalled();
  });
});
