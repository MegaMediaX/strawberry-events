import type { RegisterInput } from "@/lib/registration/schema";

/**
 * The only fields the public registration wizard is allowed to supply.
 *
 * `registerInputSchema` is shared by three callers — the public wizard, the
 * authenticated staff walk-in, and the external API — so it necessarily accepts
 * privileged fields (`roleTag`, `roleLabel`, `staffWalkIn`, `userId`) that only
 * the latter two may set. A Server Action is a real HTTP endpoint: the wizard
 * component is not a gate, and anything the schema accepts, an unauthenticated
 * caller can POST directly.
 *
 * This is an allowlist rather than a denylist on purpose. A field added to the
 * schema later is excluded here by default and has to be named explicitly to
 * reach the public path, so the safe outcome is the one you get by forgetting.
 *
 * `satisfies` ties the names to the schema: renaming a field there fails the
 * build here instead of silently reopening the hole.
 */
export const PUBLIC_REGISTER_FIELDS = [
  "attendee",
  "tickets",
  "seatIds",
  "answers",
  "inviteToken",
  "consentTerms",
  "consentPrivacy",
  "consentDataUse",
] as const satisfies readonly (keyof RegisterInput)[];

/**
 * Narrow an untrusted Server Action payload to the public fields.
 *
 * Absent keys stay absent rather than becoming an explicit `undefined`, so the
 * schema's `.default()`s still apply exactly as they do today.
 */
export function publicRegisterFields(values: unknown): Record<string, unknown> {
  if (typeof values !== "object" || values === null) return {};
  const source = values as Record<string, unknown>;
  const allowed: Record<string, unknown> = {};
  for (const key of PUBLIC_REGISTER_FIELDS) {
    if (key in source) allowed[key] = source[key];
  }
  return allowed;
}
