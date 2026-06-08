import { pretixFetch } from "./client";

export type PretixOrderStatus = "n" | "p" | "e" | "c" | "r"; // pending|paid|expired|canceled|refunded

export interface PretixOrder {
  code: string;
  status: PretixOrderStatus;
  email: string | null;
  total: string;
}

export interface CreateOrderInput {
  email: string;
  positions: Array<{ item: number; variation?: number; [k: string]: unknown }>;
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
): Promise<PretixOrder> {
  return pretixFetch<PretixOrder>(base(organizerSlug, eventSlug), {
    method: "POST",
    body: JSON.stringify({ status: "n", ...input }),
  });
}

export async function getOrder(
  organizerSlug: string,
  eventSlug: string,
  code: string,
): Promise<PretixOrder> {
  return pretixFetch<PretixOrder>(`${base(organizerSlug, eventSlug)}${code}/`);
}

/** Mark a pending/manual (COD) order as paid. */
export async function markOrderPaid(
  organizerSlug: string,
  eventSlug: string,
  code: string,
): Promise<PretixOrder> {
  return pretixFetch<PretixOrder>(
    `${base(organizerSlug, eventSlug)}${code}/mark_paid/`,
    { method: "POST" },
  );
}

export async function cancelOrder(
  organizerSlug: string,
  eventSlug: string,
  code: string,
): Promise<void> {
  await pretixFetch(`${base(organizerSlug, eventSlug)}${code}/cancel/`, {
    method: "POST",
  });
}
