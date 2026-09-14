"use client";

import { useId, type Ref } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BADGE_TAGS,
  BADGE_TAG_LABEL,
  ROLE_OTHER,
  ROLE_LABEL_MAX,
  resolveRoleLabel,
  type BadgeTagValue,
} from "@/lib/badges/tags";
import {
  JOB_TITLE_MAX,
  JOB_TITLE_OTHER,
  JOB_TITLE_PRESETS,
  jobTitleForCompanyChange,
  resolveVisibleJobTitle,
} from "@/lib/registration/job-title";

/**
 * The attendee half of a walk-in, in one place.
 *
 * Two forms register the same person into the same system: the door's inline
 * form and the desk page. They had drifted — one resolved the job title with
 * `resolveJobTitleSelection`, the other with `resolveVisibleJobTitle`; one
 * cleared the title when the company was emptied and the other did it in a
 * different place; the desk form announced almost every field unlabelled, and
 * said so in its own comment. The shared helpers under lib/ exist because this
 * rule has drifted before; the forms around them were the thing drifting next.
 *
 * What stays with each caller is what genuinely differs: the ticket picker
 * (the desk shows prices), the submit (the door also checks in and prints),
 * and what happens afterwards.
 */

export interface WalkInAttendee {
  firstName: string;
  lastName: string;
  email: string;
  phoneCC: string;
  phone: string;
  company: string;
  /** The dropdown selection, which may be the "Other" sentinel. */
  jobTitle: string;
  /** The text typed behind "Other". Never stored as-is. */
  jobTitleOther: string;
  roleTag: BadgeTagValue;
  /** The text typed behind the "Other" badge role. */
  roleOther: string;
}

export const EMPTY_WALK_IN_ATTENDEE: WalkInAttendee = {
  firstName: "",
  lastName: "",
  email: "",
  phoneCC: "+961",
  phone: "",
  company: "",
  jobTitle: "",
  jobTitleOther: "",
  roleTag: "visitor",
  roleOther: "",
};

export interface ResolvedWalkInAttendee {
  firstName: string;
  lastName: string;
  email: string;
  phoneCC: string;
  phone: string;
  company: string | null;
  jobTitle: string | null;
  roleTag: BadgeTagValue;
  roleLabel: string | null;
}

/**
 * Turn what was typed into what is stored, or say why it cannot be.
 *
 * One function for both forms: the sentinels ("Other" for a job title, for a
 * badge role) must never leave either one, and a rule applied twice is a rule
 * that will eventually be applied two ways.
 *
 * The job title is resolved against the SAME expression that decides whether
 * its fields are on screen, so neither form can demand a title while the
 * control is hidden.
 */
export function resolveWalkInAttendee(
  value: WalkInAttendee,
): { ok: true; value: ResolvedWalkInAttendee } | { ok: false; error: string } {
  if (!value.firstName.trim() || !value.lastName.trim()) {
    return { ok: false, error: "First and last name are required." };
  }

  const title = resolveVisibleJobTitle(
    value.company.trim() !== "",
    value.jobTitle,
    value.jobTitleOther,
  );
  if (!title.ok) return { ok: false, error: title.error };

  const role = resolveRoleLabel(value.roleTag, value.roleOther);
  if (!role.ok) return { ok: false, error: role.error };

  return {
    ok: true,
    value: {
      firstName: value.firstName.trim(),
      lastName: value.lastName.trim(),
      email: value.email.trim(),
      phoneCC: value.phoneCC.trim(),
      phone: value.phone.trim(),
      // Trimmed: untrimmed, a company of a single space is stored verbatim
      // while the "is there a company" check treats it as absent — the form
      // says no company and the row says " ".
      company: value.company.trim() || null,
      jobTitle: title.value,
      roleTag: value.roleTag,
      roleLabel: role.value,
    },
  };
}

