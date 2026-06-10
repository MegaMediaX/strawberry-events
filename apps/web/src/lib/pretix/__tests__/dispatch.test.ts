import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findFirst: vi.fn(), updateMany: vi.fn() },
    organization: { findUnique: vi.fn() },
  },
}));
vi.mock("@/lib/pretix/context", () => ({
  resolvePretixContext: vi.fn(() => ({ organizerSlug: "acme", token: "tok" })),
}));
vi.mock("@/lib/pretix/events", () => ({ getEvent: vi.fn() }));
vi.mock("@/lib/pretix/handlers/order-paid", () => ({ handleOrderPaid: vi.fn() }));
vi.mock("@/lib/pretix/handlers/order-canceled", () => ({ handleOrderCanceled: vi.fn() }));
vi.mock("@/lib/pretix/handlers/checkin-created", () => ({ handleCheckinCreated: vi.fn() }));

import { prisma } from "@/lib/db/client";
import { getEvent } from "@/lib/pretix/events";
import { handleOrderPaid } from "@/lib/pretix/handlers/order-paid";
import { handleOrderCanceled } from "@/lib/pretix/handlers/order-canceled";
import { handleCheckinCreated } from "@/lib/pretix/handlers/checkin-created";
import { dispatch } from "@/lib/pretix/handlers";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const mapping = { id: "e1", organizationId: "orgA", pretixEventSlug: "expo" };

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.eventMapping.findFirst).mockResolvedValue(mapping);
  mock(prisma.organization.findUnique).mockResolvedValue({ id: "orgA", pretixOrganizerSlug: "acme" });
});

describe("dispatch", () => {
  it("returns quietly for an unknown event slug (no handler, no org lookup)", async () => {
    mock(prisma.eventMapping.findFirst).mockResolvedValue(null);
    await expect(
      dispatch({ action: "pretix.event.order.paid", organizer: "acme", event: "ghost", code: "X" }),
    ).resolves.toBeUndefined();
    expect(prisma.organization.findUnique).not.toHaveBeenCalled();
    expect(handleOrderPaid).not.toHaveBeenCalled();
  });

  it("returns quietly when an order action is missing the order code", async () => {
    await dispatch({ action: "pretix.event.order.paid", organizer: "acme", event: "expo" });
    expect(handleOrderPaid).not.toHaveBeenCalled();
  });

  it("routes order.paid to handleOrderPaid with resolved context", async () => {
    await dispatch({ action: "pretix.event.order.paid", organizer: "acme", event: "expo", code: "ABC12" });
    expect(handleOrderPaid).toHaveBeenCalledTimes(1);
    expect(mock(handleOrderPaid).mock.calls[0][0]).toMatchObject({
      organizerSlug: "acme", pretixEventSlug: "expo", orderCode: "ABC12",
      eventMappingId: "e1", organizationId: "orgA",
    });
  });

  it("routes order.canceled to handleOrderCanceled", async () => {
    await dispatch({ action: "pretix.event.order.canceled", organizer: "acme", event: "expo", code: "ABC12" });
    expect(handleOrderCanceled).toHaveBeenCalledTimes(1);
  });

  it("routes checkin.created to handleCheckinCreated", async () => {
    await dispatch({ action: "pretix.event.checkin.created", organizer: "acme", event: "expo", code: "ABC12" });
    expect(handleCheckinCreated).toHaveBeenCalledTimes(1);
  });

  it("reconciles liveOnPretix on an event-change action", async () => {
    mock(getEvent).mockResolvedValue({ live: true });
    await dispatch({ action: "pretix.event.event.changed", organizer: "acme", event: "expo" });
    const arg = mock(prisma.eventMapping.updateMany).mock.calls[0][0];
    expect(arg.data).toMatchObject({ liveOnPretix: true });
    expect(handleOrderPaid).not.toHaveBeenCalled();
  });

  it("ignores an unhandled action without throwing", async () => {
    await expect(
      dispatch({ action: "pretix.event.quota.changed", organizer: "acme", event: "expo" }),
    ).resolves.toBeUndefined();
  });
});
