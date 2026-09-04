/**
 * Name helpers for attendees registered in bulk from a roster (partners,
 * exhibitors, media) rather than through the public wizard. Pure and
 * dependency-free so they are unit-testable.
 */

const HONORIFICS = new Set([
  "dr.", "dr", "mr.", "mr", "mrs.", "mrs", "ms.", "ms",
  "eng.", "eng", "prof.", "prof",
]);

/**
 * pretix stores a given name and a family name separately, but a roster
 * carries a single display name. Split off any honorific, then treat the first
 * token as the given name and the remainder as the family name.
 *
 * Rejoining first + last reproduces the supplied string EXCEPT when there is no
 * family name to find. pretix rejects an empty family name, so a name with only
 * one real token has to put something in that field, and the token is repeated:
 * "Madonna" becomes ("Madonna", "Madonna"). The doc used to claim the round trip
 * held universally, which was never true for mononyms and is worth stating
 * plainly — a caller that concatenates these will render such a name twice.
 */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };

  let honorific = "";
  if (parts.length > 1 && HONORIFICS.has(parts[0].toLowerCase())) {
    honorific = parts.shift()!;
  }

  // One real token: repeat it, but do NOT repeat the honorific with it. Both
  // fields carrying "Dr. Bachir" renders as "Dr. Bachir Dr. Bachir" on a badge;
  // ("Dr. Bachir", "Bachir") is the same unavoidable repetition without the
  // title appearing twice.
  if (parts.length === 1) {
    const only = parts[0];
    return { firstName: honorific ? `${honorific} ${only}` : only, lastName: only };
  }

  const given = honorific ? `${honorific} ${parts[0]}` : parts[0];
  return { firstName: given, lastName: parts.slice(1).join(" ") };
}
