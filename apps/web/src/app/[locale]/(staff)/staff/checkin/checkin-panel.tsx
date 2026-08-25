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
import { decideEnter, looksScannable } from "@/lib/checkin/scan-shape";
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
// The realistic correction window: the badge in your hand and the two before
// it. Beyond that the person is in the hall and you search by name. Six rows
// also made the idle box 350px against the banner's 104 — a 246px jump under
// the operator's cursor, twice per attendee.
const RECENT_LIMIT = 3;

/** How long a success stays on screen before the door resets itself. Failures
 *  and warnings never auto-clear — those need a human decision. */
// A badge takes 2-4s to eject, so this puts the recent list — with Fix on row
// one — back on screen just as the operator picks it up. It was briefly 10s to
// give a Fix button on the banner time to be pressed; that button is gone, and
// the longer timer was half of what made the strip resize under the cursor.
const OK_BANNER_MS = 5000;

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
  /**
   * The query these rows actually answer.
   *
   * `rows` is only written inside the search debounce, so for 220ms after a
   * keystroke it still holds the PREVIOUS query's results. Enter trusted
   * `rows.length === 1`, which meant: type "Elias", one match lands, keep
   * typing "Elias D" to disambiguate a second Elias, press Enter inside the
   * debounce window — and the FIRST Elias is checked in and his badge printed.
   * A check-in cannot be undone at a door.
   */
  const [rowsQuery, setRowsQuery] = useState("");
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
  /**
   * Where focus goes when the Fix or walk-in form closes.
   *
   * Captured at the CLICK, not in an effect. React runs a child's mount effect
   * before its parent's, so both forms have already focused their own first
   * field by the time a panel effect could read document.activeElement — it
   * would capture an element inside the dialog, and focusing that after unmount
   * is a silent no-op. Which looks exactly like the bug it was meant to fix.
   */
  const formReturnFocusRef = useRef<HTMLElement | null>(null);
  const captureReturnFocus = useCallback(() => {
    formReturnFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }, []);
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
      void attendeeForEditAction(eventId, orderCode)
        .then((res) => {
          if (res.ok) setEditing(res.attendee);
          else setResult({ kind: "err", name: orderCode, detail: res.reason });
        })
        // The action catches its own errors, but the CALL still rejects if the
        // connection drops mid-request — and then this guard would stay latched
        // and silently block every future Fix for the rest of the shift.
        .catch((err: unknown) => {
          setResult({
            kind: "err",
            name: orderCode,
            detail: `Could not open — ${(err as Error)?.message ?? "connection lost"}. Try again.`,
          });
        })
        .finally(() => {
          openingEditRef.current = false;
          setOpeningEdit(false);
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


    // Frozen while the walk-in form is open. The form holds its own state, so a
    // late result arriving behind it and unmounting it would discard whatever
    // the operator had typed — and results appearing under a filled walk-in
    // form is how one person gets registered twice.
    if (walkIn) return;

    // Every setState is inside the timeout, never synchronous in the effect
    // body — a synchronous one cascades renders on every keystroke.
    const id = setTimeout(async () => {
      // Same treatment as an empty box, and for the same reason as every other
      // setState here — inside the timeout, never synchronous in the effect
      // body, which cascades renders on each keystroke.
      //
      // A scanned payload is a code, not a name. Searching for it is a wasted
      // round trip in front of a queue, and it is how a badge slug used to
      // match strangers by phone.
      if (!query || looksScannable(query)) {
        setRows([]);
        setRowsQuery(query);
        setSearching(false);
        return;
      }
      setSearching(true);
      try {
        const found = await searchAction(eventId, query);
        // A slow response for an older query must not overwrite a newer one.
        if (!cancelled) {
          setRows(found);
          setRowsQuery(query);
        }
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
  }, [q, eventId, walkIn]);

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
    if (!open && formReturnFocusRef.current) {
      // Only if it is still in the document — the captured trigger may itself
      // have been unmounted (a Recent row rolling off the list, say).
      const el = formReturnFocusRef.current;
      formReturnFocusRef.current = null;
      if (el.isConnected) el.focus();
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

      // "/" is a pure hotkey and MUST swallow itself. Without preventDefault
      // the character lands in the box it just focused, so the operator's next
      // keystrokes build "/Elias" — which matches nobody and offers to register
      // a walk-in instead. That was a regression, not a trade-off.
      if (e.key === "/" && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
        return;
      }

      // Any OTHER single character with focus adrift goes into the box, itself
      // included — deliberately WITHOUT preventDefault. A keyboard-wedge
      // scanner is a keyboard: its payload starts "HTTPS://", and if focus has
      // drifted the leading characters are simply lost, leaving a string
      // resolveBadgeSlug cannot parse. Gated on the dialogs so a scan arriving
      // over an open confirmation cannot pull focus out from under a decision
      // the operator has not made yet.
      if (
        e.key.length === 1 &&
        !typing &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        !confirmReprintRef.current &&
        !editingRef.current &&
        !walkInRef.current
      ) {
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

  /**
   * The "no one matches — register THEM" prompt, which names the person the
   * operator just searched for.
   *
   * Named once because the persistent button below defers to it. Both were
   * eligible in the empty state, stacking two identical calls to action in the
   * one moment they both applied — and the persistent one is meant to be the
   * quiet fallback, not a second shout.
   */
  const showContextualWalkIn =
    !walkIn && Boolean(q.trim()) && !searching && rows.length === 0;

  /**
   * Enter in the search box, which is also where a wedge scanner's payload
   * lands. Four outcomes, and one of them is deliberately "do nothing".
   */
  const onSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key !== "Enter") return;
      e.preventDefault();
      if (busy) return;

      // The decision is a pure function so it can be tested; this only
      // dispatches it.
      const action = decideEnter(q, rowsQuery, rows);
      if (action.kind === "scan") {
        setQ("");
        setRows([]);
        setRowsQuery("");
        doScan(action.text);
        return;
      }
      if (action.kind === "checkIn") doCheckIn(action.orderCode);
    },
    [q, rows, rowsQuery, busy, doScan, doCheckIn],
  );

  /**
   * What fills the banner's space between attendees.
   *
   * That area used to be a dashed box reading "Scan a badge or ticket" — the
   * biggest element on the screen, blank exactly when the operator has a second
   * to look at it. Meanwhile the list of people just checked in, and the only
   * route to Fix, sat at the BOTTOM of the page below the fold on a 768px
   * laptop, so in practice a misspelt badge just got handed over.
   *
   * They swap: the list lives in the empty space and yields to the banner the
   * moment something happens.
   */
  const idleRecent =
    recent.length > 0 ? (
              <section aria-label="Recent">
                <h2 className="mb-2 text-[12px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
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
                          onClick={() => {
                            captureReturnFocus();
                            openEdit(r.orderCode);
                          }}
                          disabled={busy || openingEdit || savingEdit}
                          className="min-h-9 rounded-md border border-border px-3 text-[13px] font-semibold hover:bg-accent disabled:opacity-50"
                        >
                          Fix
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmReprint({ orderCode: r.orderCode, fullName: r.name })}
                          disabled={busy}
                          className="min-h-9 rounded-md border border-border px-3 text-[13px] font-semibold hover:bg-accent disabled:opacity-50"
                        >
                          Reprint
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
    ) : null;

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

      <ResultBanner result={result} idle={idleRecent} />

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
            onKeyDown={onSearchKeyDown}
            placeholder="Name, email, phone or order code  ( / to focus )"
            aria-label="Search attendees"
            // Disabled, not merely ignored, while the walk-in form is open: a
            // box that accepts typing and does nothing reads as broken.
            disabled={walkIn}
            className="h-12 text-[16px] disabled:opacity-60"
          />

          <div className="mt-3">
            {q.trim() && searching && (
              <p className="text-[14px] text-muted-foreground">Searching…</p>
            )}
            {showContextualWalkIn && (
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
                  onClick={() => {
                    captureReturnFocus();
                    setWalkIn(true);
                  }}
                  disabled={busy}
                >
                  Register “{q.trim()}” as a walk-in
                </Button>
              </div>
            )}

            {/* The search is frozen while this is open (see the search effect
                and the disabled input above), so results cannot appear behind a
                half-filled form. Gating this on `rows.length === 0` instead
                looked equivalent and was worse: a late search response would
                UNMOUNT the form mid-fill and silently discard everything the
                operator had typed. */}
            {walkIn && (
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
                  const who = `${input.firstName} ${input.lastName}`.trim();
                  void walkInAndCheckInAction(eventId, input, listId)
                    .then((res) => {
                      if (!res.ok) {
                        setResult({ kind: "err", name: who, detail: res.reason ?? "Could not register." });
                        return;
                      }
                      setWalkIn(false);
                      // Same result path as any other check-in, so the badge
                      // prints under the same ownership and fallback rules.
                      handleResult(res, "in");
                    })
                    // A dropped connection rejects the CALL, and .then never
                    // runs — leaving submittingWalkIn latched and the Register
                    // button dead for the rest of the shift, with nothing on
                    // screen saying why. The message is deliberately honest
                    // about the ambiguity: pretix may well have created the
                    // order before the connection went.
                    .catch((err: unknown) => {
                      setResult({
                        kind: "err",
                        name: who,
                        detail: `Connection lost — ${(err as Error)?.message ?? "unknown"}. They may already be registered: search their name before trying again.`,
                      });
                    })
                    .finally(() => setSubmittingWalkIn(false));
                }}
              />
            )}

            {/* Hidden while the walk-in form is open, not merely frozen.
                Freezing the search stops NEW results arriving; it does not
                remove the ones already there. With the persistent button, the
                form can now be opened with a list on screen — so a filled
                walk-in form would sit directly above the very person it is
                about to duplicate, each row still carrying a live
                "Check in & print".
                Nothing is lost: `rows` stays in state, so cancelling the form
                brings the same results straight back. */}
            {!walkIn && (
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
            )}

            {/* Always here, so registering someone never requires searching for
                them and failing first. Deliberately quiet, and deliberately
                BELOW the results: the most common reason a name does not appear
                is a spelling or transliteration miss, not an unregistered
                person, and a loud button above the list is how a Mohamad who is
                already in the system gets registered a second time. Whatever is
                typed carries over, so nothing is retyped either way. */}
            {!walkIn && !showContextualWalkIn && (
              <button
                type="button"
                onClick={() => {
                  captureReturnFocus();
                  setWalkIn(true);
                }}
                disabled={busy}
                className="mt-3 min-h-12 w-full rounded-lg border border-dashed border-border px-5 text-[15px] font-semibold text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                + Register a walk-in
              </button>
            )}
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
                  setResult({ kind: "err", name: patch.fullName, detail: res.reason ?? "Could not save." });
                  return;
                }
                // The correction saves; the PRINT goes through the ordinary
                // reprint path. That path already refuses a badge for a
                // cancelled or unpaid order and records the print in
                // badgePrintLog — neither of which a correction should be
                // reimplementing on its own.
                // Only close the dialog if it is still the one this save was
                // started from. Closing unconditionally shut whichever dialog
                // happened to be open by then — discarding an unrelated edit.
                setEditing((cur) => (cur?.orderCode === orderCode ? null : cur));
                return reprintAction(eventId, orderCode).then((printed) => {
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
              })
              // Either call can reject if the connection drops. Without this the
              // flag stays latched — which disables Save AND every Fix button in
              // the recent list, so no correction is possible for the rest of the
              // shift, with nothing on screen saying why.
              .catch((err: unknown) => {
                setResult({
                  kind: "err",
                  name: patch.fullName,
                  detail: `Connection lost — ${(err as Error)?.message ?? "unknown"}. The change may not have saved; check the details before trying again.`,
                });
              })
              .finally(() => setSavingEdit(false));
          }}
        />
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
