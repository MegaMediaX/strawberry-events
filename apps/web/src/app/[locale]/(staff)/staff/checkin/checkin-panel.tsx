"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgePrintDialog } from "@/components/badges/badge-print-dialog";
import type { BadgeData } from "@/components/badges/badge-template";
import { searchAction, checkInAction, type AttendeeRow } from "./actions";

export function CheckinPanel({
  eventId,
  listId,
}: {
  eventId: string;
  listId: number;
}) {
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [badge, setBadge] = useState<BadgeData | null>(null);

  function doSearch() {
    setMsg(null);
    start(async () => setRows(await searchAction(eventId, q)));
  }

  function doCheckIn(orderCode: string) {
    setMsg(null);
    setBadge(null);
    start(async () => {
      const res = await checkInAction(eventId, orderCode, listId);
      if (res.ok && res.badge) {
        setBadge({
          tag: res.badge.tag,
          fullName: res.badge.fullName,
          company: res.badge.company,
          qrValue: res.badge.secret ?? res.badge.orderCode,
        });
        setMsg(`Checked in ${res.badge.fullName}.`);
      } else {
        setMsg(res.reason ?? "Check-in failed");
      }
    });
  }

  return (
    <div className="max-w-xl">
      <div className="flex gap-2">
        <Input
          placeholder="Search name / email / phone / order code"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && doSearch()}
        />
        <Button onClick={doSearch} disabled={pending}>Search</Button>
      </div>

      {msg && <p className="mt-3 text-sm">{msg}</p>}

      <ul className="mt-4 flex flex-col gap-2">
        {rows.map((r) => (
          <li
            key={r.orderCode}
            className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border p-3"
          >
            <div>
              <div className="font-medium">{r.name ?? r.email}</div>
              <div className="text-sm text-muted-foreground">
                {r.orderCode}
                {r.phone ? ` · ${r.phone}` : ""}
              </div>
            </div>
            <Button size="sm" onClick={() => doCheckIn(r.orderCode)} disabled={pending}>
              Check in
            </Button>
          </li>
        ))}
      </ul>

      {badge && (
        <div className="mt-6">
          <BadgePrintDialog badge={badge} auto />
        </div>
      )}
    </div>
  );
}
