import { describe, it, expect } from "vitest";
import { createEvent, getEvent, updateEvent } from "@/lib/pretix/events";
import { createItem, listItems } from "@/lib/pretix/products";
import {
  createOrder,
  getOrder,
  markOrderPaid,
  cancelOrder,
} from "@/lib/pretix/orders";
import { listCheckinLists } from "@/lib/pretix/checkin";

const live = Boolean(
  process.env.PRETIX_BASE_URL && process.env.PRETIX_API_TOKEN,
);
const org = process.env.PRETIX_DEFAULT_ORGANIZER ?? "strawberry";

// Opt-in: only runs when a real pretix instance is configured via env.
describe.skipIf(!live)("pretix live integration", () => {
  const slug = `m2-${Date.now().toString(36)}`;

  it("runs the full event -> item -> order -> mark-paid -> cancel flow", async () => {
    await createEvent(org, {
      slug,
      titleEn: "M2 Live Test",
      titleAr: "اختبار",
      live: false,
    });

    const fetched = await getEvent(org, slug);
    expect(fetched.slug).toBe(slug);

    await updateEvent(org, slug, { live: true });

    const item = await createItem(org, slug, {
      titleEn: "Visitor",
      priceCents: 2500,
    });
    const items = await listItems(org, slug);
    expect(items.some((i) => i.id === item.id)).toBe(true);

    const order = await createOrder(org, slug, {
      email: "live@strawberry.local",
      positions: [{ item: item.id }],
    });
    expect(order.status).toBe("n");

    const got = await getOrder(org, slug, order.code);
    expect(got.code).toBe(order.code);

    const paid = await markOrderPaid(org, slug, order.code);
    expect(paid.status).toBe("p");

    // A second order we then cancel.
    const toCancel = await createOrder(org, slug, {
      email: "cancel@strawberry.local",
      positions: [{ item: item.id }],
    });
    await cancelOrder(org, slug, toCancel.code);

    const lists = await listCheckinLists(org, slug);
    expect(Array.isArray(lists)).toBe(true);
  }, 60000);
});
