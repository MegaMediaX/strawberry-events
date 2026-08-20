"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgePrintDialog } from "@/components/badges/badge-print-dialog";
import type { BadgeData } from "@/components/badges/badge-template";
import type { CheckInResult } from "@/lib/checkin/service";
import { buildBadgeZpl } from "@/lib/checkin/badge-zpl";
import { printZpl, PrintError } from "@/lib/checkin/print-client";
import { QrScanner } from "./qr-scanner";
import { PrinterSettings } from "./printer-settings";
import { PrinterStatus } from "./printer-status";
import { ResultBanner, type DoorResult } from "./result-banner";
import {
  searchAction,
  checkInAction,
  scanAction,
  reprintAction,
  type AttendeeRow,
} from "./actions";

/** Typing settles before we query. Long enough to avoid a request per keystroke,
 *  short enough that results feel immediate to someone mid-conversation. */
const SEARCH_DEBOUNCE_MS = 220;

/** Enough history to recover a misprint without searching again; short enough
 *  to stay glanceable. */
const RECENT_LIMIT = 6;

/** How long a success stays on screen before the door resets itself. Failures
 *  and warnings never auto-clear — those need a human decision. */
const OK_BANNER_MS = 4000;

type RecentEntry = {
  id: number;
  orderCode: string;
  name: string;
  kind: "in" | "reprint";
  at: string;
};

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
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<AttendeeRow[]>([]);
  const [searching, setSearching] = useState(false);
  const [pending, start] = useTransition();
  const [result, setResult] = useState<DoorResult | null>(null);
  const [badge, setBadge] = useState<BadgeData | null>(null);
  const [browserFallback, setBrowserFallback] = useState(false);
  const [recent, setRecent] = useState<RecentEntry[]>([]);
  const [confirmReprint, setConfirmReprint] = useState<
    { orderCode: string; fullName: string } | null
  >(null);
  const [showSettings, setShowSettings] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  // Once QZ Tray has proved unreachable, stop dialling it. qz-tray probes
  // several ports and protocols before giving up, seconds each; retrying that
  // per attendee puts the delay in front of every person in the queue.
  const qzUnreachable = useRef(false);
  const recentId = useRef(0);

  /* ---------------------------------------------------------------- printing */

  const thermalPrint = useCallback(async (b: BadgeData) => {
    if (qzUnreachable.current) {
      setBrowserFallback(true);
      return;
    }
    try {
      await printZpl(buildBadgeZpl(b));
    } catch (err) {
      if (err instanceof PrintError) qzUnreachable.current = true;
      setBrowserFallback(true);
    }
  }, []);

  const remember = useCallback((orderCode: string, name: string, kind: RecentEntry["kind"]) => {
    recentId.current += 1;
    const entry: RecentEntry = {
      id: recentId.current,
      orderCode,
      name,
      kind,
      at: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    };
    setRecent((prev) => [entry, ...prev].slice(0, RECENT_LIMIT));
  }, []);

  /* ----------------------------------------------------------------- results */

  const handleResult = useCallback(
    (res: CheckInResult, kind: RecentEntry["kind"]) => {
      if (res.ok && res.badge) {
        const b = toBadge(res.badge);
        setBadge(b);
        setBrowserFallback(false);
        setConfirmReprint(null);
        setResult({
          kind: "ok",
          name: res.badge.fullName,
          detail: kind === "reprint" ? "Badge reprinted — not checked in again" : "Badge printing…",
        });
        remember(res.badge.orderCode, res.badge.fullName, kind);
        void thermalPrint(b);
        // Clear the search so the next person starts from an empty field rather
        // than the previous attendee's results.
        setQ("");
        setRows([]);
        searchRef.current?.focus();
        return;
      }

      setBadge(null);

      // Already checked in for this day. Usually a lost or torn badge, so offer
      // a reprint — but never print automatically: a second badge for someone
      // already inside is how a ticket gets handed to a friend at the door.
      if (res.alreadyCheckedIn) {
        setConfirmReprint(res.alreadyCheckedIn);
        setResult({
          kind: "warn",
          name: res.alreadyCheckedIn.fullName,
          detail: "Already checked in for this day",
        });
        return;
      }

      setConfirmReprint(null);
      setResult({
        kind: "err",
        name: res.reason ?? "Check-in failed",
        detail: "Not checked in — try search, or send them to the help desk",
      });
    },
    [remember, thermalPrint],
  );

  /* ----------------------------------------------------------------- actions */

  const doCheckIn = useCallback(
    (orderCode: string) => {
      setResult({ kind: "working" });
      start(async () => handleResult(await checkInAction(eventId, orderCode, listId), "in"));
    },
    [eventId, listId, handleResult],
  );

  const doReprint = useCallback(
    (orderCode: string) => {
      setResult({ kind: "working" });
      start(async () => handleResult(await reprintAction(eventId, orderCode), "reprint"));
    },
    [eventId, handleResult],
  );

  const doScan = useCallback(
    (text: string) => {
      if (pending) return;
      setResult({ kind: "working" });
      start(async () => handleResult(await scanAction(eventId, text, listId), "in"));
    },
    [eventId, listId, pending, handleResult],
  );

  /* --------------------------------------------------- search as you type */

  useEffect(() => {
    const query = q.trim();
    let cancelled = false;

    // Every setState is inside the timeout, never synchronous in the effect
    // body — a synchronous one cascades renders on every keystroke.
    const id = setTimeout(async () => {
      if (!query) {
        setRows([]);
        setSearching(false);
        return;
      }
      setSearching(true);
      const found = await searchAction(eventId, query);
      // A slow response for an older query must not overwrite a newer one.
      if (cancelled) return;
      setRows(found);
      setSearching(false);
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [q, eventId]);

  /* --------------------------------------------------- success auto-clear */

  useEffect(() => {
    if (result?.kind !== "ok") return;
    const id = setTimeout(() => setResult(null), OK_BANNER_MS);
    return () => clearTimeout(id);
  }, [result]);

  /* ------------------------------------------------------------- keyboard */

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const typing =
        e.target instanceof HTMLElement &&
        (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA");

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        setQ("");
        setRows([]);
        setConfirmReprint(null);
        setResult(null);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ----------------------------------------------------------------- render */

  const busy = pending;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <PrinterStatus />
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          className="min-h-9 text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          {showSettings ? "Hide printer settings" : "Printer settings"}
        </button>
      </div>

      {showSettings && <PrinterSettings />}

      <ResultBanner result={result} />

      {confirmReprint && (
        <div
          role="alertdialog"
          aria-labelledby="reprint-title"
          className="rounded-xl border border-amber-500/45 bg-amber-500/10 p-4"
        >
          <p id="reprint-title" className="text-[15px] font-semibold text-foreground">
            Print another badge for {confirmReprint.fullName}?
          </p>
          <p className="mt-1 text-[14px] text-muted-foreground">
            They are already checked in. This prints a replacement badge and records a
            reprint — it does not check them in again.
          </p>
          <div className="mt-3 flex gap-2">
            <Button
              disabled={busy}
              onClick={() => {
                const { orderCode } = confirmReprint;
                setConfirmReprint(null);
                doReprint(orderCode);
              }}
            >
              Print replacement
            </Button>
            <Button variant="outline" disabled={busy} onClick={() => setConfirmReprint(null)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        {/* Scanner is always live — no mode to choose, nothing to switch back to
            after a search. Most arrivals are a scan. */}
        <section aria-label="Scan" className="rounded-xl border border-border p-3">
          <h2 className="mb-2 text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Scan badge or ticket
          </h2>
          <QrScanner onScan={doScan} />
        </section>

        <section aria-label="Search" className="rounded-xl border border-border p-3">
          <h2 className="mb-2 text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Or find by name
          </h2>
          <Input
            ref={searchRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, email, phone or order code  ( / to focus )"
            aria-label="Search attendees"
            className="h-12 text-[16px]"
          />

          <div className="mt-3">
            {q.trim() && searching && (
              <p className="text-[14px] text-muted-foreground">Searching…</p>
            )}
            {q.trim() && !searching && rows.length === 0 && (
              <p className="text-[14px] text-muted-foreground">
                No one matches “{q.trim()}”. Check the spelling, or try their order code.
              </p>
            )}

            <ul className="flex flex-col gap-2">
              {rows.map((r) => (
                <li
                  key={r.orderCode}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border p-3"
                >
                  <div className="min-w-0">
                    <div className="truncate text-[17px] font-semibold">{r.name ?? r.email}</div>
                    <div className="truncate text-[13px] text-muted-foreground">
                      {r.orderCode}
                      {r.phone ? ` · ${r.phone}` : ""}
                    </div>
                  </div>
                  {/* One obvious action. Reprint is deliberately NOT beside it —
                      two similar buttons next to each other is how the wrong one
                      gets pressed at a busy door. Reprints happen from Recent, or
                      via the already-checked-in prompt. */}
                  <Button
                    className="min-h-12 px-5 text-[15px]"
                    onClick={() => doCheckIn(r.orderCode)}
                    disabled={busy}
                  >
                    Check in &amp; print
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        </section>
      </div>

      {recent.length > 0 && (
        <section aria-label="Recent" className="rounded-xl border border-border p-3">
          <h2 className="mb-2 text-[13px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Just now
          </h2>
          <ul className="flex flex-col gap-1.5">
            {recent.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 text-[14px]">
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground tabular-nums">{r.at}</span>{" "}
                  <span className="font-medium">{r.name}</span>{" "}
                  <span className="text-muted-foreground">
                    {r.kind === "reprint" ? "· reprint" : ""}
                  </span>
                </span>
                {/* The lost-badge path: no searching again for someone who was
                    standing here thirty seconds ago. */}
                <button
                  type="button"
                  onClick={() => doReprint(r.orderCode)}
                  disabled={busy}
                  className="min-h-9 shrink-0 rounded-md border border-border px-3 text-[13px] font-semibold hover:bg-accent disabled:opacity-50"
                >
                  Reprint
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {badge && browserFallback && (
        <div className="rounded-xl border border-amber-500/45 bg-amber-500/10 p-4">
          <p className="text-[15px] font-semibold">Thermal printer unavailable</p>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Use the browser print dialog below, then fix the printer when the queue allows.
          </p>
          <div className="mt-3">
            <BadgePrintDialog badge={badge} auto />
          </div>
          <button
            type="button"
            onClick={() => {
              qzUnreachable.current = false;
              setBrowserFallback(false);
            }}
            className="mt-3 min-h-10 text-[13px] font-semibold text-primary underline-offset-4 hover:underline"
          >
            Printer fixed — use thermal again
          </button>
        </div>
      )}
    </div>
  );
}
