/**
 * Name and placeholder-address helpers for attendees who are registered in
 * bulk from a roster (partners, exhibitors, media) rather than through the
 * public wizard. Pure and dependency-free so they are unit-testable.
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
 * Rejoining first + last reproduces the supplied string exactly, so the name
 * printed on the badge is always the name that was handed to us.
 */
export function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length > 1 && HONORIFICS.has(parts[0].toLowerCase())) {
    const honorific = parts.shift()!;
    parts[0] = `${honorific} ${parts[0]}`;
  }
  // pretix rejects an empty family name, so a mononym is used for both fields.
  if (parts.length === 1) return { firstName: parts[0], lastName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/** Lowercase, accent-free, hyphenated token safe for an email local part. */
function slug(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * A deterministic placeholder address for a rostered attendee who supplied no
 * email. Three properties matter:
 *
 *  - `.invalid` (RFC 2606) is guaranteed never to resolve, so no confirmation
 *    mail can ever be delivered to a made-up address.
 *  - It is derived from event + company + name, so re-running a bulk import
 *    recognises someone who already holds a ticket instead of issuing them a
 *    second one.
 *  - `occurrence` separates two DIFFERENT people who happen to share a display
 *    name at the same company. Without it they collapsed onto one address, and
 *    the importer's idempotency check read the second person as the first and
 *    skipped them — no error, no failed row, just someone who turns up at the
 *    door with no ticket.
 *
 * Occurrence 1 is byte-identical to the pre-fix address, so everyone already
 * registered still matches and a re-run does not issue them a duplicate. Only
 * the second and later namesakes get a new address, which is exactly the set
 * that was previously being dropped.
 */
export function placeholderEmail(
  eventKey: string,
  company: string,
  fullName: string,
  occurrence = 1,
): string {
  const suffix = occurrence > 1 ? `.${occurrence}` : "";
  return `${slug(company)}.${slug(fullName)}${suffix}@${slug(eventKey)}.invalid`;
}
