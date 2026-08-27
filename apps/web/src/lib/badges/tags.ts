import type { AttendeeTag } from "@prisma/client";

/**
 * Every badge role, in the order they should be offered.
 *
 * This list exists because the five original tags were spelled out by hand in
 * thirteen separate files — schemas, admin filters, invite panels, the walk-in
 * form, the badge template. Adding a role meant finding all thirteen, and
 * missing one meant a role assignable in some places and not others.
 *
 * `satisfies readonly AttendeeTag[]` checks only that every entry here is a
 * REAL AttendeeTag. It does not check the other direction — an empty array
 * would satisfy it just as well — so the exhaustiveness guard below does that
 * half, which is the half that actually bites: a value in the database enum and
 * missing from this list is assignable nowhere AND rejected by
 * updateAttendeeDetails, so the role exists and cannot be used, silently.
 */
export const BADGE_TAGS = [
  "visitor",
  "media",
  "partner",
  "investor",
  "startup",
  "government",
  "speaker",
  "moderator",
  "staff",
  "exhibitor",
  "organising_committee",
  "organiser",
  "cofounder",
  "strawberry",
  "other",
] as const satisfies readonly AttendeeTag[];

export type BadgeTagValue = (typeof BADGE_TAGS)[number];

/**
 * Compile-time exhaustiveness: every AttendeeTag must appear in BADGE_TAGS.
 *
 * If a migration adds a tenth role and nobody adds it here, this line stops
 * compiling and names the missing value. Without it, both the compiler and the
 * unit test stay green — the test compares BADGE_TAGS against its own
 * hardcoded copy of the same list, which cannot see the database enum at all.
 */
type TagsMissingFromList = Exclude<AttendeeTag, BadgeTagValue>;
const _everyRoleIsListed: TagsMissingFromList extends never ? true : never = true;
void _everyRoleIsListed;

/**
 * What each role is called in a UI. All are listed, not just the underscored
 * one, so a new tag cannot be added without deciding how it reads to a human.
 */
export const BADGE_TAG_LABEL: Record<BadgeTagValue, string> = {
  visitor: "Visitor",
  media: "Media",
  partner: "Partner",
  investor: "Investor",
  startup: "Startup",
  government: "Government",
  speaker: "Speaker",
  moderator: "Moderator",
  staff: "Staff",
  exhibitor: "Exhibitor",
  organising_committee: "Organising committee",
  organiser: "Organiser",
  cofounder: "Co-founder",
  strawberry: "Strawberry",
  other: "Other",
};

/**
 * The role whose band text the operator types. Unlike JOB_TITLE_OTHER this IS
 * a stored value — `roleTag` is an enum and has to hold something — so the
 * typed text lives beside it in `AttendeeOrder.roleLabel`, and the pair is
 * only ever resolved back together here and in `resolveRoleLabel`.
 */
export const ROLE_OTHER = "other";

/**
 * Longest role text the band can print without being cut off.
 *
 * Derived, not guessed. bandFontSize floors at BAND_MIN_SIZE (28), and
 * BAND_TEXT_WIDTH / (BAND_ADVANCE * 28) = 25 characters. At 26 the font can no
 * longer shrink to compensate and BOTH renderers clip — ZPL at its field-block
 * width, canvas at its clip rect — silently, which is the failure mode this
 * whole module exists to avoid.
 *
 * 20 rather than 25 because the band is meant to be read across a room: 20
 * prints at size 36, 25 prints at the bare minimum 28. The five characters buy
 * legibility, and every real answer — "Accelerator", "University", "Press
 * office" — fits comfortably inside them.
 */
export const ROLE_LABEL_MAX = 20;

export type RoleLabelResolution =
  | { ok: true; value: string | null }
  | { ok: false; error: string };

/**
 * Turn a role selection plus its free-text companion into the value to store.
 *
 * Mirrors resolveJobTitleSelection, and exists for the same reason: the rule
 * "Other must be replaced by real text before it is stored" is the one that
 * fails silently. A row tagged `other` with a null label prints a band reading
 * OTHER, which tells a door operator nothing and looks deliberate.
 */
export function resolveRoleLabel(
  tag: string | null | undefined,
  otherText: string | null | undefined,
): RoleLabelResolution {
  // Every fixed role: the label column stays null. Returning the leftover text
  // would attach it to a role that does not use it, and it would resurface the
  // next time someone switched that person back to Other.
  if (tag !== ROLE_OTHER) return { ok: true, value: null };

  const typed = otherText?.trim() || null;
  if (!typed) return { ok: false, error: "Type the role to print on the badge." };
  if (typed.length > ROLE_LABEL_MAX) {
    return { ok: false, error: `Role must be ${ROLE_LABEL_MAX} characters or fewer.` };
  }
  return { ok: true, value: typed };
}

/**
 * The text printed in the badge's role band, always upper case.
 *
 * For `other`, that is whatever the operator typed. Falls back to the raw
 * value with underscores opened out, so an enum value added to the database
 * but not yet to the label map prints as readable words rather than
 * `organising_committee` across someone's chest — and an `other` whose label
 * never made it this far prints OTHER rather than an empty black bar.
 */
export function badgeBandText(tag: string, roleLabel?: string | null): string {
  if (tag === ROLE_OTHER) {
    const typed = roleLabel?.trim();
    if (typed) return typed.toUpperCase();
  }
  const label = BADGE_TAG_LABEL[tag as BadgeTagValue];
  return (label ?? tag.replace(/_/g, " ")).toUpperCase();
}
