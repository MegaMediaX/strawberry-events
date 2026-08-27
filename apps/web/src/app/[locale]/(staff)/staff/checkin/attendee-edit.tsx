"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  BADGE_TAGS, BADGE_TAG_LABEL, ROLE_OTHER, ROLE_LABEL_MAX, resolveRoleLabel,
  type BadgeTagValue,
} from "@/lib/badges/tags";
import {
  JOB_TITLE_MAX,
  JOB_TITLE_OTHER,
  JOB_TITLE_PRESETS,
  resolveJobTitleSelection,
} from "@/lib/registration/job-title";

export interface EditTarget {
  orderCode: string;
  fullName: string;
  email: string;
  phone: string | null;
  phoneCC: string | null;
  company: string | null;
  jobTitle: string | null;
  roleTag: BadgeTagValue;
  roleLabel: string | null;
}

/**
 * Correct someone's printed details at the door.
 *
 * Opened AFTER a badge has printed, not before: the moment staff discover a
 * misspelt name is when they read the label. Putting this in the path to
 * checking someone in would slow down the 95% of people whose details are fine.
 *
 * Everything the operator can see is editable, including the badge role — a
 * visitor who turns out to be an exhibitor gets the right band without an admin.
 *
 * Ticketing state is not here: order status, approval, seats and the pretix
 * secret live in pretix, and changing them from a door would leave the two
 * systems disagreeing about one order mid-event.
 */
