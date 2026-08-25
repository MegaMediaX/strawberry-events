"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BADGE_TAGS, BADGE_TAG_LABEL, type BadgeTagValue } from "@/lib/badges/tags";
import {
  JOB_TITLE_MAX,
  JOB_TITLE_OTHER,
  JOB_TITLE_PRESETS,
  resolveJobTitleSelection,
} from "@/lib/registration/job-title";
import type { DoorWalkIn } from "./actions";

export interface DoorTicket {
  id: number;
  title: string;
}

/**
 * Split what the operator typed into the search box into a first and last name.
 *
 * They searched for this person and found nobody, so the text is already their
 * best attempt at the name — retyping it is the friction this whole panel
 * exists to remove. Everything after the first word is the surname, because
 * "Abdel Rahman Al-Hassan" is one family name, not three middle names.
 */
export function splitName(query: string): { firstName: string; lastName: string } {
  const parts = query.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

/**
 * Register someone at the door and admit them, without leaving the screen.
 *
 * Company and job title are here because an exhibitor's badge is worth as much
 * as an attendee's, and the walk-in desk was the one place they could not be
 * captured without a second visit to a different page.
 */
export function DoorWalkInForm({
  prefill,
  tickets,
  busy,
  onCancel,
  onSubmit,
}: {
  prefill: string;
  tickets: DoorTicket[];
  busy: boolean;
  onCancel: () => void;
  onSubmit: (input: DoorWalkIn) => void;
}) {
  const uid = useId();
  const fid = {
    first: `${uid}-first`, last: `${uid}-last`, email: `${uid}-email`,
    cc: `${uid}-cc`, phone: `${uid}-phone`, company: `${uid}-company`,
    title: `${uid}-title`, other: `${uid}-other`, role: `${uid}-role`, ticket: `${uid}-ticket`,
  };

  const split = splitName(prefill);
  const [firstName, setFirstName] = useState(split.firstName);
  const [lastName, setLastName] = useState(split.lastName);
  const [email, setEmail] = useState("");
  const [cc, setCc] = useState("+961");
  const [phone, setPhone] = useState("");
  const [company, setCompany] = useState("");
  const [title, setTitle] = useState("");
  const [other, setOther] = useState("");
  const [role, setRole] = useState<BadgeTagValue>("visitor");
  const [itemId, setItemId] = useState<number | "">(tickets[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
    firstRef.current?.select();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  // The job title only makes sense against an employer, matching the public
  // form and the walk-in desk.
  const showTitle = company.trim() !== "";

  function submit() {
    // Guard the handler itself, not just the disabled attribute: a double-tap
    // fires twice before React commits `disabled`, and this one creates a real
    // pretix order.
    if (busy) return;
    setErr(null);
    if (!firstName.trim() || !lastName.trim()) return setErr("First and last name are required.");
    if (itemId === "") return setErr("Choose a ticket type.");
    const resolved = resolveJobTitleSelection(showTitle ? title : "", other);
    if (!resolved.ok) return setErr(resolved.error);
    onSubmit({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim() || undefined,
      phoneCC: cc.trim() || undefined,
      phone: phone.trim() || undefined,
      company: company.trim() || null,
      jobTitle: resolved.value,
      roleTag: role,
      itemId: Number(itemId),
    });
  }

  const field = "h-12 text-[16px]";

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4">
      <p className="text-[15px] font-semibold">Register &amp; check in</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Registers, admits and prints a badge in one go.
      </p>

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.first}>First name</Label>
          <Input ref={firstRef} id={fid.first} className={field} value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.last}>Last name</Label>
          <Input id={fid.last} className={field} value={lastName}
            onChange={(e) => setLastName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.company}>Company (optional)</Label>
          <Input id={fid.company} className={field} value={company}
            onChange={(e) => {
              setCompany(e.target.value);
              // Clearing the company clears the title held behind it, so a
              // selection cannot reappear against a different employer.
              if (!e.target.value.trim()) { setTitle(""); setOther(""); }
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        {showTitle && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fid.title}>Job title (optional)</Label>
            <select id={fid.title}
              className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-[16px]"
              value={title}
              onChange={(e) => { setTitle(e.target.value); if (e.target.value !== JOB_TITLE_OTHER) setOther(""); }}
            >
              <option value="">Select…</option>
              {JOB_TITLE_PRESETS.map((pre) => <option key={pre} value={pre}>{pre}</option>)}
              <option value={JOB_TITLE_OTHER}>{JOB_TITLE_OTHER}</option>
            </select>
          </div>
        )}

        {showTitle && title === JOB_TITLE_OTHER && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={fid.other}>Their job title</Label>
            <Input id={fid.other} className={field} maxLength={JOB_TITLE_MAX} value={other}
              onChange={(e) => setOther(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          </div>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.role}>Badge role</Label>
          <select id={fid.role}
            className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-[16px]"
            value={role} onChange={(e) => setRole(e.target.value as BadgeTagValue)}
          >
            {BADGE_TAGS.map((t) => <option key={t} value={t}>{BADGE_TAG_LABEL[t]}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.ticket}>Ticket</Label>
          <select id={fid.ticket}
            className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-[16px]"
            value={itemId} onChange={(e) => setItemId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            {tickets.length === 0 && <option value="">— none available —</option>}
            {tickets.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.email}>Email (optional)</Label>
          <Input id={fid.email} type="email" className={field} value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={fid.phone}>Phone (optional)</Label>
          <div className="flex gap-2">
            <Input id={fid.cc} aria-label="Country code" className="h-12 w-24 text-[16px]"
              value={cc} onChange={(e) => setCc(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
            <Input id={fid.phone} className="h-12 flex-1 text-[16px]" value={phone}
              onChange={(e) => setPhone(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submit()}
          />
          </div>
        </div>
      </div>

      {err && (
        <p role="alert" className="mt-3 text-[14px] text-destructive">
          {err}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button className="min-h-12 px-5 text-[15px]" onClick={submit} disabled={busy}>
          {busy ? "Registering…" : "Register, check in & print"}
        </Button>
        <Button variant="outline" className="min-h-12 px-5 text-[15px]" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
      </div>
    </div>
  );
}
