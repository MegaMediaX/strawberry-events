import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

// --- mocks ---
vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    organization: { findUnique: vi.fn() },
    pretixObjectMapping: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/events", () => ({
  createEvent: vi.fn(),
  deleteEvent: vi.fn(),
  updateEvent: vi.fn(),
  getEvent: vi.fn(),
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
  updateEvent,
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
const finance: SessionContext = {
  userId: "u3",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};
const checkinStaff: SessionContext = {
  userId: "u4",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: [] }],
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
    waitlistEnabled: false,
    seatSelectionEnabled: false,
    badgeAutoPrint: false,
    payBeforeApproval: false,
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

describe("updateEvent (D7 live flag)", () => {
  const m = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
  const liveInput = {
    titleEn: "Expo", titleAr: null, slug: "expo", descriptionEn: null, descriptionAr: null,
    dateFrom: "2026-09-01T09:00:00Z", dateTo: null,
    visibility: "public", accountMode: "optional", approvalMode: "none",
    comingSoon: false, live: true,
  } as never;

  it("forwards input.live to pretix and persists liveOnPretix locally", async () => {
    m(prisma.eventMapping.findUnique).mockResolvedValue({
      id: "e1", organizationId: "orgA", localEventId: "loc1", pretixEventSlug: "expo",
    });
    m(prisma.organization.findUnique).mockResolvedValue(org);
    m(pretixEvents.updateEvent).mockResolvedValue({});
    m(prisma.eventMapping.update).mockResolvedValue({ id: "e1" });

    await updateEvent(orgAdmin, "e1", liveInput);

    const patch = m(pretixEvents.updateEvent).mock.calls[0][2];
    expect(patch.live).toBe(true);
    const data = m(prisma.eventMapping.update).mock.calls[0][0].data;
    expect(data.liveOnPretix).toBe(true);
  });

  it("persists location fields (empty strings normalized to null)", async () => {
    m(prisma.eventMapping.findUnique).mockResolvedValue({
      id: "e1", organizationId: "orgA", localEventId: "loc1", pretixEventSlug: "expo",
    });
    m(prisma.organization.findUnique).mockResolvedValue(org);
    m(pretixEvents.updateEvent).mockResolvedValue({});
    m(prisma.eventMapping.update).mockResolvedValue({ id: "e1" });

    await updateEvent(orgAdmin, "e1", {
      ...(liveInput as Record<string, unknown>),
      venueName: "Main Hall",
      address: "1 Expo Rd",
      city: "Beirut",
      mapUrl: "",
    } as never);

    const data = m(prisma.eventMapping.update).mock.calls[0][0].data;
    expect(data.venueName).toBe("Main Hall");
    expect(data.address).toBe("1 Expo Rd");
    expect(data.city).toBe("Beirut");
    expect(data.mapUrl).toBeNull();
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

describe("role gate — finance/check-in cannot manage events (H3)", () => {
  const input = {
    slug: "x", titleEn: "X", titleAr: null, descriptionEn: null, descriptionAr: null,
    dateFrom: "2026-09-01T09:00:00Z", dateTo: null,
    visibility: "public", accountMode: "optional", approvalMode: "none",
    comingSoon: false, live: false,
  } as never;
  const ticket = { titleEn: "T", titleAr: null, priceCents: 0, quotaSize: null } as never;

  it("finance cannot create an event", async () => {
    await expect(createEvent(finance, org, input)).rejects.toThrow();
    expect(pretixEvents.createEvent).not.toHaveBeenCalled();
  });
  it("finance cannot update an event", async () => {
    await expect(updateEvent(finance, "e1", input)).rejects.toThrow();
  });
  it("finance cannot create a ticket/quota", async () => {
    await expect(createTicket(finance, "e1", ticket)).rejects.toThrow();
    expect(pretixProducts.createItem).not.toHaveBeenCalled();
  });
  it("check-in staff cannot create an event", async () => {
    await expect(createEvent(checkinStaff, org, input)).rejects.toThrow();
  });
  it("impersonating organizer admin cannot create an event", async () => {
    await expect(createEvent({ ...orgAdmin, impersonating: true }, org, input)).rejects.toThrow(/impersonat/i);
  });
  it("organizer admin CAN manage (guard passes; reaches pretix call)", async () => {
    (pretixEvents.createEvent as ReturnType<typeof vi.fn>).mockResolvedValue({ slug: "x" });
    (prisma.eventMapping.create as ReturnType<typeof vi.fn>).mockResolvedValue({ id: "e9" });
    await createEvent(orgAdmin, org, input);
    expect(pretixEvents.createEvent).toHaveBeenCalled();
  });
});
