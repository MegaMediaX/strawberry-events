"use client";

import { useRef, useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgePrintDialog } from "@/components/badges/badge-print-dialog";
import type { BadgeData } from "@/components/badges/badge-template";
import type { CheckInResult } from "@/lib/checkin/service";
import { buildBadgeZpl } from "@/lib/checkin/badge-zpl";
import { printZpl, PrintError } from "@/lib/checkin/print-client";
import { QrScanner } from "./qr-scanner";
import { PrinterSettings } from "./printer-settings";
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
    badgeSlug: b.badgeSlug,
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
  // Once QZ Tray has proved unreachable, stop dialling it.
  //
  // A ref, not state: this must not trigger a re-render, and it must be read
  // synchronously by the very next check-in. qz-tray probes several ports and
  // protocols before giving up, several seconds each. Retrying that per
  // attendee adds it to EVERY check-in in the queue — with badges printed on
  // site there is no pre-printed stack to fall back on, so that delay lands on
  // all 812 people rather than being absorbed once.
  const qzUnreachable = useRef(false);

  // Who pretix refused as already redeemed, pending the operator's decision.
  // Held separately from `status` so the confirm cannot be dismissed by the
  // next status message landing on top of it.
  const [confirmReprint, setConfirmReprint] = useState<
    { orderCode: string; fullName: string } | null
  >(null);

  /** Build ZPL and print to the PC42d via QZ Tray; on failure, flag browser fallback. */
  async function thermalPrint(b: BadgeData): Promise<void> {
    if (qzUnreachable.current) {
      setBrowserFallback(true);
      setStatus({ kind: "warn", text: "Printer service unavailable — use the on-screen print." });
      return;
    }
    try {
      await printZpl(buildBadgeZpl(b));
    } catch (err) {
      // Only a transport failure means "stop trying". A rejected job is
      // per-badge and the next attendee may well print fine.
      if (err instanceof PrintError) qzUnreachable.current = true;
      setBrowserFallback(true);
      const msg = err instanceof PrintError ? err.message : "Printing failed.";
      setStatus({ kind: "warn", text: `${msg} Use the on-screen print as a fallback.` });
    }
  }

  /** Let staff re-arm thermal printing after fixing QZ Tray, without a reload. */
  function retryThermal(): void {
    qzUnreachable.current = false;
    setBrowserFallback(false);
    setStatus({ kind: "ok", text: "Printer re-armed — next check-in will try the thermal printer." });
  }

  function handleResult(res: CheckInResult, doneVerb: string) {
    if (res.ok && res.badge) {
      const b = toBadge(res.badge);
      setBadge(b);
      setBrowserFallback(false);
      setConfirmReprint(null);
      setStatus({ kind: "ok", text: `${doneVerb} ${res.badge.fullName}.` });
      void thermalPrint(b);
      return;
    }

    setBadge(null);

    // Already checked in for this day. Usually a lost, torn or misplaced badge,
    // so offer a reprint — but never print automatically: a second badge for
    // someone already inside is exactly how a ticket gets passed to a friend.
    if (res.alreadyCheckedIn) {
      setConfirmReprint(res.alreadyCheckedIn);
      setStatus({
        kind: "warn",
        text: `${res.alreadyCheckedIn.fullName} is already checked in for this day.`,
      });
      return;
    }

    setConfirmReprint(null);
    setStatus({ kind: res.reason?.match(/already/i) ? "warn" : "err", text: res.reason ?? "Failed" });
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
      <PrinterSettings />

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

      {confirmReprint && (
        <div
          role="alertdialog"
          aria-labelledby="reprint-title"
          className="mt-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4"
        >
          <p id="reprint-title" className="text-sm font-semibold text-foreground">
            {confirmReprint.fullName} is already checked in.
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Print their badge again? This does not check them in a second time — it
            records a reprint.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              disabled={pending}
              onClick={() => {
                const { orderCode } = confirmReprint;
                setConfirmReprint(null);
                doReprint(orderCode);
              }}
            >
              Print anyway
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={pending}
              onClick={() => setConfirmReprint(null)}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}

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
          <button
            type="button"
            onClick={retryThermal}
            className="mt-3 inline-flex min-h-10 items-center text-[13px] font-semibold tracking-[0.04em] text-primary uppercase underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            Printer fixed — try thermal again
          </button>
        </div>
      )}
    </div>
  );
}
