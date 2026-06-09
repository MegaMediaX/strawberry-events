import { decrypt } from "@/lib/crypto";

export interface PretixContext {
  organizerSlug: string;
  token: string;
}

export interface OrgCredsSource {
  pretixOrganizerSlug: string;
  pretixApiToken: string | null;
}

/**
 * Resolve the pretix organizer slug + API token for an organization. Uses the
 * org's encrypted token when present; otherwise falls back to the env token
 * (dev/demo). Throws when neither is available.
 */
export function resolvePretixContext(org: OrgCredsSource): PretixContext {
  const token = org.pretixApiToken
    ? decrypt(org.pretixApiToken)
    : process.env.PRETIX_API_TOKEN;

  if (!token) {
    throw new Error(
      `No pretix API token for organizer '${org.pretixOrganizerSlug}' and no env fallback`,
    );
  }
  return { organizerSlug: org.pretixOrganizerSlug, token };
}
