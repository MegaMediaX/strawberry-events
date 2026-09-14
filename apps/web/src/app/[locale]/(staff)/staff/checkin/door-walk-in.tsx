"use client";

import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  AttendeeFields,
  EMPTY_WALK_IN_ATTENDEE,
  resolveWalkInAttendee,
  type WalkInAttendee,
} from "@/components/staff/attendee-fields";
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
 *
 * NOT the same rule as `splitName` in lib/registration/names.ts, and not to be
 * merged with it. That one serves roster imports: it strips honorifics and
 * repeats a single token into the family name, because pretix rejects an empty
 * one and a roster row has nobody to ask. Here a single token leaves the
 * surname EMPTY on purpose — the person is standing in front of the operator,
 * and the form asking for their surname is the right outcome.
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
 * The attendee fields themselves live in `components/staff/attendee-fields`,
 * shared with the walk-in desk: the two forms register the same person into
 * the same system and had drifted apart on how a job title and a badge role
 * are resolved. What is still here is what the DOOR does differently — it
 * prefills from the search box, registers and checks in and prints in one go,
 * and hands Escape back to the panel.
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
  const ticketId = `${uid}-ticket`;

  const [attendee, setAttendee] = useState<WalkInAttendee>(() => ({
    ...EMPTY_WALK_IN_ATTENDEE,
    ...splitName(prefill),
  }));
  const [itemId, setItemId] = useState<number | "">(tickets[0]?.id ?? "");
  const [err, setErr] = useState<string | null>(null);

  const firstRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    firstRef.current?.focus();
    firstRef.current?.select();
  }, []);

  // Not while a submit is in flight. Escape only removes the form from the
  // screen; it cannot recall the request, which finishes in the background and
  // may already have created the order. An operator who reads a vanished form
  // as "cancelled" registers the same person again.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel, busy]);

  function submit() {
    // Guard the handler itself, not just the disabled attribute: a double-tap
    // fires twice before React commits `disabled`, and this one creates a real
    // pretix order.
    if (busy) return;
    setErr(null);
    if (itemId === "") return setErr("Choose a ticket type.");
    // The server re-checks all of this, but an operator should see the message
    // here rather than after a round trip with someone waiting.
    const resolved = resolveWalkInAttendee(attendee);
    if (!resolved.ok) return setErr(resolved.error);
    const a = resolved.value;
    onSubmit({
      firstName: a.firstName,
      lastName: a.lastName,
      email: a.email || undefined,
      phoneCC: a.phoneCC || undefined,
      phone: a.phone || undefined,
      company: a.company,
      jobTitle: a.jobTitle,
      roleTag: a.roleTag,
      roleLabel: a.roleLabel,
      itemId: Number(itemId),
    });
  }

  return (
    <div className="mt-3 rounded-xl border border-border bg-card p-4">
      <p className="text-[15px] font-semibold">Register &amp; check in</p>
      <p className="mt-1 text-[13px] text-muted-foreground">
        Registers, admits and prints a badge in one go.
      </p>

      <div className="mt-4 flex flex-col gap-3">
        <AttendeeFields
          value={attendee}
          onChange={setAttendee}
          size="door"
          firstFieldRef={firstRef}
          onEnterSubmit={submit}
        />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor={ticketId}>Ticket</Label>
          <select
            id={ticketId}
            className="h-12 w-full rounded-lg border border-input bg-transparent px-3 text-[16px]"
            value={itemId}
            onChange={(e) => setItemId(e.target.value === "" ? "" : Number(e.target.value))}
          >
            {tickets.length === 0 && <option value="">— none available —</option>}
            {tickets.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title}
              </option>
            ))}
          </select>
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
