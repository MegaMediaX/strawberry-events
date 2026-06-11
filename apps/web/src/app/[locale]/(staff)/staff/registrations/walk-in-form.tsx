"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToPrice } from "@/lib/pretix/mappers";
import { walkInAction, type WalkInActionResult } from "./actions";

interface WalkInTicket {
  id: number;
  title: string;
  priceCents: number;
}

const ROLE_TAGS = ["visitor", "media", "partner", "speaker", "staff"] as const;

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
  const [roleTag, setRoleTag] = useState<(typeof ROLE_TAGS)[number]>("visitor");
  const [a, setA] = useState({ firstName: "", lastName: "", email: "", phoneCC: "+961", phone: "", company: "" });
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<WalkInActionResult | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    setErr(null);
    setResult(null);
    if (itemId === "") return setErr("Select a ticket type.");
    if (!a.firstName || !a.lastName || !a.email || !a.phone) {
      return setErr("First name, last name, email and phone are required.");
    }
    setBusy(true);
    const res = await walkInAction(eventId, {
      itemId: Number(itemId),
      roleTag,
      locale: locale === "ar" ? "ar" : "en",
      attendee: { ...a, company: a.company || null },
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "Registration failed.");
    setResult(res);
    setA({ firstName: "", lastName: "", email: "", phoneCC: "+961", phone: "", company: "" });
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
          onChange={(e) => setRoleTag(e.target.value as (typeof ROLE_TAGS)[number])}
        >
          {ROLE_TAGS.map((r) => (
            <option key={r} value={r}>{r}</option>
          ))}
        </select>
      </div>
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
        <Label>Email</Label>
        <Input type="email" value={a.email} onChange={(e) => setA({ ...a, email: e.target.value })} />
      </div>
      <div className="grid grid-cols-[100px_1fr] gap-3">
        <div>
          <Label>Code</Label>
          <Input value={a.phoneCC} onChange={(e) => setA({ ...a, phoneCC: e.target.value })} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={a.phone} onChange={(e) => setA({ ...a, phone: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Company (optional)</Label>
        <Input value={a.company} onChange={(e) => setA({ ...a, company: e.target.value })} />
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <Button type="button" onClick={submit} disabled={busy}>
        {busy ? "Registering…" : "Register walk-in"}
      </Button>
    </div>
  );
}
