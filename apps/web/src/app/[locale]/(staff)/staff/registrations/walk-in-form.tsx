"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToPrice } from "@/lib/pretix/mappers";
import { walkInAction, type WalkInActionResult } from "./actions";
import {
  JOB_TITLE_MAX,
  JOB_TITLE_OTHER,
  JOB_TITLE_PRESETS,
  resolveVisibleJobTitle,
  jobTitleForCompanyChange,
} from "@/lib/registration/job-title";
import {
  BADGE_TAGS, BADGE_TAG_LABEL, ROLE_OTHER, ROLE_LABEL_MAX, resolveRoleLabel,
  type BadgeTagValue,
} from "@/lib/badges/tags";

interface WalkInTicket {
  id: number;
  title: string;
  priceCents: number;
}

/**
 * The blank attendee, named once so the initial state and the post-success
 * reset cannot drift. A field present in one literal and missing from the
 * other is this feature's recurring bug: the desk would carry one walk-in's
 * job title over to the next person in the queue.
 */
const EMPTY_ATTENDEE = { firstName: "", lastName: "", email: "", phoneCC: "+961", phone: "", company: "", jobTitle: "", jobTitleOther: "" };


export function WalkInForm({
  locale,
  eventId,
  tickets,
}: {
  locale: string;
  eventId: string;
  tickets: WalkInTicket[];
}) {
  const [itemId, setItemId] = useState<number | "">(tickets[0]?.id ?? "");
  const [roleTag, setRoleTag] = useState<BadgeTagValue>("visitor");
  const [roleOther, setRoleOther] = useState("");
  const [a, setA] = useState(EMPTY_ATTENDEE);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WalkInActionResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Ids so the Labels below actually name their controls. Every other field in
  // this form is a bare <Label> sibling with no htmlFor, so a screen reader
  // announces them unlabelled — the public wizard was fixed for exactly this
  // (see its `fid` map) and this form never was. Scoped to the two fields
  // added here rather than quietly rewriting the whole form days before the
  // event; the rest is worth a follow-up.
  const uid = useId();
  const jobTitleId = `${uid}-job-title`;
  const jobTitleOtherId = `${uid}-job-title-other`;

  // One source of truth for whether the job title fields are on screen. Both
  // the JSX below and the validation in submit() read this, so an error can
  // never point at a control the operator cannot see.
  const showJobTitle = a.company.trim() !== "";

  async function submit() {
    setErr(null);
    setResult(null);
    if (itemId === "") return setErr("Select a ticket type.");
    if (!a.firstName || !a.lastName) {
      return setErr("First name and last name are required.");
    }
    // Resolved before the request so "Other" with nothing typed is caught at
    // the desk, not swallowed into a badge that reads "Other" — but only while
    // the fields are visible, or clearing the company traps the desk behind an
    // error about a control that is no longer rendered.
    const title = resolveVisibleJobTitle(showJobTitle, a.jobTitle, a.jobTitleOther);
    if (!title.ok) return setErr(title.error);
    // Same reason as the title above: caught at the desk, not swallowed into a
    // badge that reads OTHER.
    const role = resolveRoleLabel(roleTag, roleOther);
    if (!role.ok) return setErr(role.error);
    setBusy(true);
    const res = await walkInAction(eventId, {
      itemId: Number(itemId),
      roleTag,
      roleLabel: role.value,
      locale: locale === "ar" ? "ar" : "en",
      // Listed field by field rather than spread: `a` also carries the raw
      // dropdown selection and the text behind "Other", neither of which is a
      // job title until resolveVisibleJobTitle has turned them into one.
      attendee: {
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        phoneCC: a.phoneCC,
        phone: a.phone,
        // Trimmed, like the wizard does. Untrimmed, a company of a single
        // space is stored verbatim while `showJobTitle` (which trims) treats
        // it as absent — the form says "no company" and the row says " ".
        company: a.company.trim() || null,
        jobTitle: title.value,
      },
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "Registration failed.");
    setResult(res);
    setA(EMPTY_ATTENDEE);
  }

  if (result?.ok) {
    const issued = result.status === "paid" && result.approvalStatus === "not_required";
    return (
      <div className="rounded-[var(--radius-lg)] border border-border p-4">
        <div className="font-medium">Walk-in registered · {result.orderCode}</div>
        <p className="mt-1 text-sm text-muted-foreground">
          {issued
            ? "Ticket issued — you can print the badge."
            : result.approvalStatus === "pending"
              ? "Pending approval — the attendee will be notified once a decision is made."
              : "Pending payment (COD) — collect payment, then mark paid in Finance to issue the ticket."}
        </p>
        <Button className="mt-3" type="button" variant="outline" onClick={() => setResult(null)}>
          Register another
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>Ticket type</Label>
        <select
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={itemId}
          onChange={(e) => setItemId(e.target.value ? Number(e.target.value) : "")}
        >
          {tickets.length === 0 && <option value="">No tickets available</option>}
          {tickets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.title} — {t.priceCents === 0 ? "Free" : `$${centsToPrice(t.priceCents)}`}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label>Role / tag</Label>
        <select
          className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          value={roleTag}
          onChange={(e) => setRoleTag(e.target.value as BadgeTagValue)}
        >
          {BADGE_TAGS.map((r) => (
            <option key={r} value={r}>
              {BADGE_TAG_LABEL[r]}
            </option>
          ))}
        </select>
      </div>
      {roleTag === ROLE_OTHER && (
        <div>
          <Label>Role to print on the badge</Label>
          <Input
            className="mt-1"
            value={roleOther}
            maxLength={ROLE_LABEL_MAX}
            placeholder="e.g. Accelerator"
            onChange={(e) => setRoleOther(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            Printed in upper case across the badge. {ROLE_LABEL_MAX} characters max.
          </p>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>First name</Label>
          <Input value={a.firstName} onChange={(e) => setA({ ...a, firstName: e.target.value })} />
        </div>
        <div>
          <Label>Last name</Label>
          <Input value={a.lastName} onChange={(e) => setA({ ...a, lastName: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Email (optional)</Label>
        <Input type="email" value={a.email} onChange={(e) => setA({ ...a, email: e.target.value })} />
      </div>
      <div className="grid grid-cols-[100px_1fr] gap-3">
        <div>
          <Label>Code</Label>
          <Input value={a.phoneCC} onChange={(e) => setA({ ...a, phoneCC: e.target.value })} />
        </div>
        <div>
          <Label>Phone (optional)</Label>
          <Input value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Company (optional)</Label>
        <Input
          value={a.company}
          onChange={(e) =>
            setA({
              ...a,
              company: e.target.value,
              // Clearing the company clears the title with it, so a held
              // selection cannot reappear against a different company.
              ...jobTitleForCompanyChange({
                company: e.target.value,
                jobTitle: a.jobTitle,
                jobTitleOther: a.jobTitleOther,
              }),
            })
          }
        />
      </div>
      {/* A title belongs to an employer, so it is only asked once there is one.
          The walk-in form has no attendee type, so the company name is what
          stands in for "is this person with a company". */}
      {showJobTitle && (
        <div>
          <Label htmlFor={jobTitleId}>Job title (optional)</Label>
          <select
            id={jobTitleId}
            className="h-10 w-full rounded-[var(--radius-md)] border border-input bg-transparent px-3 text-sm"
            value={a.jobTitle}
            onChange={(e) =>
              setA({
                ...a,
                jobTitle: e.target.value,
                jobTitleOther: e.target.value === JOB_TITLE_OTHER ? a.jobTitleOther : "",
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
      {showJobTitle && a.jobTitle === JOB_TITLE_OTHER && (
        <div>
          <Label htmlFor={jobTitleOtherId}>Job title</Label>
          <Input
            id={jobTitleOtherId}
            required
            aria-required="true"
            maxLength={JOB_TITLE_MAX}
            value={a.jobTitleOther}
            onChange={(e) => setA({ ...a, jobTitleOther: e.target.value })}
          />
        </div>
      )}
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="button" onClick={submit} disabled={busy}>
        {busy ? "Registering…" : "Register walk-in"}
      </Button>
    </div>
  );
}
