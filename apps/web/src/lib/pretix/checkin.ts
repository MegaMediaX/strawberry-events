import { pretixFetch, pretixFetchAll } from "./client";
import { PretixError, PretixValidationError } from "./errors";

export interface PretixCheckinList {
  id: number;
  name: string;
  all_products: boolean;
}

export async function listCheckinLists(
  organizerSlug: string,
  eventSlug: string,
  token?: string,
): Promise<PretixCheckinList[]> {
  return pretixFetchAll<PretixCheckinList>(
    `/organizers/${organizerSlug}/events/${eventSlug}/checkinlists/`,
    token,
  );
}

export interface RedeemResult {
  status: "ok" | "error";
  reason?: string;
}

/**
 * Redeem (check in) a position against a check-in list. pretix is the source of
 * truth. An error response (e.g. already_redeemed) is surfaced, not thrown.
 */
export async function redeemCheckin(
  organizerSlug: string,
  eventSlug: string,
  listId: number,
  secret: string,
  token?: string,
): Promise<RedeemResult> {
  const path = `/organizers/${organizerSlug}/events/${eventSlug}/checkinlists/${listId}/positions/${secret}/redeem/`;
  try {
    return await pretixFetch<RedeemResult>(path, { method: "POST", body: "{}" }, token);
  } catch (err) {
    // pretix returns 400 with {status:"error", reason} for failed redemptions.
    if (err instanceof PretixValidationError) {
      const detail = err.fieldErrors as unknown as { status?: string; reason?: string };
      return { status: "error", reason: detail?.reason ?? "redeem_failed" };
    }
    if (err instanceof PretixError && err.detail && typeof err.detail === "object") {
      const d = err.detail as { status?: string; reason?: string };
      return { status: "error", reason: d.reason ?? "redeem_failed" };
    }
    throw err;
  }
}

export interface Counters {
  total: number;
  checkedIn: number;
}

/** Live counters for a check-in list (from pretix, the source of truth). */
export async function checkinCounters(
  organizerSlug: string,
  eventSlug: string,
  listId: number,
  token?: string,
): Promise<Counters> {
  const list = await pretixFetch<{ position_count?: number; checkin_count?: number }>(
    `/organizers/${organizerSlug}/events/${eventSlug}/checkinlists/${listId}/`,
    {},
    token,
  );
  return { total: list.position_count ?? 0, checkedIn: list.checkin_count ?? 0 };
}
