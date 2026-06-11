import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { userProfile: { findUnique: vi.fn() } },
}));

import { prisma } from "@/lib/db/client";
import { recipientLocale } from "@/lib/email/recipient-locale";

const m = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => vi.clearAllMocks());

describe("recipientLocale", () => {
  it("returns 'en' for a guest order (no userId) without a DB hit", async () => {
    expect(await recipientLocale(null)).toBe("en");
    expect(await recipientLocale(undefined)).toBe("en");
    expect(prisma.userProfile.findUnique).not.toHaveBeenCalled();
  });

  it("returns the user's stored Arabic preference", async () => {
    m(prisma.userProfile.findUnique).mockResolvedValue({ preferredLocale: "ar" });
    expect(await recipientLocale("u1")).toBe("ar");
    expect(m(prisma.userProfile.findUnique).mock.calls[0][0].where).toEqual({ userId: "u1" });
  });

  it("falls back to 'en' when no profile or an unknown locale", async () => {
    m(prisma.userProfile.findUnique).mockResolvedValue(null);
    expect(await recipientLocale("u2")).toBe("en");
    m(prisma.userProfile.findUnique).mockResolvedValue({ preferredLocale: "fr" });
    expect(await recipientLocale("u3")).toBe("en");
  });
});
