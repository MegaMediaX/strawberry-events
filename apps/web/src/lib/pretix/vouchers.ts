import { NotImplemented } from "./errors";

export interface PretixVoucher {
  code: string;
  max_usages: number;
  redeemed: number;
  valid_until: string | null;
}

export function listVouchers(
  organizerSlug: string,
  eventSlug: string,
): Promise<PretixVoucher[]> {
  void organizerSlug;
  void eventSlug;
  throw new NotImplemented("vouchers.listVouchers");
}

export function createVoucher(
  organizerSlug: string,
  eventSlug: string,
  payload: Partial<PretixVoucher>,
): Promise<PretixVoucher> {
  void organizerSlug;
  void eventSlug;
  void payload;
  throw new NotImplemented("vouchers.createVoucher");
}
