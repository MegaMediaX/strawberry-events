import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    attendeeOrder: { findMany: vi.fn() },
    userProfile: { findUnique: vi.fn(), upsert: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { listMyRegistrations, getMyProfile, updateMyProfile } from "@/lib/portal/account";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const session: SessionContext = { userId: "u1", isSuperAdmin: false, memberships: [] };

const order = (o: Record<string, unknown> = {}) => ({
  id: "o1", orderCode: "ABC12", status: "pending", approvalStatus: "not_required",
  pretixSecret: "SEC", magicLinkToken: "mlt", createdAt: new Date(),
  eventMapping: { titleEn: "Expo" }, ...o,
});

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.attendeeOrder.findMany).mockResolvedValue([]);
});

describe("listMyRegistrations — strict userId scope + QR gating", () => {
  it("queries ONLY the session user's orders", async () => {
    await listMyRegistrations(session);
    expect(mock(prisma.attendeeOrder.findMany).mock.calls[0][0].where).toEqual({ userId: "u1" });
  });

  it("hides QR for an unissued (pending-payment) registration", async () => {
    mock(prisma.attendeeOrder.findMany).mockResolvedValue([order({ status: "pending" })]);
    const rows = await listMyRegistrations(session);
    expect(rows[0].state).toBe("pending_payment");
    expect(rows[0].qrValue).toBeNull();
  });

  it("exposes QR only when issued", async () => {
    mock(prisma.attendeeOrder.findMany).mockResolvedValue([order({ status: "paid", approvalStatus: "not_required" })]);
    const rows = await listMyRegistrations(session);
    expect(rows[0].state).toBe("issued");
    expect(rows[0].qrValue).toBe("SEC");
  });
});

describe("getMyProfile", () => {
  it("returns defaults when there is no profile row", async () => {
    mock(prisma.userProfile.findUnique).mockResolvedValue(null);
    expect(await getMyProfile(session)).toEqual({ phone: null, phoneCC: null, preferredLocale: "en" });
    expect(mock(prisma.userProfile.findUnique).mock.calls[0][0].where).toEqual({ userId: "u1" });
  });
});

describe("updateMyProfile — own-userId scope only", () => {
  it("upserts strictly the session user's profile, normalizing inputs", async () => {
    mock(prisma.userProfile.upsert).mockResolvedValue({});
    await updateMyProfile(session, { phone: " 70123456 ", phoneCC: "+961", preferredLocale: "ar" });
    const arg = mock(prisma.userProfile.upsert).mock.calls[0][0];
    expect(arg.where).toEqual({ userId: "u1" });
    expect(arg.update).toEqual({ phone: "70123456", phoneCC: "+961", preferredLocale: "ar" });
    expect(arg.create.userId).toBe("u1");
  });

  it("never trusts a client-supplied locale beyond en/ar", async () => {
    mock(prisma.userProfile.upsert).mockResolvedValue({});
    await updateMyProfile(session, { preferredLocale: "fr" as never });
    expect(mock(prisma.userProfile.upsert).mock.calls[0][0].update.preferredLocale).toBe("en");
  });
});
