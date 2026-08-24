/**
 * vCard 3.0 for the badge contact profile.
 *
 * 3.0 rather than 4.0 deliberately: iOS Contacts and most Android address books
 * import 3.0 without complaint, while 4.0 support is patchier — and this is
 * scanned by whatever phone a stranger happens to be holding at a conference.
 */

export interface VCardInput {
  fullName: string;
  company?: string | null;
  role?: string | null;
  email?: string | null;
  phone?: string | null;
  url?: string | null;
  note?: string | null;
}

/**
 * Escape a vCard property value.
 *
 * Backslash, comma, semicolon and newline are structural in vCard. A company
 * called "Smith, Jones & Co" would otherwise split into two fields and the
 * contact would import mangled — or not at all.
 */
export function escapeVCardValue(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    // Doubled backslash, like the three above it. Written as "\;" this was a
    // no-op: "\;" is not an escape sequence in a JS string, so it collapsed to
    // a bare ";" and replaced a semicolon with itself.
    .replace(/;/g, "\\;");
}

/**
 * Split a display name into vCard's structured N field (family;given;...).
 *
 * Deliberately simple: last whitespace-separated token is the family name, the
 * rest is given. That is wrong for some names — Arabic and Spanish compound
 * surnames especially — which is why FN (the display name) carries the name
 * exactly as the attendee gave it, and every phone shows FN. N exists because
 * some address books sort by it, not to be authoritative.
 */
function structuredName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return `;${escapeVCardValue(fullName)};;;`;
  const family = parts[parts.length - 1];
  const given = parts.slice(0, -1).join(" ");
  return `${escapeVCardValue(family)};${escapeVCardValue(given)};;;`;
}

/** Build a vCard. Lines are CRLF-terminated, which the spec requires. */
export function buildVCard(input: VCardInput): string {
  const lines: string[] = ["BEGIN:VCARD", "VERSION:3.0"];

  lines.push(`N:${structuredName(input.fullName)}`);
  lines.push(`FN:${escapeVCardValue(input.fullName)}`);
  if (input.company) lines.push(`ORG:${escapeVCardValue(input.company)}`);
  if (input.role) lines.push(`TITLE:${escapeVCardValue(input.role)}`);
  if (input.email) lines.push(`EMAIL;TYPE=INTERNET,WORK:${escapeVCardValue(input.email)}`);
  if (input.phone) lines.push(`TEL;TYPE=CELL,VOICE:${escapeVCardValue(input.phone)}`);
  if (input.url) lines.push(`URL:${escapeVCardValue(input.url)}`);
  if (input.note) lines.push(`NOTE:${escapeVCardValue(input.note)}`);

  lines.push("END:VCARD");
  return lines.join("\r\n") + "\r\n";
}

/**
 * A filename the phone will accept. Anything outside this set risks the OS
 * refusing the download or silently renaming it.
 */
export function vCardFilename(fullName: string): string {
  const base = fullName.trim().replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${base || "contact"}.vcf`;
}

/** Join a country code and national number without doubling the +. */
export function formatPhone(phone?: string | null, countryCode?: string | null): string | null {
  const n = phone?.trim();
  if (!n) return null;
  const cc = countryCode?.trim();
  if (!cc || n.startsWith("+")) return n;
  return `${cc.startsWith("+") ? cc : `+${cc}`} ${n}`;
}
