import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { attendeeOrder: { findFirst: vi.fn(), update: vi.fn() } },
}));
vi.mock("@/lib/tokens/magic-link", () => ({
  verifyMagicLinkClaims: vi.fn(),
  signMagicLink: vi.fn(),
}));

import { prisma } from "@/lib/db/client";
import * as magic from "@/lib/tokens/magic-link";
import {
  getOrderByCode,
  getOrderByToken,
  revokeOrderMagicLink,
  rotateOrderMagicLink,
} from "@/lib/registration/access";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

/** A live order as it exists before any revocation: version 0, never revoked. */
const liveOrder = {
  id: "o1",
  orderCode: "ABCD-1234",
  magicLinkVersion: 0,
  magicLinkRevokedAt: null,
};

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
    mock(magic.verifyMagicLinkClaims).mockReturnValue({ code: "ABCD-1234", version: 0 });
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(liveOrder);
    const order = await getOrderByToken("good-token");
    const arg = mock(prisma.attendeeOrder.findFirst).mock.calls[0][0];
    expect(arg.where).toEqual({ orderCode: "ABCD-1234" });
    expect(order).toEqual(liveOrder);
  });

  it("accepts a legacy token against an untouched order (version 0 on both sides)", async () => {
    // The 394 links already in attendees' inboxes take exactly this path.
    mock(magic.verifyMagicLinkClaims).mockReturnValue({ code: "ABCD-1234", version: 0 });
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(liveOrder);
    expect(await getOrderByToken("legacy-token")).toEqual(liveOrder);
  });

  it("returns null without touching the DB for a tampered token", async () => {
    mock(magic.verifyMagicLinkClaims).mockReturnValue(null);
    const order = await getOrderByToken("tampered");
    expect(order).toBeNull();
    expect(prisma.attendeeOrder.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for a hard-revoked order even though the signature is valid", async () => {
    mock(magic.verifyMagicLinkClaims).mockReturnValue({ code: "ABCD-1234", version: 0 });
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue({
      ...liveOrder,
      magicLinkRevokedAt: new Date(),
    });
    expect(await getOrderByToken("leaked-token")).toBeNull();
  });

  it("returns null for a token whose version the order has moved past (rotated)", async () => {
    mock(magic.verifyMagicLinkClaims).mockReturnValue({ code: "ABCD-1234", version: 0 });
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue({
      ...liveOrder,
      magicLinkVersion: 1,
    });
    expect(await getOrderByToken("superseded-token")).toBeNull();
  });
});

describe("revokeOrderMagicLink", () => {
  it("stamps magicLinkRevokedAt without changing the registration", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(liveOrder);
    expect(await revokeOrderMagicLink("ABCD-1234")).toBe(true);
    const arg = mock(prisma.attendeeOrder.update).mock.calls[0][0];
    expect(arg.where).toEqual({ id: "o1" });
    expect(arg.data.magicLinkRevokedAt).toBeInstanceOf(Date);
    // Nothing that would cancel the order or drop the seat.
    expect(Object.keys(arg.data)).toEqual(["magicLinkRevokedAt"]);
  });

  it("returns false for an unknown order code", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(null);
    expect(await revokeOrderMagicLink("NOPE")).toBe(false);
    expect(prisma.attendeeOrder.update).not.toHaveBeenCalled();
  });
});

describe("rotateOrderMagicLink", () => {
  it("bumps the version, stores the fresh token and clears the revocation", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(liveOrder);
    mock(magic.signMagicLink).mockReturnValue("v2.new.token");

    expect(await rotateOrderMagicLink("ABCD-1234")).toBe("v2.new.token");

    // The new token must be signed at the *incremented* version, otherwise the
    // link it replaces would keep working.
    expect(magic.signMagicLink).toHaveBeenCalledWith("ABCD-1234", {
      version: 1,
      expiresInSeconds: undefined,
    });
    const arg = mock(prisma.attendeeOrder.update).mock.calls[0][0];
    expect(arg.data).toEqual({
      magicLinkToken: "v2.new.token",
      magicLinkVersion: 1,
      magicLinkRevokedAt: null,
    });
  });

  it("passes an opt-in expiry through to the signer", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(liveOrder);
    mock(magic.signMagicLink).mockReturnValue("v2.expiring.token");
    await rotateOrderMagicLink("ABCD-1234", { expiresInSeconds: 86400 });
    expect(magic.signMagicLink).toHaveBeenCalledWith("ABCD-1234", {
      version: 1,
      expiresInSeconds: 86400,
    });
  });

  it("returns null for an unknown order code", async () => {
    mock(prisma.attendeeOrder.findFirst).mockResolvedValue(null);
    expect(await rotateOrderMagicLink("NOPE")).toBeNull();
    expect(prisma.attendeeOrder.update).not.toHaveBeenCalled();
  });
});
