import { describe, it, expect } from "vitest";
import { createEvent, getEvent, updateEvent } from "@/lib/pretix/events";
import { createItem, listItems, createQuota } from "@/lib/pretix/products";
import {
  createOrder,
  getOrder,
  markOrderPaid,
  cancelOrder,
} from "@/lib/pretix/orders";
import { listCheckinLists } from "@/lib/pretix/checkin";
import { pretixFetch } from "@/lib/pretix/client";
import { PretixValidationError, flattenFieldErrors } from "@/lib/pretix/errors";
import { buildOrderPositions } from "@/lib/registration/positions";

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
      date_from: "2026-09-01T09:00:00Z",
    });

    const fetched = await getEvent(org, slug);
    expect(fetched.slug).toBe(slug);

    const updated = await updateEvent(org, slug, { titleEn: "M2 Live Test (edited)" });
    expect(updated.titleEn).toBe("M2 Live Test (edited)");

    const item = await createItem(org, slug, {
      titleEn: "Visitor",
      priceCents: 2500,
    });
    const items = await listItems(org, slug);
    expect(items.some((i) => i.id === item.id)).toBe(true);

    // pretix requires a quota before the item can be ordered.
    await createQuota(org, slug, { name: "GA", size: 100, items: [item.id] });

    const order = await createOrder(org, slug, {
      email: "live@strawberry.local",
      positions: [{ item: item.id, price: "25.00" }],
    });
    expect(order.status).toBe("n");

    const got = await getOrder(org, slug, order.code);
    expect(got.code).toBe(order.code);

    const paid = await markOrderPaid(org, slug, order.code);
    expect(paid.status).toBe("p");

    // A second order we then cancel.
    const toCancel = await createOrder(org, slug, {
      email: "cancel@strawberry.local",
      positions: [{ item: item.id, price: "25.00" }],
    });
    await cancelOrder(org, slug, toCancel.code);

    const lists = await listCheckinLists(org, slug);
    expect(Array.isArray(lists)).toBe(true);
  }, 60000);
});

/**
 * Regression for the production registration failure (LEBTECH 6th edition):
 * free admission items on an event that asks for attendee names rejected every
 * order with an opaque pretix 400, because positions were sent anonymously.
 *
 * This reproduces the exact server-side configuration and asserts both halves of
 * the fix: the anonymous order still fails (so the test is meaningful), and the
 * positions built by buildOrderPositions succeed.
 */
describe.skipIf(!live)("attendee-name regression", () => {
  const slug = `an-${Date.now().toString(36)}`;
  const email = "regression@strawberry.local";

  it("rejects anonymous positions and accepts positions carrying attendee_name", async () => {
    await createEvent(org, {
      slug,
      titleEn: "Attendee-name regression",
      live: false,
      date_from: "2026-09-01T09:00:00Z",
    });

    // Mirror a badge-printing conference: attendee names asked AND required.
    await pretixFetch(`/organizers/${org}/events/${slug}/settings/`, {
      method: "PATCH",
      body: JSON.stringify({
        attendee_names_asked: true,
        attendee_names_required: true,
      }),
    });

    // pretix only collects attendee names for admission items, so the item must
    // be created with admission: true (createItem doesn't expose that flag).
    const item = await pretixFetch<{ id: number }>(
      `/organizers/${org}/events/${slug}/items/`,
      {
        method: "POST",
        body: JSON.stringify({
          name: { en: "General admission" },
          default_price: "0.00",
          admission: true,
          active: true,
        }),
      },
    );
    await createQuota(org, slug, { name: "GA", size: 100, items: [item.id] });

    // 1. The old behaviour: an anonymous position is rejected with a 400 whose
    //    detail names the missing attendee field.
    let caught: unknown;
    try {
      await createOrder(org, slug, {
        email,
        positions: [{ item: item.id, price: "0.00" }],
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PretixValidationError);
    const reasons = flattenFieldErrors(
      (caught as PretixValidationError).fieldErrors,
    ).join("; ");
    expect(reasons).toMatch(/attendee_name/i);

    // 2. The fix: positions carry the registrant's identity, so the order lands.
    const { positions } = buildOrderPositions(
      [{ itemId: item.id, quantity: 1 }],
      new Map([[item.id, 0]]),
      { firstName: "Abdulrahman", lastName: "Alman", email },
    );
    const order = await createOrder(org, slug, { email, positions });
    expect(order.code).toBeTruthy();

    // Confirm pretix actually stored the name against the position.
    const stored = await pretixFetch<{
      positions: { attendee_name: string | null }[];
    }>(`/organizers/${org}/events/${slug}/orders/${order.code}/`);
    expect(stored.positions[0].attendee_name).toBe("Abdulrahman Alman");

    await cancelOrder(org, slug, order.code);
  }, 60000);
});
