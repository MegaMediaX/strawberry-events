"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgePrintDialog } from "@/components/badges/badge-print-dialog";
import type { BadgeData } from "@/components/badges/badge-template";
import type { CheckInResult } from "@/lib/checkin/service";
import { buildBadgeZpl } from "@/lib/checkin/badge-zpl";
import { printZpl, PrintError, isPersistentPrintFailure } from "@/lib/checkin/print-client";
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
  // Mirrors confirmReprint for the window key handler, which is bound once.
  const confirmReprintRef = useRef<typeof confirmReprint>(null);
  const confirmBoxRef = useRef<HTMLDivElement>(null);
  // Where focus came from, so closing the dialog returns it.
  const returnFocusRef = useRef<HTMLElement | null>(null);

  /* ---------------------------------------------------------------- printing */

  /**
   * Print, and report what ACTUALLY happened.
   *
   * Returns the failure message, or null on success. The caller must reflect
   * this in the banner: a green "Checked in" while no badge emerged is the
   * worst outcome here — the attendee walks away badgeless believing they are
   * done, and nobody notices until they are refused entry to a session.
   */
  const thermalPrint = useCallback(async (b: BadgeData): Promise<string | null> => {
    if (qzUnreachable.current) {
      setBrowserFallback(true);
      return "Printer unavailable — use the on-screen print below.";
    }
    try {
      await printZpl(buildBadgeZpl(b));
      return null;
    } catch (err) {
      // Only a persistent failure stops us dialling. A rejected label is
      // per-badge: latching on it would downgrade every remaining attendee in
      // the queue after a single jam.
      if (isPersistentPrintFailure(err)) qzUnreachable.current = true;
      setBrowserFallback(true);
      return err instanceof PrintError ? err.message : "Printing failed.";
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
        const who = res.badge.fullName;
        setBadge(b);
        setBrowserFallback(false);
        setConfirmReprint(null);
        setResult({ kind: "working" });
        remember(res.badge.orderCode, who, kind);
        // Clear the search so the next person starts from an empty field rather
        // than the previous attendee's results.
        setQ("");
        setRows([]);
        searchRef.current?.focus();

        // AWAITED. The banner must not go green until a badge has actually
        // come out — the check-in itself already succeeded either way, so this
        // never blocks entry, it only tells the truth about the badge.
        void thermalPrint(b).then((printError) => {
          setResult(
            printError
              ? { kind: "warn", name: who, detail: `Checked in, but NOT printed — ${printError}` }
              : {
                  kind: "ok",
                  name: who,
                  detail:
                    kind === "reprint"
                      ? "Replacement badge printed — not checked in again"
                      : "Badge printed",
                },
          );
        });
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
        name: "Not checked in",
        // The reason belongs in the detail line. The 26px headline is a name in
        // every other state; putting a system message there made the one state
        // staff most need to parse read differently from all the others.
        detail: res.reason ?? "Check-in failed — try search, or use the help desk",
      });
    },
    [remember, thermalPrint],
  );

  /* ----------------------------------------------------------------- actions */

  const doCheckIn = useCallback(
    (orderCode: string) => {
      // Same guard as doScan. A double-tap on a touchscreen fires twice before
      // React commits `disabled`, and the LAST response to resolve wins the
      // shared result state — which may not be the one the operator just asked
      // for.
      if (pending) return;
      setResult({ kind: "working" });
      start(async () => handleResult(await checkInAction(eventId, orderCode, listId), "in"));
    },
    [eventId, listId, pending, handleResult],
  );

  const doReprint = useCallback(
    (orderCode: string) => {
      // Reprint needs this MORE than check-in does: pretix makes a duplicate
      // check-in idempotent, but reprintBadge has no such protection — a second
      // call prints a second physical badge, which is the exact fraud vector
      // the confirm dialog exists to prevent.
      if (pending) return;
      setResult({ kind: "working" });
      start(async () => handleResult(await reprintAction(eventId, orderCode), "reprint"));
    },
    [eventId, pending, handleResult],
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
      try {
        const found = await searchAction(eventId, query);
        // A slow response for an older query must not overwrite a newer one.
        if (!cancelled) setRows(found);
      } finally {
        // finally, not the happy path: without this any transient failure
        // leaves "Searching…" on screen forever, with no error and no recovery.
        if (!cancelled) setSearching(false);
      }
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(id);
    };
  }, [q, eventId]);

  /* ------------------------------------------- confirm dialog focus */

  useEffect(() => {
    confirmReprintRef.current = confirmReprint;

    if (confirmReprint) {
      // Remember where we came from, then move focus INTO the dialog.
      // Without this the dialog renders before the search results in DOM order,
      // so a keyboard user tabbing forward from the row they just activated
      // never reaches its buttons — the confirmation becomes invisible to them
      // and the anti-fraud step is silently skipped.
      returnFocusRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      confirmBoxRef.current?.focus();
    } else if (returnFocusRef.current) {
      returnFocusRef.current.focus();
      returnFocusRef.current = null;
    }
  }, [confirmReprint]);

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
        // The reprint confirm owns Escape while it is open. Otherwise a stray
        // Escape — someone starting to retype a search — silently dismisses a
        // decision they had not made yet.
        if (confirmReprintRef.current) {
          setConfirmReprint(null);
          return;
        }
        setQ("");
        setRows([]);
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
        <PrinterStatus
          onRecovered={() => {
            // The pill going green must actually re-arm thermal printing,
            // otherwise it reports a recovery that has not happened.
            qzUnreachable.current = false;
            setBrowserFallback(false);
          }}
        />
        <button
          type="button"
          onClick={() => setShowSettings((v) => !v)}
          aria-expanded={showSettings}
          aria-controls="printer-settings"
          className="min-h-11 text-[13px] font-semibold text-muted-foreground underline-offset-4 hover:underline"
        >
          {showSettings ? "Hide printer settings" : "Printer settings"}
        </button>
      </div>

      <div id="printer-settings">{showSettings && <PrinterSettings />}</div>

      <ResultBanner result={result} />

      {confirmReprint && (
        <div
          ref={confirmBoxRef}
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="reprint-title"
          aria-describedby="reprint-body"
          tabIndex={-1}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.stopPropagation();
              setConfirmReprint(null);
            }
          }}
          className="rounded-xl border border-amber-500/45 bg-amber-500/10 p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <p id="reprint-title" className="text-[15px] font-semibold text-foreground">
            Print another badge for {confirmReprint.fullName}?
          </p>
          <p id="reprint-body" className="mt-1 text-[14px] text-muted-foreground">
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
                {/* Confirms, like every other reprint path. A bare tap here
                    printed a second physical badge with no confirmation and no
                    undo — which is exactly the "handed to a friend at the door"
                    risk the already-checked-in prompt exists to prevent. */}
                <button
                  type="button"
                  onClick={() => setConfirmReprint({ orderCode: r.orderCode, fullName: r.name })}
                  disabled={busy}
                  className="min-h-11 shrink-0 rounded-md border border-border px-4 text-[13px] font-semibold hover:bg-accent disabled:opacity-50"
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
