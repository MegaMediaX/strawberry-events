/**
 * Date-time helpers for the admin event form. The storefront/pretix exchange
 * ISO-8601 strings; organizers think in UK wall-clock (dd/mm/yyyy hh:mm, 24h).
 *
 * Parsing is TEXTUAL (not via `Date`) so the wall-clock written in the string is
 * preserved exactly — no implicit timezone shifting, and deterministic in tests
 * regardless of the host machine's TZ.
 */

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/;

interface Parts {
  y: string;
  mo: string;
  d: string;
  h: string;
  mi: string;
}

function parseParts(iso: string | null | undefined): Parts | null {
  if (!iso) return null;
  const m = ISO_RE.exec(iso.trim());
  if (!m) return null;
  return { y: m[1], mo: m[2], d: m[3], h: m[4], mi: m[5] };
}

/**
 * ISO → value for a native <input type="datetime-local"> ("YYYY-MM-DDTHH:mm").
 * Returns "" when the input is absent/unparseable.
 */
export function isoToLocalInput(iso: string | null | undefined): string {
  const p = parseParts(iso);
  if (!p) return "";
  return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}`;
}

/**
 * datetime-local value ("YYYY-MM-DDTHH:mm") → ISO with explicit UTC marker.
 * Returns null for empty/malformed input. Seconds default to :00.
 */
export function localInputToIso(local: string | null | undefined): string | null {
  if (!local) return null;
  const p = parseParts(local);
  if (!p) return null;
  return `${p.y}-${p.mo}-${p.d}T${p.h}:${p.mi}:00Z`;
}

/** ISO → "dd/mm/yyyy hh:mm" (24h, UK order). Returns "" when unparseable. */
export function formatUk(iso: string | null | undefined): string {
  const p = parseParts(iso);
  if (!p) return "";
  return `${p.d}/${p.mo}/${p.y} ${p.h}:${p.mi}`;
}
