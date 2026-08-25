import type { AttendeeTag } from "@prisma/client";

/**
 * Every badge role, in the order they should be offered.
 *
 * This list exists because the five original tags were spelled out by hand in
 * thirteen separate files — schemas, admin filters, invite panels, the walk-in
 * form, the badge template. Adding a role meant finding all thirteen, and
 * missing one meant a role assignable in some places and not others.
 *
 * `satisfies readonly AttendeeTag[]` ties it to the database enum, so the
 * compiler fails here, once, if the two ever disagree.
 */
export const BADGE_TAGS = [
  "visitor",
  "media",
  "partner",
  "speaker",
  "staff",
  "exhibitor",
  "organising_committee",
  "organiser",
  "cofounder",
] as const satisfies readonly AttendeeTag[];

export type BadgeTagValue = (typeof BADGE_TAGS)[number];

/**
 * What each role is called in a UI. All are listed, not just the underscored
 * one, so a new tag cannot be added without deciding how it reads to a human.
 */
export const BADGE_TAG_LABEL: Record<BadgeTagValue, string> = {
  visitor: "Visitor",
  media: "Media",
  partner: "Partner",
  speaker: "Speaker",
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
