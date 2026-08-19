/**
 * Kill switch for the public badge-profile pages.
 *
 * Exists because the pages are the one part of this feature that is printed
 * onto 812 physical badges and cannot be recalled. If something about them
 * turns out to be wrong mid-event, `BADGE_PROFILES_ENABLED=false` and a
 * container restart takes every profile to a 404 in under a minute — no build,
 * no deploy, no CI queue.
 *
 * Default ON. The user asked for this live rather than behind a Day-1 flag, so
 * an unset variable must not silently disable what the badges point at. Only an
 * explicit "false"/"0"/"off" turns it off.
 *
 * Check-in does NOT consult this. Redemption resolves a badge slug regardless,
 * so disabling profiles can never cost anyone entry.
 */
export function badgeProfilesEnabled(): boolean {
  const raw = process.env.BADGE_PROFILES_ENABLED?.trim().toLowerCase();
  return !(raw === "false" || raw === "0" || raw === "off");
}
