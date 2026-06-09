import { pretixFetchAll } from "./client";
import { NotImplemented } from "./errors";

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

export function performCheckin(
  organizerSlug: string,
  eventSlug: string,
  listId: number,
  secret: string,
): Promise<{ status: "ok" | "error"; reason?: string }> {
  void organizerSlug;
  void eventSlug;
  void listId;
  void secret;
  throw new NotImplemented("checkin.performCheckin");
}
