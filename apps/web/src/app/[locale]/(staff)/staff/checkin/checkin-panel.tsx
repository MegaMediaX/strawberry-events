"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BadgePrintDialog } from "@/components/badges/badge-print-dialog";
import type { BadgeData } from "@/components/badges/badge-template";
import type { CheckInResult } from "@/lib/checkin/service";
import { createPrintOwnership } from "@/lib/checkin/print-ownership";
import { PrintError, isPersistentPrintFailure } from "@/lib/checkin/print-client";
import { printBadge } from "@/lib/checkin/print-badge";
import { QrScanner } from "./qr-scanner";
import { PrinterSettings } from "./printer-settings";
import { PrinterStatus } from "./printer-status";
import { ResultBanner, type DoorResult } from "./result-banner";
import { AttendeeEditDialog, type EditTarget } from "./attendee-edit";
import { DoorWalkInForm, type DoorTicket } from "./door-walk-in";
import {
  searchAction,
  checkInAction,
  scanAction,
  reprintAction,
  correctAttendeeAction,
  attendeeForEditAction,
  walkInAndCheckInAction,
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
    jobTitle: b.jobTitle,
    badgeSlug: b.badgeSlug,
  };
}

export function CheckinPanel({
  eventId,
  listId,
  tickets,
}: {
  eventId: string;
  listId: number;
  tickets: DoorTicket[];
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
  const [editing, setEditing] = useState<EditTarget | null>(null);
  // Three unrelated async operations, three flags. Sharing one meant a fast
  // lookup resolving could re-enable a slow submit that was still on the wire —
  // and the walk-in submit creates a real pretix order, so a second click
  // registered the same person twice.
  const [openingEdit, setOpeningEdit] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [submittingWalkIn, setSubmittingWalkIn] = useState(false);
  const [walkIn, setWalkIn] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  // Once QZ Tray has proved unreachable, stop dialling it. qz-tray probes
  // several ports and protocols before giving up, seconds each; retrying that
  // per attendee puts the delay in front of every person in the queue.
  const qzUnreachable = useRef(false);
  const recentId = useRef(0);
  // Which print currently owns the screen — see print-ownership.ts.
  const printOwner = useRef(createPrintOwnership());
  // Mirrors confirmReprint for the window key handler, which is bound once.
  const confirmReprintRef = useRef<typeof confirmReprint>(null);
  // Same reason as confirmReprintRef: the window key handler is bound once, so
  // it cannot see current state without a ref.
  const editingRef = useRef<EditTarget | null>(null);
  const walkInRef = useRef(false);
  // Read by openEdit's re-entrancy guard. A ref rather than the state value so
  // the callback keeps a stable identity.
  const openingEditRef = useRef(false);
  /** Where focus goes when the Fix or walk-in form closes. */
  const formReturnFocusRef = useRef<HTMLElement | null>(null);
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
    // Sets NO screen state. `pending` covers only the check-in call, so prints
    // for consecutive attendees overlap freely; a print that touched shared
    // state directly could paint attendee A's failure over attendee B's screen.
    // It reports, and the caller — which knows whose print this was — decides.
    if (qzUnreachable.current) {
      return "Printer unavailable — use the on-screen print below.";
    }
    try {
      await printBadge(b);
      return null;
    } catch (err) {
      // Only a persistent failure stops us dialling. A rejected label is
      // per-badge: latching on it would downgrade every remaining attendee in
      // the queue after a single jam.
      if (isPersistentPrintFailure(err)) qzUnreachable.current = true;
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

  /* -------------------------------------------------------------- corrections */

  const openEdit = useCallback(
    (orderCode: string) => {
      if (openingEditRef.current) return;
      openingEditRef.current = true;
      setEditing(null);
      setOpeningEdit(true);
      void attendeeForEditAction(eventId, orderCode).then((res) => {
        openingEditRef.current = false;
        setOpeningEdit(false);
        if (res.ok) setEditing(res.attendee);
        else setResult({ kind: "err", name: orderCode, detail: res.reason });
      });
    },
    [eventId],
  );

  /* ----------------------------------------------------------------- results */

  const handleResult = useCallback(
    (res: CheckInResult, kind: RecentEntry["kind"]) => {
      if (res.ok && res.badge) {
        const b = toBadge(res.badge);
        const who = res.badge.fullName;
        setBrowserFallback(false);
        setConfirmReprint(null);
        setResult({ kind: "working" });
        remember(res.badge.orderCode, who, kind);
        // Clear the search so the next person starts from an empty field rather
        // than the previous attendee's results.
        setQ("");
        setRows([]);
        searchRef.current?.focus();

        // The banner must not go green until a badge has actually come out. The
        // check-in itself already succeeded either way, so this never blocks
        // entry — it only stops the UI claiming a badge exists when it does not.
        const ticket = printOwner.current.claim();
        void thermalPrint(b).then((printError) => {
          // Superseded: the operator has already moved on to someone else, and
          // this screen is now theirs. Dropping the update is right — writing it
          // would show THIS attendee's outcome under the NEXT attendee's name.
          if (!printOwner.current.owns(ticket)) return;

          if (printError) {
            // Only now, and only if this print still owns the screen.
            setBadge(b);
            setBrowserFallback(true);
            setResult({
              kind: "warn",
              name: who,
              // NOT the default "Already in": this person was just admitted (or
              // just had a replacement attempted). The static label would tell
              // the operator they were already inside, which is false and
              // invites second-guessing a valid admission.
              label: "Not printed",
              detail:
                kind === "reprint"
                  ? `Badge NOT printed — ${printError}`
                  : `Checked in, but badge NOT printed — ${printError}`,
            });
            return;
          }

          setBadge(null);
          setBrowserFallback(false);
          setResult({
            kind: "ok",
            name: who,
            label: kind === "reprint" ? "Reprinted" : undefined,
            detail:
              kind === "reprint"
                ? "Replacement badge printed — not checked in again"
                : "Badge printed",
          });
        });
        return;
      }

      // `badge` is deliberately NOT cleared here. It exists only to feed the
      // browser-fallback panel, and it is written exclusively by the
      // ownership-gated print handler below. Clearing it on an unrelated
      // outcome — a failed scan, or the very common "already checked in" —
      // removed the recovery UI for an EARLIER attendee whose print was still
      // in flight, leaving them told about a failure they could no longer act
      // on.

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

  /* ------------------------------------------ inline form focus + refs */

  useEffect(() => {
    editingRef.current = editing;
    walkInRef.current = walkIn;

    const open = Boolean(editing) || walkIn;
    if (open) {
      // Where to send focus back to when the form closes. Both forms move focus
      // into themselves on open; without this, closing dropped it on <body> and
      // the next Tab restarted from the top of the page — dozens of times a day
      // over three days.
      if (!formReturnFocusRef.current) {
        formReturnFocusRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
    } else if (formReturnFocusRef.current) {
      formReturnFocusRef.current.focus();
      formReturnFocusRef.current = null;
    }
  }, [editing, walkIn]);

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
        (e.target.tagName === "INPUT" ||
        e.target.tagName === "TEXTAREA" ||
        // Both new forms use native selects for role, title and ticket.
        e.target.tagName === "SELECT");

      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }
      if (e.key === "Escape") {
        // A form owns Escape while it is open. Without this the panel's own
        // handler ALSO ran and silently wiped the search box the operator had
        // typed for the next person.
        if (editingRef.current || walkInRef.current) return;
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
            //
            // Only when something was actually latched. probePrinter cannot see
            // a jam or an empty roll — it only checks QZ and the printer name —
            // so an unconditional clear here would dismiss a per-label failure's
            // fallback panel on the next 30s poll, before the operator had acted
            // on it.
            if (!qzUnreachable.current) return;
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
            <Button
              variant="outline"
              className="min-h-12 px-5 text-[15px]"
              disabled={busy}
              onClick={() => setConfirmReprint(null)}
            >
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
            {q.trim() && !searching && rows.length === 0 && !walkIn && (
              <div className="rounded-lg border border-border p-3">
                <p className="text-[14px] text-muted-foreground">
                  No one matches “{q.trim()}”. Check the spelling, or try their order code.
                </p>
                {/* The other reason nobody matches: they never registered. That
                    used to mean leaving this screen for the walk-in desk, then
                    coming back and searching for the person already standing
                    here. The name they typed carries over. */}
                <Button
                  variant="outline"
                  className="mt-3 min-h-12 px-5 text-[15px]"
                  onClick={() => setWalkIn(true)}
                  disabled={busy}
                >
                  Register “{q.trim()}” as a walk-in
                </Button>
              </div>
            )}

            {/* Strictly exclusive with the results list. The search box stays
                live while this is open, so a corrected spelling can match a
                real attendee — and a filled walk-in form sitting above their
                row is how one person gets registered twice. */}
            {walkIn && rows.length === 0 && (
              <DoorWalkInForm
                prefill={q}
                tickets={tickets}
                busy={submittingWalkIn}
                onCancel={() => setWalkIn(false)}
                onSubmit={(input) => {
                  // Without this a double-tap creates TWO pretix orders for one
                  // person — one checked in, one dangling. register() has no
                  // idempotency key to fall back on.
                  if (submittingWalkIn) return;
                  setSubmittingWalkIn(true);
                  void walkInAndCheckInAction(eventId, input, listId).then((res) => {
                    setSubmittingWalkIn(false);
                    if (!res.ok) {
                      setResult({
                        kind: "err",
                        name: `${input.firstName} ${input.lastName}`.trim(),
                        detail: res.reason ?? "Could not register.",
                      });
                      return;
                    }
                    setWalkIn(false);
                    // Same result path as any other check-in, so the badge
                    // prints under the same ownership and fallback rules.
                    handleResult(res, "in");
                  });
                }}
              />
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

      {editing && (
        <AttendeeEditDialog
          target={editing}
          busy={savingEdit}
          onCancel={() => setEditing(null)}
          onSave={(patch) => {
            // Double-tap guard, like doCheckIn and doReprint. Without it a
            // second tap before React commits `disabled` saves twice.
            if (savingEdit) return;
            setSavingEdit(true);
            const orderCode = editing.orderCode;
            void correctAttendeeAction(eventId, orderCode, patch)
              .then((res) => {
                if (!res.ok) {
                  setSavingEdit(false);
                  setResult({ kind: "err", name: patch.fullName, detail: res.reason ?? "Could not save." });
                  return;
                }
                // The correction saves; the PRINT goes through the ordinary
                // reprint path. That path already refuses a badge for a
                // cancelled or unpaid order and records the print in
                // badgePrintLog — neither of which a correction should be
                // reimplementing on its own.
                setEditing(null);
                return reprintAction(eventId, orderCode).then((printed) => {
                  setSavingEdit(false);
                  if (!printed.ok) {
                    setResult({
                      kind: "warn",
                      name: patch.fullName,
                      label: "Saved",
                      detail: `Details saved, but no badge printed — ${printed.reason ?? "not eligible"}`,
                    });
                    return;
                  }
                  handleResult(printed, "reprint");
                });
              });
          }}
        />
      )}

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
                <span className="flex shrink-0 gap-1.5">
                  {/* Sits beside Reprint, unlike the search rows where two
                      similar buttons are dangerous: mis-tapping this one opens
                      a form you can Escape, while mis-tapping Reprint puts a
                      second physical badge in someone's hand. */}
                  <button
                    type="button"
                    onClick={() => openEdit(r.orderCode)}
                    disabled={busy || openingEdit}
                    className="min-h-11 rounded-md border border-border px-4 text-[13px] font-semibold hover:bg-accent disabled:opacity-50"
                  >
                    Fix
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReprint({ orderCode: r.orderCode, fullName: r.name })}
                    disabled={busy}
                    className="min-h-11 rounded-md border border-border px-4 text-[13px] font-semibold hover:bg-accent disabled:opacity-50"
                  >
                    Reprint
                  </button>
                </span>
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
            {/* Deliberately NOT `auto`. Once qzUnreachable latches, every
                subsequent attendee re-renders this block — and `auto` fired
                window.print() on each mount, opening a modal OS print dialog
                for every person in the queue, stealing focus from the scanner
                and the search box. A jam turned into a stopped lane instead of
                a degraded one. The operator presses this once, deliberately,
                for the person in front of them. */}
            <BadgePrintDialog badge={badge} />
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
