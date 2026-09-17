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
  imageDimensions: vi.fn(),
}));

import { prisma } from "@/lib/db/client";
import { saveCoverImage, deleteCoverImage, imageDimensions } from "@/lib/events/cover-image";
import { setEventCover, removeEventCover, setCoverFocus } from "@/lib/events/service";

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
  m(imageDimensions).mockReturnValue({ width: 1600, height: 900 });
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
      coverWidth: 1600,
      coverHeight: 900,
      coverFocusX: 50,
      coverFocusY: 50,
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  /**
   * Unknown size is stored as null, never guessed. These columns are read
   * straight out to link-preview scrapers, and a declared size that is wrong
   * makes the preview reserve the wrong box — worse than declaring none, which
   * is what every cover did before this column existed.
   */
  it("stores no dimensions when the header cannot be read", async () => {
    m(imageDimensions).mockReturnValue(null);
    m(prisma.eventMapping.findUnique).mockResolvedValue({
      id: "e1", organizationId: "orgA", localEventId: "loc1", coverImagePath: null,
    });
    await setEventCover(orgAdmin, "e1", bytes);
    expect(m(prisma.eventMapping.update).mock.calls[0][0].data).toMatchObject({
      coverWidth: null,
      coverHeight: null,
    });
  });

  /**
   * A new picture is a new crop. Carrying the old focus over would aim at the
   * previous poster's subject, at the previous poster's coordinates, in an
   * image that no longer contains it — and the organiser would have no reason
   * to suspect the crop had an opinion at all.
   */
  it("resets the focus to centre, because the old one pointed into another image", async () => {
    m(prisma.eventMapping.findUnique).mockResolvedValue({
      id: "e1", organizationId: "orgA", localEventId: "loc1",
      coverImagePath: "old.jpg", coverFocusX: 10, coverFocusY: 90,
    });
    await setEventCover(orgAdmin, "e1", bytes);
    expect(m(prisma.eventMapping.update).mock.calls[0][0].data).toMatchObject({
      coverFocusX: 50,
      coverFocusY: 50,
    });
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

    // Everything the removed cover knew goes with it: a stale size or focus
    // left behind would be applied to whatever is uploaded next.
    expect(m(prisma.eventMapping.update).mock.calls[0][0].data).toEqual({
      coverImagePath: null,
      coverWidth: null,
      coverHeight: null,
      coverFocusX: 50,
      coverFocusY: 50,
    });
    expect(deleteCoverImage).toHaveBeenCalledWith("cur.webp");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
});

describe("setCoverFocus", () => {
  beforeEach(() => {
    m(prisma.eventMapping.findUnique).mockResolvedValue({
      id: "e1", organizationId: "orgA", localEventId: "loc1", coverImagePath: "cur.webp",
    });
  });

  it("records the focus and audits it — it changes what an attendee sees", async () => {
    await setCoverFocus(orgAdmin, "e1", 30, 80);
    expect(m(prisma.eventMapping.update).mock.calls[0][0].data).toEqual({
      coverFocusX: 30,
      coverFocusY: 80,
    });
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });

  /** Clamped, never thrown: an organiser must always be able to fix their own picture. */
  it("clamps rather than refusing", async () => {
    await setCoverFocus(orgAdmin, "e1", -5, 900);
    expect(m(prisma.eventMapping.update).mock.calls[0][0].data).toEqual({
      coverFocusX: 0,
      coverFocusY: 100,
    });
  });

  it("denies an event in another org", async () => {
    m(prisma.eventMapping.findUnique).mockResolvedValue({
      id: "e1", organizationId: "orgB", localEventId: "loc1", coverImagePath: "cur.webp",
    });
    await expect(setCoverFocus(orgAdmin, "e1", 20, 20)).rejects.toThrow();
    expect(prisma.eventMapping.update).not.toHaveBeenCalled();
  });

  it("denies finance role", async () => {
    await expect(setCoverFocus(finance, "e1", 20, 20)).rejects.toThrow();
    expect(prisma.eventMapping.update).not.toHaveBeenCalled();
  });

  it("denies an impersonating session", async () => {
    await expect(
      setCoverFocus({ ...orgAdmin, impersonating: true }, "e1", 20, 20),
    ).rejects.toThrow(/impersonat/i);
  });
});
