"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { centsToPrice } from "@/lib/pretix/mappers";
import {
  AttendeeFields,
  EMPTY_WALK_IN_ATTENDEE,
  resolveWalkInAttendee,
  type WalkInAttendee,
} from "@/components/staff/attendee-fields";
import { walkInAction, type WalkInActionResult } from "./actions";

interface WalkInTicket {
  id: number;
  title: string;
  priceCents: number;
}

/**
 * The walk-in desk: register someone away from the door, without checking them
 * in.
 *
 * The attendee fields are shared with the door's inline form (see
 * components/staff/attendee-fields) — the two had drifted on how a job title
 * and a badge role resolve, and almost every field here was a bare <Label>
 * with no htmlFor, announced unlabelled. What remains here is what the DESK
 * does differently: it shows prices on the ticket picker, it does not check
 * anyone in, and it reports the order state afterwards, because a desk
 * registration can land in pending-approval or pending-payment.
 */
export function WalkInForm({
  locale,
  eventId,
  tickets,
}: {
  locale: string;
  eventId: string;
  tickets: WalkInTicket[];
}) {
  const uid = useId();
  const ticketId = `${uid}-ticket`;

  const [itemId, setItemId] = useState<number | "">(tickets[0]?.id ?? "");
  const [attendee, setAttendee] = useState<WalkInAttendee>(EMPTY_WALK_IN_ATTENDEE);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WalkInActionResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setResult(null);
    if (itemId === "") return setErr("Select a ticket type.");
    // Resolved before the request so a sentinel — "Other" with nothing typed —
    // is caught at the desk rather than swallowed into a badge reading OTHER.
    const resolved = resolveWalkInAttendee(attendee);
    if (!resolved.ok) return setErr(resolved.error);
    const a = resolved.value;

    setBusy(true);
    const res = await walkInAction(eventId, {
      itemId: Number(itemId),
      roleTag: a.roleTag,
      roleLabel: a.roleLabel,
      locale: locale === "ar" ? "ar" : "en",
      attendee: {
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        phoneCC: a.phoneCC,
        phone: a.phone,
        company: a.company,
        jobTitle: a.jobTitle,
      },
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "Registration failed.");
    setResult(res);
    // Named constant, so the initial state and this reset cannot drift: a field
    // present in one and missing from the other is this feature's recurring
    // bug — the desk carrying one walk-in's job title to the next person.
    setAttendee(EMPTY_WALK_IN_ATTENDEE);
  }

  if (result?.ok) {
    const issued = result.status === "paid" && result.approvalStatus === "not_required";
    return (
      <div className="rounded-[var(--radius-lg)] border border-border p-4" role="status">
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
      <div className="flex flex-col gap-1.5">
        <Label htmlFor={ticketId}>Ticket type</Label>
        <select
          id={ticketId}
          className="h-10 w-full rounded-[var(--radius-md)] border border-input bg-transparent px-3 text-sm"
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

      <AttendeeFields value={attendee} onChange={setAttendee} />

      {err && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {err}
        </p>
      )}
      <div>
        <Button type="button" onClick={submit} disabled={busy}>
          {busy ? "Registering…" : "Register walk-in"}
        </Button>
      </div>
    </div>
  );
}
