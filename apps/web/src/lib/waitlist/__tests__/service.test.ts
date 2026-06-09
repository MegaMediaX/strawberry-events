import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    waitlistEntry: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

import { prisma } from "@/lib/db/client";
import * as email from "@/lib/email/service";
import { joinWaitlist, promote } from "@/lib/waitlist/service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const orgAdmin: SessionContext = {
  userId: "u1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u2", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};

const entry = {
  id: "w1", eventMappingId: "e1", email: "a@b.com", itemId: null, position: 1, status: "waiting",
  eventMapping: { id: "e1", organizationId: "orgA", localEventId: "loc1", titleEn: "Expo" },
};

beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_URL = "https://x";
});

describe("joinWaitlist", () => {
  it("assigns next position", async () => {
    mock(prisma.waitlistEntry.findFirst)
      .mockResolvedValueOnce(null) // no existing entry (dedupe)
      .mockResolvedValueOnce({ position: 4 }); // current max
    mock(prisma.waitlistEntry.create).mockImplementation(async ({ data }) => ({ ...data, id: "w9" }));
    await joinWaitlist("e1", "new@b.com", null);
    expect(mock(prisma.waitlistEntry.create).mock.calls[0][0].data.position).toBe(5);
  });

  it("dedupes an existing waiting entry", async () => {
    mock(prisma.waitlistEntry.findFirst).mockResolvedValueOnce({ ...entry });
    const res = await joinWaitlist("e1", "a@b.com", null);
    expect(res.id).toBe("w1");
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });
});

describe("promote", () => {
  beforeEach(() => {
    mock(prisma.waitlistEntry.findFirst).mockResolvedValue(entry);
    mock(prisma.waitlistEntry.update).mockResolvedValue({ ...entry, status: "promoted" });
  });

  it("promotes (organizer admin): status + email + audit", async () => {
    await promote(orgAdmin, "w1");
    expect(mock(prisma.waitlistEntry.update).mock.calls[0][0].data.status).toBe("promoted");
    expect(email.sendEmail).toHaveBeenCalled();
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("finance cannot promote", async () => {
    await expect(promote(finance, "w1")).rejects.toThrow();
  });

  it("impersonating cannot promote", async () => {
    await expect(promote({ ...orgAdmin, impersonating: true }, "w1")).rejects.toThrow();
  });

  it("cross-org denied", async () => {
    mock(prisma.waitlistEntry.findFirst).mockResolvedValue({
      ...entry, eventMapping: { ...entry.eventMapping, organizationId: "orgB" },
    });
    await expect(promote(orgAdmin, "w1")).rejects.toThrow();
  });
});
