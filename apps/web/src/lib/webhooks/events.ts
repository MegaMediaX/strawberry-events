export const WEBHOOK_EVENTS = [
  "attendee.created",
  "attendee.approved",
  "attendee.rejected",
  "order.created",
  "order.paid",
  "ticket.issued",
  "checkin.created",
  "badge.printed",
  "waitlist.joined",
  "waitlist.promoted",
  "seat.held",
  "seat.confirmed",
  "seat.released",
] as const;

export type WebhookEvent = (typeof WEBHOOK_EVENTS)[number];

export function isWebhookEvent(value: string): value is WebhookEvent {
  return (WEBHOOK_EVENTS as readonly string[]).includes(value);
}
