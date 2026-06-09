import { NotImplemented } from "./errors";

export type PretixOrderStatus = "n" | "p" | "e" | "c" | "r"; // pending|paid|expired|canceled|refunded

export interface PretixOrder {
  code: string;
  status: PretixOrderStatus;
  email: string | null;
  total: string;
}

export function createOrder(
  organizerSlug: string,
  eventSlug: string,
  payload: unknown,
): Promise<PretixOrder> {
  void organizerSlug;
  void eventSlug;
  void payload;
  throw new NotImplemented("orders.createOrder");
}

export function getOrder(
  organizerSlug: string,
  eventSlug: string,
  code: string,
): Promise<PretixOrder> {
  void organizerSlug;
  void eventSlug;
  void code;
  throw new NotImplemented("orders.getOrder");
}

/** Mark a pending/manual (COD) order as paid. */
export function markOrderPaid(
  organizerSlug: string,
  eventSlug: string,
  code: string,
): Promise<PretixOrder> {
  void organizerSlug;
  void eventSlug;
  void code;
  throw new NotImplemented("orders.markOrderPaid");
}

export function cancelOrder(
  organizerSlug: string,
  eventSlug: string,
  code: string,
): Promise<void> {
  void organizerSlug;
  void eventSlug;
  void code;
  throw new NotImplemented("orders.cancelOrder");
}
