/**
 * Date-time helpers for the admin event form. The storefront/pretix exchange
 * ISO-8601 strings; organizers think in UK wall-clock (dd/mm/yyyy hh:mm, 24h).
 *
 * Parsing is TEXTUAL (not via `Date`) so the wall-clock written in the string is
 * preserved exactly — no implicit timezone shifting, and deterministic in tests
 * regardless of the host machine's TZ.
 */

/**
 * Sub-event timestamps are `timestamp WITHOUT time zone` holding naive VENUE
 * wall-clock. Prisma surfaces them as that same clock labelled UTC, so
 * formatting them in "UTC" reproduces the venue wall-clock exactly.
 *
 * NEVER format these in the viewer's zone. `toLocaleString` without a
 * `timeZone` shifts by the viewer's offset, so an attendee in Beirut and one in
 * London see different start times for the same session and neither matches the
 * door. That is precisely the bug this constant exists to prevent.
 */
export const VENUE_TIME_ZONE = "UTC";

/**
 * The venue's REAL IANA zone.
 *
 * Distinct from VENUE_TIME_ZONE on purpose, and the difference matters:
 * - VENUE_TIME_ZONE ("UTC") is for DISPLAY. Stored times are naive venue
 *   wall-clock that Prisma hands back labelled UTC, so formatting them in "UTC"
 *   prints the digits exactly as an organiser typed them.
 * - VENUE_IANA_ZONE is for EXPORT, where a true instant is required — an .ics
 *   or a Google Calendar link must carry a real moment, because the receiving
 *   calendar will convert it into the reader's own zone.
 *
 * Use this only where something leaves the app and gets re-interpreted
 * elsewhere. Everything rendered on our own pages uses VENUE_TIME_ZONE.
 */
export const VENUE_IANA_ZONE = "Asia/Beirut";

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

/**
 * Read the wall-clock an instant shows in a given IANA zone, expressed as the
 * epoch ms of those same digits treated as UTC. Used only by
 * {@link venueWallClockToUtc} to derive the zone's offset at a point in time.
 */
function wallClockMsInZone(ms: number, timeZone: string): number {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour12: false,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
      .formatToParts(new Date(ms))
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  // Some engines render midnight as hour "24" under hour12:false.
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(hour),
    Number(parts.minute),
    Number(parts.second),
  );
}

/**
 * Naive venue wall-clock → the true UTC instant it refers to.
 *
 * Stored session/event times carry no zone: "2026-08-28T09:30" means half past
 * nine *at the venue*. Anything that hands a time to an external calendar must
 * publish the real instant instead, or every attendee's calendar silently
 * shifts the event by their own offset.
 *
 * Derives the offset from the IANA database rather than hardcoding one, so it
 * stays correct across DST (Beirut is UTC+3 in August, UTC+2 in winter — an
 * event moved to November would otherwise land an hour out).
 *
 * Returns null when the input is absent or unparseable.
 */
export function venueWallClockToUtc(
  iso: string | null | undefined,
  timeZone: string = VENUE_IANA_ZONE,
): Date | null {
  const p = parseParts(iso);
  if (!p) return null;
  // First guess: pretend the digits are UTC.
  const guess = Date.UTC(Number(p.y), Number(p.mo) - 1, Number(p.d), Number(p.h), Number(p.mi), 0);
  // Whatever that instant displays as in the venue zone, its distance from the
  // guess IS the zone's offset there. Subtract it to land on the real instant.
  const offset = wallClockMsInZone(guess, timeZone) - guess;
  return new Date(guess - offset);
}
