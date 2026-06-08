import { NotImplemented } from "./errors";

export interface PretixEvent {
  slug: string;
  name: Record<string, string>;
  live: boolean;
  date_from: string | null;
  date_to: string | null;
}

/**
 * Adapter surface for pretix events. Organizer slug is always explicit and must
 * be resolved from the event mapping / organization — never a global constant.
 */
export function listEvents(organizerSlug: string): Promise<PretixEvent[]> {
  void organizerSlug;
  throw new NotImplemented("events.listEvents");
}

export function getEvent(
  organizerSlug: string,
  eventSlug: string,
): Promise<PretixEvent> {
  void organizerSlug;
  void eventSlug;
  throw new NotImplemented("events.getEvent");
}

export function createEvent(
  organizerSlug: string,
  payload: Partial<PretixEvent>,
): Promise<PretixEvent> {
  void organizerSlug;
  void payload;
  throw new NotImplemented("events.createEvent");
}

export function updateEvent(
  organizerSlug: string,
  eventSlug: string,
  payload: Partial<PretixEvent>,
): Promise<PretixEvent> {
  void organizerSlug;
  void eventSlug;
  void payload;
  throw new NotImplemented("events.updateEvent");
}
