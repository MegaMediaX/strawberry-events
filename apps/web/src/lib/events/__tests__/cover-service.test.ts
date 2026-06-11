import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findUnique: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/events/cover-image", () => ({
  saveCoverImage: vi.fn(),
  deleteCoverImage: vi.fn(),
}));

import { prisma } from "@/lib/db/client";
import { saveCoverImage, deleteCoverImage } from "@/lib/events/cover-image";
import { setEventCover, removeEventCover } from "@/lib/events/service";

const m = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const orgAdmin: SessionContext = {
  userId: "u2",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "u3",
  isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};

const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);

beforeEach(() => {
  vi.clearAllMocks();
  m(saveCoverImage).mockResolvedValue("e1-uuid.png");
  m(prisma.eventMapping.update).mockResolvedValue({ id: "e1", coverImagePath: "e1-uuid.png" });
});

describe("setEventCover", () => {
  it("saves the file, records the filename, and audits", async () => {
    m(prisma.eventMapping.findUnique).mockResolvedValue({
      id: "e1", organizationId: "orgA", localEventId: "loc1", coverImagePath: null,
    });
    await setEventCover(orgAdmin, "e1", bytes);

    expect(saveCoverImage).toHaveBeenCalledWith("e1", bytes);
    expect(m(prisma.eventMapping.update).mock.calls[0][0].data).toEqual({
      coverImagePath: "e1-uuid.png",
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  it("deletes the superseded file after pointing the DB at the new one", async () => {
    m(prisma.eventMapping.findUnique).mockResolvedValue({
      id: "e1", organizationId: "orgA", localEventId: "loc1", coverImagePath: "old.jpg",
    });
    await setEventCover(orgAdmin, "e1", bytes);
    expect(deleteCoverImage).toHaveBeenCalledWith("old.jpg");
  });

  it("denies an event in another org (no save, no write)", async () => {
    m(prisma.eventMapping.findUnique).mockResolvedValue({
      id: "e1", organizationId: "orgB", localEventId: "loc1", coverImagePath: null,
    });
    await expect(setEventCover(orgAdmin, "e1", bytes)).rejects.toThrow();
    expect(saveCoverImage).not.toHaveBeenCalled();
    expect(prisma.eventMapping.update).not.toHaveBeenCalled();
  });

  it("denies finance role (cannot manage events)", async () => {
    await expect(setEventCover(finance, "e1", bytes)).rejects.toThrow();
    expect(saveCoverImage).not.toHaveBeenCalled();
  });

  it("denies an impersonating session", async () => {
    await expect(
      setEventCover({ ...orgAdmin, impersonating: true }, "e1", bytes),
    ).rejects.toThrow(/impersonat/i);
  });
});

describe("removeEventCover", () => {
  it("clears the column, deletes the file, and audits", async () => {
    m(prisma.eventMapping.findUnique).mockResolvedValue({
      id: "e1", organizationId: "orgA", localEventId: "loc1", coverImagePath: "cur.webp",
    });
    m(prisma.eventMapping.update).mockResolvedValue({ id: "e1", coverImagePath: null });
    await removeEventCover(orgAdmin, "e1");

    expect(m(prisma.eventMapping.update).mock.calls[0][0].data).toEqual({ coverImagePath: null });
    expect(deleteCoverImage).toHaveBeenCalledWith("cur.webp");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});
