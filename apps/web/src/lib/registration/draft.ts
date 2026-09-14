/**
 * A registration in progress, kept across a reload.
 *
 * All of the wizard's state lived in component state, so a refresh, a back
 * gesture, a terms link opened in the same tab or an OS memory reclaim on
 * mobile dropped four steps of work with no warning — including a seat map.
 *
 * Deliberately `sessionStorage`, not `localStorage`: the draft holds a name,
 * an email and a phone number, and a tab-scoped store clears itself when the
 * tab closes rather than leaving that on a shared or public device. It is also
 * cleared the moment the registration succeeds.
 *
 * Consents are NOT part of the draft. Accepting the Terms, the Privacy Policy
 * and the data-use statement is an act the attendee performs, not a value to
 * restore on their behalf — a restored tick would claim consent nobody gave in
 * this session.
 */

export interface RegistrationDraft {
  attendee: {
    firstName: string;
    lastName: string;
    email: string;
    phoneCC: string;
    phone: string;
    company: string;
    attendeeType: string;
    jobTitle: string;
    jobTitleOther: string;
  };
  quantities: Record<number, number>;
  optedIn: string[];
  subEvents: { itemId: number; quantity: number }[];
  answers: Record<string, string>;
}

/** Per event: two events open in two tabs must not overwrite each other. */
export function draftKey(slug: string): string {
  return `strawberry:registration-draft:${slug}`;
}

/** Storage can throw (private mode, blocked site data) — never break the form. */
function store(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

export function saveDraft(slug: string, draft: RegistrationDraft): void {
  try {
    store()?.setItem(draftKey(slug), JSON.stringify(draft));
  } catch {
    // A full or disabled store is not a reason to interrupt a registration.
  }
}

export function clearDraft(slug: string): void {
  try {
    store()?.removeItem(draftKey(slug));
  } catch {
    // ignore
  }
}

/**
 * Read a draft back, or null when there is nothing usable.
 *
 * Everything is re-checked rather than trusted: the value is user-writable, and
 * a draft written before a change to this shape must not be able to put a
 * malformed object into the form's state.
 */
export function loadDraft(slug: string): RegistrationDraft | null {
  let raw: string | null = null;
  try {
    raw = store()?.getItem(draftKey(slug)) ?? null;
  } catch {
    return null;
  }
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const attendee = isRecord(parsed.attendee) ? parsed.attendee : {};
    return {
      attendee: {
        firstName: str(attendee.firstName),
        lastName: str(attendee.lastName),
        email: str(attendee.email),
        phoneCC: str(attendee.phoneCC),
        phone: str(attendee.phone),
        company: str(attendee.company),
        attendeeType: str(attendee.attendeeType),
        jobTitle: str(attendee.jobTitle),
        jobTitleOther: str(attendee.jobTitleOther),
      },
      quantities: numberMap(parsed.quantities),
      optedIn: stringList(parsed.optedIn),
      subEvents: subEventList(parsed.subEvents),
      answers: stringMap(parsed.answers),
    };
  } catch {
    return null;
  }
}

/**
 * True when the draft holds anything worth restoring.
 *
 * `phoneCC` is excluded on purpose: it ships with a default, so counting it
 * would make an untouched form look filled in — writing a draft on page load
 * and offering to restore an empty one.
 */
export function draftHasContent(draft: RegistrationDraft): boolean {
  const { phoneCC: _ignored, ...typed } = draft.attendee;
  return (
    Object.values(typed).some((v) => v.trim() !== "") ||
    Object.keys(draft.quantities).length > 0 ||
    draft.subEvents.length > 0 ||
    Object.keys(draft.answers).length > 0
  );
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function numberMap(v: unknown): Record<number, number> {
  if (!isRecord(v)) return {};
  const out: Record<number, number> = {};
  for (const [key, value] of Object.entries(v)) {
    const id = Number(key);
    if (Number.isInteger(id) && typeof value === "number" && value > 0) {
      out[id] = Math.floor(value);
    }
  }
  return out;
}

function stringMap(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(v)) {
    if (typeof value === "string") out[key] = value;
  }
  return out;
}

function stringList(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
}

function subEventList(v: unknown): { itemId: number; quantity: number }[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const { itemId, quantity } = entry;
    if (typeof itemId !== "number" || typeof quantity !== "number") return [];
    if (!Number.isInteger(itemId) || quantity <= 0) return [];
    return [{ itemId, quantity: Math.floor(quantity) }];
  });
}
