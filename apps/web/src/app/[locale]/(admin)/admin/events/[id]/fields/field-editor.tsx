"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { defineFieldAction } from "./actions";

const TYPES = ["text", "textarea", "email", "phone", "select", "multiselect", "checkbox", "date"];

export function FieldEditor({
  eventId,
  tickets,
}: {
  eventId: string;
  tickets: { id: number; title: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [f, setF] = useState({
    labelEn: "", labelAr: "", type: "text", required: false,
    ticketId: "", placeholderEn: "", options: "",
  });

  const sel = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  async function save() {
    setErr(null);
    if (!f.labelEn.trim()) return setErr("Label (EN) is required.");
    setBusy(true);
    const res = await defineFieldAction({
      eventMappingId: eventId,
      labelEn: f.labelEn,
      labelAr: f.labelAr || null,
      placeholderEn: f.placeholderEn || null,
      type: f.type,
      required: f.required,
      ticketId: f.ticketId || null,
      options: f.options.trim()
        ? f.options.split(",").map((s) => s.trim()).filter(Boolean)
        : undefined,
    });
    setBusy(false);
    if (!res.ok) return setErr(res.error ?? "Failed");
    setF({ labelEn: "", labelAr: "", type: "text", required: false, ticketId: "", placeholderEn: "", options: "" });
    router.refresh();
  }

  const needsOptions = f.type === "select" || f.type === "multiselect";

  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border p-4">
      <div className="font-medium">Add a field</div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <Label>Label (EN)</Label>
          <Input value={f.labelEn} onChange={(e) => setF({ ...f, labelEn: e.target.value })} />
        </div>
        <div>
          <Label>Label (ع)</Label>
          <Input value={f.labelAr} onChange={(e) => setF({ ...f, labelAr: e.target.value })} />
        </div>
        <div>
          <Label>Type</Label>
          <select className={sel} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
        <div>
          <Label>Applies to ticket</Label>
          <select className={sel} value={f.ticketId} onChange={(e) => setF({ ...f, ticketId: e.target.value })}>
            <option value="">All tickets</option>
            {tickets.map((t) => <option key={t.id} value={String(t.id)}>{t.title}</option>)}
          </select>
        </div>
        <div>
          <Label>Placeholder (EN)</Label>
          <Input value={f.placeholderEn} onChange={(e) => setF({ ...f, placeholderEn: e.target.value })} />
        </div>
        {needsOptions && (
          <div>
            <Label>Options (comma-separated)</Label>
            <Input value={f.options} onChange={(e) => setF({ ...f, options: e.target.value })} />
          </div>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.required} onChange={(e) => setF({ ...f, required: e.target.checked })} />
        Required
      </label>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div>
        <Button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Add field"}</Button>
      </div>
    </div>
  );
}
