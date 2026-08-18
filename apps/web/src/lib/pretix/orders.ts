import { pretixFetch, pretixFetchAll } from "./client";

export type PretixOrderStatus = "n" | "p" | "e" | "c" | "r"; // pending|paid|expired|canceled|refunded

export interface PretixOrderPosition {
  id: number;
  secret: string;
  /** Which product this position is for — the link to `sub_events.pretixItemId`. */
  item?: number;
  /** Per-position attendee details. Often blank; the order-level email is the fallback. */
  attendee_name?: string | null;
  attendee_email?: string | null;
  company?: string | null;
  canceled?: boolean;
}

export interface PretixOrder {
  code: string;
  status: PretixOrderStatus;
  email: string | null;
  total: string;
  positions?: PretixOrderPosition[];
}

export interface CreateOrderPosition {
  item: number;
  variation?: number;
  /** Decimal price string (pretix expects e.g. "25.00"). */
  price?: string;
  [k: string]: unknown;
}

export interface CreateOrderInput {
  email: string;
  positions: CreateOrderPosition[];
  locale?: string;
  [k: string]: unknown;
}

const base = (org: string, ev: string) =>
  `/organizers/${org}/events/${ev}/orders/`;

/**
 * Create a pretix order. For COD/manual payment the order is created
 * pending/unpaid (status "n") — no payment is captured. Finance/admin marks it
 * paid later via {@link markOrderPaid}.
 */
export async function createOrder(
  organizerSlug: string,
  eventSlug: string,
  input: CreateOrderInput,
  token?: string,
): Promise<PretixOrder> {
  return pretixFetch<PretixOrder>(
    base(organizerSlug, eventSlug),
    { method: "POST", body: JSON.stringify({ status: "n", ...input }) },
    token,
  );
}

export async function getOrder(
  organizerSlug: string,
  eventSlug: string,
  code: string,
  token?: string,
): Promise<PretixOrder> {
  return pretixFetch<PretixOrder>(
    `${base(organizerSlug, eventSlug)}${code}/`,
    {},
    token,
  );
}

/** Mark a pending/manual (COD) order as paid. */
/**
 * Every order for an event, positions included.
 *
 * This is the only way to answer "who booked which session" — that association
 * lives solely in pretix order positions, never in our database. `sub_events`
 * records the item id; the bookings against it are here.
 *
 * Deliberately a sweep the caller triggers, not something a page renders on
 * every load. ~770 orders is ~16 pages at pretix's default page size, and
 * during the event pretix is the critical path for every door scan — an admin
 * tab polling this competes with the scanner. Call it from an explicit refresh
 * or a scheduled job, and cache the result upstream if you need it hot.
 */
export async function listOrders(
  organizerSlug: string,
  eventSlug: string,
  token?: string,
): Promise<PretixOrder[]> {
  return pretixFetchAll<PretixOrder>(
    `/organizers/${organizerSlug}/events/${eventSlug}/orders/`,
    token,
  );
}

export async function markOrderPaid(
  organizerSlug: string,
  eventSlug: string,
  code: string,
  token?: string,
): Promise<PretixOrder> {
  return pretixFetch<PretixOrder>(
    `${base(organizerSlug, eventSlug)}${code}/mark_paid/`,
    { method: "POST" },
    token,
  );
}

export async function cancelOrder(
  organizerSlug: string,
  eventSlug: string,
  code: string,
  token?: string,
): Promise<void> {
  await pretixFetch(
    `${base(organizerSlug, eventSlug)}${code}/mark_canceled/`,
    { method: "POST", body: JSON.stringify({}) },
    token,
  );
}
