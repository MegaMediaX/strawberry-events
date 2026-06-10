import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { attendeeOrder: { findFirst: vi.fn() } },
}));
vi.mock("@/lib/tokens/magic-link", () => ({ verifyMagicLink: vi.fn() }));

import { prisma } from "@/lib/db/client";
import * as magic from "@/lib/tokens/magic-link";
import { getOrderByCode, getOrderByToken } from "@/lib/registration/access";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("getOrderByCode", () => {
  it("queries by order code alone when no event slug is given (token path)", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue({ id: "o1" });
    await getOrderByCode("ABCD-1234");
    const arg = mock(prisma.attendeeOrder.findFirst).mock.calls[0][0];
    expect(arg.where).toEqual({ orderCode: "ABCD-1234" });
  });

  it("scopes the lookup to the event slug when one is supplied", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue({ id: "o1" });
    await getOrderByCode("ABCD-1234", "expo");
    const arg = mock(prisma.attendeeOrder.findFirst).mock.calls[0][0];
    expect(arg.where).toEqual({
      orderCode: "ABCD-1234",
      eventMapping: { pretixEventSlug: "expo" },
    });
  });

  it("returns null for a code that does not belong to the given event (IDOR probe)", async () => {
    // Prisma returns null when the order's event does not match the slug filter.
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(null);
    const order = await getOrderByCode("OTHER-9999", "expo");
    expect(order).toBeNull();
  });
});

describe("getOrderByToken", () => {
  it("decodes a valid token and looks up by code without an event slug", async () => {
    mock(magic.verifyMagicLink).mockReturnValue("ABCD-1234");
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue({ id: "o1" });
    await getOrderByToken("good-token");
    const arg = mock(prisma.attendeeOrder.findFirst).mock.calls[0][0];
    expect(arg.where).toEqual({ orderCode: "ABCD-1234" });
  });

  it("returns null without touching the DB for a tampered token", async () => {
    mock(magic.verifyMagicLink).mockReturnValue(null);
    const order = await getOrderByToken("tampered");
    expect(order).toBeNull();
    expect(prisma.attendeeOrder.findFirst).not.toHaveBeenCalled();
  });
});