export function AttendeeFields({
  value,
  onChange,
  /** Door lanes get 48px controls for gloved, hurried taps. */
  size = "default",
  firstFieldRef,
  /** Enter anywhere in the field set submits, at the door. */
  onEnterSubmit,
}: {
  value: WalkInAttendee;
  onChange: (next: WalkInAttendee) => void;
  size?: "default" | "door";
  firstFieldRef?: Ref<HTMLInputElement>;
  onEnterSubmit?: () => void;
}) {
  const uid = useId();
  const fid = {
    first: `${uid}-first`,
    last: `${uid}-last`,
    email: `${uid}-email`,
    cc: `${uid}-cc`,
    phone: `${uid}-phone`,
    company: `${uid}-company`,
    title: `${uid}-title`,
    titleOther: `${uid}-title-other`,
    role: `${uid}-role`,
    roleOther: `${uid}-role-other`,
  };

  const door = size === "door";
  const field = door ? "h-12 text-[16px]" : "";
  const select = door
    ? "h-12 w-full rounded-lg border border-input bg-transparent px-3 text-[16px]"
    : "h-10 w-full rounded-[var(--radius-md)] border border-input bg-transparent px-3 text-sm";

  const set = (patch: Partial<WalkInAttendee>) => onChange({ ...value, ...patch });
  const onKeyDown = onEnterSubmit
    ? (e: React.KeyboardEvent) => {
        if (e.key === "Enter") onEnterSubmit();
      }
    : undefined;

  // A title belongs to an employer, so it is only asked once there is one.
  // A walk-in has no attendee type, so the company stands in for it.
  const showTitle = value.company.trim() !== "";

  return (
    <>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.first}>First name</Label>
          <Input
            ref={firstFieldRef}
            id={fid.first}
            className={field}
            autoComplete="given-name"
            value={value.firstName}
            onChange={(e) => set({ firstName: e.target.value })}
            onKeyDown={onKeyDown}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.last}>Last name</Label>
          <Input
            id={fid.last}
            className={field}
            autoComplete="family-name"
            value={value.lastName}
            onChange={(e) => set({ lastName: e.target.value })}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fid.email}>Email (optional)</Label>
        <Input
          id={fid.email}
          type="email"
          className={field}
          autoComplete="email"
          value={value.email}
          onChange={(e) => set({ email: e.target.value })}
          onKeyDown={onKeyDown}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fid.phone}>Phone (optional)</Label>
        <div className="flex gap-2">
          <Input
            id={fid.cc}
            aria-label="Country code"
            className={door ? "h-12 w-24 text-[16px]" : "w-24"}
            value={value.phoneCC}
            onChange={(e) => set({ phoneCC: e.target.value })}
            onKeyDown={onKeyDown}
          />
          <Input
            id={fid.phone}
            type="tel"
            className={door ? "h-12 flex-1 text-[16px]" : "flex-1"}
            value={value.phone}
            onChange={(e) => set({ phone: e.target.value })}
            onKeyDown={onKeyDown}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fid.company}>Company (optional)</Label>
        <Input
          id={fid.company}
          className={field}
          autoComplete="organization"
          value={value.company}
          onChange={(e) =>
            set({
              company: e.target.value,
              // Emptying the company hides the title fields, and a selection
              // left behind them reappears — already filled in — the moment a
              // company is typed again, silently reattaching the old title to
              // a different employer.
              ...jobTitleForCompanyChange({
                company: e.target.value,
                jobTitle: value.jobTitle,
                jobTitleOther: value.jobTitleOther,
              }),
            })
          }
          onKeyDown={onKeyDown}
        />
      </div>

      {showTitle && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.title}>Job title (optional)</Label>
          <select
            id={fid.title}
            className={select}
            value={value.jobTitle}
            onChange={(e) =>
              set({
                jobTitle: e.target.value,
                // Drop text typed behind "Other" when the choice moves away,
                // so a stale value cannot be revived by picking it again.
                jobTitleOther: e.target.value === JOB_TITLE_OTHER ? value.jobTitleOther : "",
              })
            }
          >
            <option value="">Select…</option>
            {JOB_TITLE_PRESETS.map((preset) => (
              <option key={preset} value={preset}>
                {preset}
              </option>
            ))}
            <option value={JOB_TITLE_OTHER}>{JOB_TITLE_OTHER}</option>
          </select>
        </div>
      )}

      {showTitle && value.jobTitle === JOB_TITLE_OTHER && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.titleOther}>Their job title</Label>
          <Input
            id={fid.titleOther}
            className={field}
            required
            aria-required="true"
            maxLength={JOB_TITLE_MAX}
            autoComplete="organization-title"
            value={value.jobTitleOther}
            onChange={(e) => set({ jobTitleOther: e.target.value })}
            onKeyDown={onKeyDown}
          />
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={fid.role}>Badge role</Label>
        <select
          id={fid.role}
          className={select}
          value={value.roleTag}
          onChange={(e) => set({ roleTag: e.target.value as BadgeTagValue })}
        >
          {BADGE_TAGS.map((tag) => (
            <option key={tag} value={tag}>
              {BADGE_TAG_LABEL[tag]}
            </option>
          ))}
        </select>
      </div>

      {/* The text SURVIVES switching away and back, unlike the job title's box:
          this one appears because the operator picked Other, so seeing their
          own text again is expected, whereas the title's appears when an
          unrelated field (company) becomes non-empty. Nothing leaks either
          way — resolveRoleLabel returns null for every role but Other. */}
      {value.roleTag === ROLE_OTHER && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.roleOther}>Role to print on the badge</Label>
          <Input
            id={fid.roleOther}
            className={field}
            maxLength={ROLE_LABEL_MAX}
            placeholder="e.g. Accelerator"
            value={value.roleOther}
            onChange={(e) => set({ roleOther: e.target.value })}
            onKeyDown={onKeyDown}
          />
          <p className="text-[12px] text-muted-foreground">
            Printed in upper case across the badge. {ROLE_LABEL_MAX} characters max.
          </p>
        </div>
      )}
    </>
  );
}
