"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  JOB_TITLE_MAX,
  JOB_TITLE_OTHER,
  JOB_TITLE_PRESETS,
  resolveJobTitleSelection,
} from "@/lib/registration/job-title";

export interface EditTarget {
  orderCode: string;
  fullName: string;
  company: string | null;
  jobTitle: string | null;
}

/**
 * Correct someone's printed details at the door.
 *
 * Opened AFTER a badge has printed, not before: the moment staff discover a
 * misspelt name is when they read the label. Putting this in the path to
 * checking someone in would slow down the 95% of people whose details are fine.
 *
 * Only the three fields that appear on the badge are here. Email, phone, role
 * and tickets decide who someone is and what they are entitled to; those are an
 * admin's job, not a correction made with a queue waiting.
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
  onSave: (patch: { fullName: string; company: string; jobTitle: string }) => void;
}) {
  const uid = useId();
  const fid = {
    name: `${uid}-name`,
    company: `${uid}-company`,
    title: `${uid}-title`,
    other: `${uid}-other`,
  };

  // A title already on the row is either a preset or free text someone typed.
  // Free text has to reopen as "Other" with the box filled, or saving without
  // touching the field would silently wipe it.
  const known = (JOB_TITLE_PRESETS as readonly string[]).includes(target.jobTitle ?? "");
  const [name, setName] = useState(target.fullName);
  const [company, setCompany] = useState(target.company ?? "");
  const [title, setTitle] = useState(known ? (target.jobTitle as string) : target.jobTitle ? JOB_TITLE_OTHER : "");
  const [other, setOther] = useState(known ? "" : (target.jobTitle ?? ""));
  const [err, setErr] = useState<string | null>(null);

  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    // The overwhelmingly common reason to open this is a misspelt name, so the
    // cursor starts there with the text selected — one correction, no tabbing.
    nameRef.current?.focus();
    nameRef.current?.select();
  }, []);

  // Escape closes. A door operator who opened this by accident should not have
  // to find a button while someone waits.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  function submit() {
    setErr(null);
    if (!name.trim()) return setErr("A name is required.");
    const resolved = resolveJobTitleSelection(title, other);
    if (!resolved.ok) return setErr(resolved.error);
    onSave({ fullName: name.trim(), company: company.trim(), jobTitle: resolved.value ?? "" });
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

      {err && <p className="mt-3 text-[14px] text-destructive">{err}</p>}

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
