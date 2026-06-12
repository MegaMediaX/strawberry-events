"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgePrintDialog } from "@/components/badges/badge-print-dialog";
import type { BadgeData } from "@/components/badges/badge-template";
import type { CheckInResult } from "@/lib/checkin/service";
import { buildBadgeZpl } from "@/lib/checkin/badge-zpl";
import { printZpl, PrintError } from "@/lib/checkin/print-client";
import { QrScanner } from "./qr-scanner";
import {
  searchAction,
  checkInAction,
  scanAction,
  reprintAction,
  type AttendeeRow,
} from "./actions";

type Status = { kind: "ok" | "warn" | "err"; text: string } | null;

function toBadge(b: NonNullable<CheckInResult["badge"]>): BadgeData {
  return {
    tag: b.tag,
    fullName: b.fullName,
    company: b.company,
    qrValue: b.secret ?? b.orderCode,
  };
}

export function CheckinPanel({
  eventId,
  listId,
}: {
  eventId: string;
  listId: number;
}) {
  const [mode, setMode] = useState<"search" | "scan">("search");
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [pending, start] = useTransition();
  const [status, setStatus] = useState<Status>(null);
  const [badge, setBadge] = useState<BadgeData | null>(null);
  // When thermal printing fails, fall back to the on-screen browser print.
  const [browserFallback, setBrowserFallback] = useState(false);

  /** Build ZPL and print to the PC42d via QZ Tray; on failure, flag browser fallback. */
  async function thermalPrint(b: BadgeData): Promise<void> {
    try {
      await printZpl(buildBadgeZpl(b));
    } catch (err) {
      setBrowserFallback(true);
      const msg = err instanceof PrintError ? err.message : "Printing failed.";
      setStatus({ kind: "warn", text: `${msg} Use the on-screen print as a fallback.` });
    }
  }

  function handleResult(res: CheckInResult, doneVerb: string) {
    if (res.ok && res.badge) {
      const b = toBadge(res.badge);
      setBadge(b);
      setBrowserFallback(false);
      setStatus({ kind: "ok", text: `${doneVerb} ${res.badge.fullName}.` });
      void thermalPrint(b);
    } else {
      setBadge(null);
      setStatus({ kind: res.reason?.match(/already/i) ? "warn" : "err", text: res.reason ?? "Failed" });
    }
  }

  function doSearch() {
    setStatus(null);
    start(async () => setRows(await searchAction(eventId, q)));
  }

  function doCheckIn(orderCode: string) {
    start(async () => handleResult(await checkInAction(eventId, orderCode, listId), "Checked in"));
  }

  function doReprint(orderCode: string) {
    start(async () => handleResult(await reprintAction(eventId, orderCode), "Reprinted badge for"));
  }

  function doScan(text: string) {
    if (pending) return;
    start(async () => handleResult(await scanAction(eventId, text, listId), "Checked in"));
  }

  const statusColor =
    status?.kind === "ok"
      ? "text-green-600"
      : status?.kind === "warn"
        ? "text-amber-600"
        : "text-destructive";

  return (
    <div className="max-w-xl">
      <div className="mb-4 flex gap-2">
        <Button variant={mode === "search" ? "default" : "outline"} size="sm" onClick={() => setMode("search")}>
          Search
        </Button>
        <Button variant={mode === "scan" ? "default" : "outline"} size="sm" onClick={() => setMode("scan")}>
          Scan QR
        </Button>
      </div>

      {mode === "search" ? (
        <div className="flex gap-2">
          <Input
            placeholder="Search name / email / phone / order code"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && doSearch()}
          />
          <Button onClick={doSearch} disabled={pending}>Search</Button>
        </div>
      ) : (
        <QrScanner onScan={doScan} />
      )}

      {status && <p className={`mt-3 text-sm ${statusColor}`}>{status.text}</p>}

      {mode === "search" && (
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
              <div className="flex gap-2">
                <Button size="sm" onClick={() => doCheckIn(r.orderCode)} disabled={pending}>
                  Check in &amp; print
                </Button>
                <Button size="sm" variant="outline" onClick={() => doReprint(r.orderCode)} disabled={pending}>
                  Reprint
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {badge && browserFallback && (
        <div className="mt-6">
          <BadgePrintDialog badge={badge} auto />
        </div>
      )}
    </div>
  );
}
