import { NotImplemented } from "./errors";

export interface PretixItem {
  id: number;
  name: Record<string, string>;
  default_price: string;
  active: boolean;
}

export function listItems(
  organizerSlug: string,
  eventSlug: string,
): Promise<PretixItem[]> {
  void organizerSlug;
  void eventSlug;
  throw new NotImplemented("products.listItems");
}

export function createItem(
  organizerSlug: string,
  eventSlug: string,
  payload: Partial<PretixItem>,
): Promise<PretixItem> {
  void organizerSlug;
  void eventSlug;
  void payload;
  throw new NotImplemented("products.createItem");
}