export function AttendeeEditDialog({
  target,
  busy,
  onCancel,
  onSave,
}: {
  target: EditTarget;
  busy: boolean;
  onCancel: () => void;
  onSave: (patch: {
    fullName: string;
    email: string;
    phone: string;
    phoneCC: string;
    company: string;
    jobTitle: string;
    roleTag: BadgeTagValue;
    roleLabel: string;
  }) => void;
}) {
  const uid = useId();
  const fid = {
    name: `${uid}-name`,
    email: `${uid}-email`,
    cc: `${uid}-cc`,
    phone: `${uid}-phone`,
    company: `${uid}-company`,
    title: `${uid}-title`,
    other: `${uid}-other`,
    roleOther: `${uid}-role-other`,
    role: `${uid}-role`,
  };

  // A title already on the row is either a preset or free text someone typed.
  // Free text has to reopen as "Other" with the box filled, or saving without
  // touching the field would silently wipe it.
  const known = (JOB_TITLE_PRESETS as readonly string[]).includes(target.jobTitle ?? "");

  // Titles predating the 15-character cap, or predating the "Other" sentinel
  // convention, cannot pass the validation this form applies on save. Left
  // alone they trap the operator: someone opens Fix to correct a MISSPELT NAME,
  // never touches the title, presses Save, and is refused because of a field
  // they did not edit and that looks completely normal on screen — maxLength
  // does not truncate a pre-filled value, it only blocks further typing.
  //
  // So they are surfaced instead of hidden: the title is emptied and the
  // operator is told why, once, in the form. Nothing is saved until they act.
  const legacy = (target.jobTitle ?? "").trim();
  const legacyUnusable =
    legacy.length > JOB_TITLE_MAX || legacy === JOB_TITLE_OTHER;
  const [name, setName] = useState(target.fullName);
  const [email, setEmail] = useState(target.email ?? "");
  const [cc, setCc] = useState(target.phoneCC ?? "");
  const [phone, setPhone] = useState(target.phone ?? "");
  const [role, setRole] = useState<BadgeTagValue>(target.roleTag);
  // Prefilled from the row, so reopening an Other shows what is on the badge
  // rather than an empty box that would blank it on save.
  const [roleOther, setRoleOther] = useState(target.roleLabel ?? "");
  const [company, setCompany] = useState(target.company ?? "");
  const [title, setTitle] = useState(
    known ? (target.jobTitle as string) : legacy && !legacyUnusable ? JOB_TITLE_OTHER : "",
  );
  const [other, setOther] = useState(known || legacyUnusable ? "" : legacy);
  const [err, setErr] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // The overwhelmingly common reason to open this is a misspelt name, so the
    // cursor starts there with the text selected — one correction, no tabbing.
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  // Escape closes. A door operator who opened this by accident should not have
  // to find a button while someone waits — but not once Save is in flight.
  // Escape only takes the form off the screen; it cannot recall the request,
  // which finishes in the background and may already have written the change.
  // An operator who reads a vanished form as "cancelled" does the edit again.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  function submit() {
    if (busy) return;
    setErr(null);
    if (!name.trim()) {
      nameRef.current?.focus();
      return setErr("A name is required.");
    }
    const resolved = resolveJobTitleSelection(title, other);
    if (!resolved.ok) return setErr(resolved.error);
    const resolvedRole = resolveRoleLabel(role, roleOther);
    if (!resolvedRole.ok) return setErr(resolvedRole.error);
    onSave({
      fullName: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      phoneCC: cc.trim(),
      company: company.trim(),
      jobTitle: resolved.value ?? "",
      roleTag: role,
      roleLabel: resolvedRole.value ?? "",
    });
  }

  const showOther = title === JOB_TITLE_OTHER;

  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-[15px] font-semibold">Fix details · {target.orderCode}</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Corrects what prints on the badge and shows on their profile. Saving reprints.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.name}>Full name</Label>
          <Input
            ref={nameRef}
            id={fid.name}
            className="h-12 text-[16px]"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.role}>Badge role</Label>
          <select
            id={fid.role}
            className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-[16px]"
            value={role}
            onChange={(e) => setRole(e.target.value as BadgeTagValue)}
          >
            {BADGE_TAGS.map((t) => (
              <option key={t} value={t}>
                {BADGE_TAG_LABEL[t]}
              </option>
            ))}
          </select>
        </div>

        {/* Revealed by the selection, like the job title's Other box. */}
        {role === ROLE_OTHER && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fid.roleOther}>Role to print on the badge</Label>
            <Input
              id={fid.roleOther}
              className="h-12 text-[16px]"
              value={roleOther}
              maxLength={ROLE_LABEL_MAX}
              placeholder="e.g. Accelerator"
              onChange={(e) => setRoleOther(e.target.value)}
            />
            <p className="text-[12px] text-muted-foreground">
              Printed in upper case across the badge. {ROLE_LABEL_MAX} characters max.
            </p>
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.email}>Email</Label>
          <Input
            id={fid.email}
            type="email"
            className="h-12 text-[16px]"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.phone}>Phone</Label>
          <div className="flex gap-2">
            <Input
              id={fid.cc}
              aria-label="Country code"
              className="h-12 w-24 text-[16px]"
              value={cc}
            placeholder="+961"
              onChange={(e) => setCc(e.target.value)}
            />
            <Input
              id={fid.phone}
              className="h-12 flex-1 text-[16px]"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.company}>Company</Label>
          <Input
            id={fid.company}
            className="h-12 text-[16px]"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.title}>Job title</Label>
          <select
            id={fid.title}
            className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-[16px]"
            value={title}
            onChange={(e) =>
              // Leaving "Other" drops the text behind it, so a stale value
              // cannot be revived by picking "Other" again later.
              { setTitle(e.target.value); if (e.target.value !== JOB_TITLE_OTHER) setOther(""); }
            }
          >
            <option value="">— none —</option>
            {JOB_TITLE_PRESETS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
            <option value={JOB_TITLE_OTHER}>{JOB_TITLE_OTHER}</option>
          </select>
        </div>

        {showOther && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fid.other}>Their job title</Label>
            <Input
              id={fid.other}
              className="h-12 text-[16px]"
              maxLength={JOB_TITLE_MAX}
              value={other}
              onChange={(e) => setOther(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submit()}
            />
          </div>
        )}
      </div>

      {legacyUnusable && (
        <p className="mt-3 text-[14px] text-muted-foreground">
          Their old job title (“{legacy}”) is too long to print, so it has been
          cleared. Pick one above if you want a title on the badge.
        </p>
      )}

      {/* role="alert" so a validation refusal is announced, not just shown. */}
      {err && (
        <p role="alert" className="mt-3 text-[14px] text-destructive">
          {err}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="min-h-12 px-5 text-[15px]" onClick={submit} disabled={busy}>
          {busy ? "Saving…" : "Save & reprint"}
        </Button>
        <Button
          variant="outline"
          className="min-h-12 px-5 text-[15px]"
          onClick={onCancel}
          disabled={busy}
        >
          Cancel
        </Button>
      </div>
    </div>
  );
}
