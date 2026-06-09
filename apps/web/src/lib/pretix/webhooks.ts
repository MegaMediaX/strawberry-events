import { NotImplemented } from "./errors";

export interface PretixWebhookEvent {
  action: string;
  organizer: string;
  event?: string;
  code?: string;
}

/** Verify and parse an incoming pretix webhook request. */
export function verifyWebhook(request: Request): Promise<PretixWebhookEvent> {
  void request;
  throw new NotImplemented("webhooks.verifyWebhook");
}
