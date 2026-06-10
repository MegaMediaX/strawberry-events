// Pure, prisma-free helpers for event location display. No live Maps API —
// operators supply a Google Maps URL / embed URL, or we derive a search/dir URL.

export interface EventLocation {
  venueName?: string | null;
  address?: string | null;
  city?: string | null;
  country?: string | null;
  mapUrl?: string | null;
  mapEmbedUrl?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

/** True when there is enough to show a location block. */
export function hasLocation(loc: EventLocation): boolean {
  return Boolean(
    loc.venueName ||
      loc.address ||
      (loc.latitude != null && loc.longitude != null),
  );
}

/** Human-readable single line: venue, address, city, country (present parts only). */
export function locationLine(loc: EventLocation): string {
  return [loc.venueName, loc.address, loc.city, loc.country]
    .map((p) => (p ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

/**
 * A directions/maps link, or null if nothing to point at. Prefers an explicit
 * mapUrl; else lat/lng; else a text search over the address.
 */
export function directionsUrl(loc: EventLocation): string | null {
  if (loc.mapUrl && loc.mapUrl.trim()) return loc.mapUrl.trim();
  if (loc.latitude != null && loc.longitude != null) {
    return `https://www.google.com/maps/dir/?api=1&destination=${loc.latitude},${loc.longitude}`;
  }
  const q = locationLine(loc);
  if (q) return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
  return null;
}
