export const SCOPES = [
  "events:read",
  "attendees:read",
  "attendees:write",
  "orders:read",
  "checkins:read",
  "checkins:write",
  "waitlist:read",
  "waitlist:write",
  "seats:read",
  "webhooks:manage",
] as const;

export type Scope = (typeof SCOPES)[number];

export function isScope(value: string): value is Scope {
  return (SCOPES as readonly string[]).includes(value);
}

/** Whether a key's granted scopes include the required scope. */
export function hasScope(granted: string[], required: Scope): boolean {
  return granted.includes(required);
}
