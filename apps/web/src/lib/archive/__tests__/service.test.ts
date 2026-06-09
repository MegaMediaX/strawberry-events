import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    archiveQueue: { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { archive, restore, markPurged, cleanup } from "@/lib/archive/service";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const orgAdmin: SessionContext = {
  userId: "u1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u2", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};
const staff: SessionContext = {
  userId: "u3", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: [] }],
};

const input = {
  entityType: "order", entityId: "o1", organizationId: "orgA", payload: { a: 1 },
};

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.archiveQueue.create).mockImplementation(async ({ data }) => ({ ...data, id: "a1" }));
  mock(prisma.archiveQueue.update).mockImplementation(async ({ data }) => ({ id: "a1", ...data }));
});

describe("archive", () => {
  it("queues (no hard delete) with a ~14-day purge window", async () => {
    const row = await archive(orgAdmin, input);
    const data = mock(prisma.archiveQueue.create).mock.calls[0][0].data;
    expect(data.status).toBe("queued");
    const days = (data.purgeAfter.getTime() - Date.now()) / 86_400_000;
    expect(days).toBeGreaterThan(13.9);
    expect(days).toBeLessThan(14.1);
    expect(row.id).toBe("a1");
  });

  it("finance / checkin / impersonating cannot archive; cross-org denied", async () => {
    await expect(archive(finance, input)).rejects.toThrow();
    await expect(archive(staff, input)).rejects.toThrow();
    await expect(archive({ ...orgAdmin, impersonating: true }, input)).rejects.toThrow();
    await expect(archive(orgAdmin, { ...input, organizationId: "orgB" })).rejects.toThrow();
  });
});

describe("restore", () => {
  it("restores a queued item", async () => {
    mock(prisma.archiveQueue.findUnique).mockResolvedValue({ id: "a1", organizationId: "orgA", status: "queued" });
    const r = await restore(orgAdmin, "a1");
    expect(r.status).toBe("restored");
  });
  it("rejects restoring a non-queued item", async () => {
    mock(prisma.archiveQueue.findUnique).mockResolvedValue({ id: "a1", organizationId: "orgA", status: "purged" });
    await expect(restore(orgAdmin, "a1")).rejects.toThrow();
  });
});

describe("markPurged", () => {
  it("purges local snapshot (clears payload), never calls pretix", async () => {
    mock(prisma.archiveQueue.findUnique).mockResolvedValue({ id: "a1", organizationId: "orgA", status: "queued" });
    const r = await markPurged(orgAdmin, "a1");
    expect(r.status).toBe("purged");
    expect(mock(prisma.archiveQueue.update).mock.calls[0][0].data.payload).toEqual({});
  });
  it("finance cannot purge", async () => {
    mock(prisma.archiveQueue.findUnique).mockResolvedValue({ id: "a1", organizationId: "orgA", status: "queued" });
    await expect(markPurged(finance, "a1")).rejects.toThrow();
  });
  it("impersonating cannot purge", async () => {
    mock(prisma.archiveQueue.findUnique).mockResolvedValue({ id: "a1", organizationId: "orgA", status: "queued" });
    await expect(markPurged({ ...orgAdmin, impersonating: true }, "a1")).rejects.toThrow();
  });
});

describe("cleanup", () => {
  it("marks eligible (past-window queued) records as purged", async () => {
    mock(prisma.archiveQueue.findMany).mockResolvedValue([
      { id: "a1", organizationId: "orgA" }, { id: "a2", organizationId: "orgA" },
    ]);
    const res = await cleanup(orgAdmin, new Date());
    expect(res.purged).toBe(2);
    expect(mock(prisma.archiveQueue.update)).toHaveBeenCalledTimes(2);
    const where = mock(prisma.archiveQueue.findMany).mock.calls[0][0].where;
    expect(where.status).toBe("queued");
    expect(where.purgeAfter.lte).toBeInstanceOf(Date);
  });
});
