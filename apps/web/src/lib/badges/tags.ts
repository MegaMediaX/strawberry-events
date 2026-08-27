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
};

/**
 * The text printed in the badge's role band, always upper case.
 *
 * Falls back to the raw value with underscores opened out, so an enum value
 * added to the database but not yet to the label map prints as readable words
 * rather than `organising_committee` across someone's chest.
 */
export function badgeBandText(tag: string): string {
  const label = BADGE_TAG_LABEL[tag as BadgeTagValue];
  return (label ?? tag.replace(/_/g, " ")).toUpperCase();
}
