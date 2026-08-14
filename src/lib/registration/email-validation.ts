// Typo-aware attendee email validation. `z.string().email()` and a loose regex
// both accept things like "name@gmail.ccom" (syntactically valid, but a dead
// address). This catches the common real-world typos so tickets/approval emails
// don't silently bounce. Pure + framework-free: used by the server schema
// (authoritative) and the client wizard (instant feedback).

// Require a plausible shape with an alphabetic TLD of >= 2 chars.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;

// Typos of ".com" (and a few of .net/.org) that are never valid TLDs. Broad but
// zero false positives — real ccTLDs like .co, .cm, .om, .cn are intentionally
// NOT here so legitimate regional addresses still pass.
const BAD_TLDS = new Set([
  "con", "conm", "comn", "ccom", "coom", "ocm", "cmo", "cpm", "cim", "comm",
  "xom", "vom", "xon", "clm", "copm", "dom", "com1", "cmm", "coma", "comme",
  "nte", "nett", "orgg", "ogr", "orh", "gmail", "gmal",
]);

// Full-domain typos of popular providers → the intended domain.
const TYPO_DOMAINS = new Map<string, string>([
  ["gmail.co", "gmail.com"], ["gmail.cm", "gmail.com"], ["gmail.om", "gmail.com"],
  ["gmial.com", "gmail.com"], ["gmai.com", "gmail.com"], ["gmil.com", "gmail.com"],
  ["gnail.com", "gmail.com"], ["gamil.com", "gmail.com"], ["gmaill.com", "gmail.com"],
  ["gmal.com", "gmail.com"], ["gmailcom", "gmail.com"],
  ["hotmail.co", "hotmail.com"], ["hotmial.com", "hotmail.com"], ["hotmal.com", "hotmail.com"],
  ["hormail.com", "hotmail.com"], ["hotmailcom", "hotmail.com"],
  ["yaho.com", "yahoo.com"], ["yahooo.com", "yahoo.com"], ["yhoo.com", "yahoo.com"],
  ["yahoo.co", "yahoo.com"],
  ["outlook.co", "outlook.com"], ["outlok.com", "outlook.com"], ["outook.com", "outlook.com"],
  ["iclod.com", "icloud.com"], ["icloud.co", "icloud.com"], ["iclould.com", "icloud.com"],
]);

export interface EmailCheck {
  valid: boolean;
  message?: string;
}

/** Validate an attendee email, catching common typos. Empty is treated as valid
 *  here (the caller decides whether email is required — walk-ins may omit it). */
export function checkAttendeeEmail(raw: string): EmailCheck {
  const email = raw.trim().toLowerCase();
  if (email.length === 0) return { valid: true };
  if (!EMAIL_RE.test(email)) {
    return { valid: false, message: "Enter a valid email address" };
  }
  const domain = email.slice(email.lastIndexOf("@") + 1);
  const tld = domain.slice(domain.lastIndexOf(".") + 1);

  if (BAD_TLDS.has(tld)) {
    return { valid: false, message: `".${tld}" looks like a typo — check the email domain` };
  }
  const suggestion = TYPO_DOMAINS.get(domain);
  if (suggestion) {
    return { valid: false, message: `Did you mean @${suggestion}?` };
  }
  return { valid: true };
}

/** Convenience boolean form. */
export function isValidAttendeeEmail(raw: string): boolean {
  return checkAttendeeEmail(raw).valid;
}
