"use client";

import { useEffect, useState } from "react";

import { probePrinter, type PrinterHealth } from "@/lib/checkin/print-client";

/**
 * Live printer health, always visible at the door.
 *
 * The failure this exists to prevent: the printer is discovered to be down on
 * the FIRST attendee, with a queue already formed. Every failure here — QZ Tray
 * not running, wrong printer name, printer powered off — is fixable in under a
 * minute IF you know before the doors open.
 *
 * Re-probes periodically because QZ Tray can be quit or crash mid-event, and a
 * pill that went green once and never looked again is worse than no pill.
 */
const PROBE_INTERVAL_MS = 30_000;

export function PrinterStatus() {
  const [health, setHealth] = useState<PrinterHealth | null>(null);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    let cancelled = false;

    // Every setState here lands AFTER an await, never synchronously inside the
    // effect — a synchronous one cascades renders on mount.
    const run = async () => {
      const h = await probePrinter();
      if (!cancelled) setHealth(h);
    };

    void run();
    const id = setInterval(() => void run(), PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  async function retry() {
    setRetrying(true);
    try {
      setHealth(await probePrinter());
    } finally {
      setRetrying(false);
    }
  }

  const ok = health?.ok === true;
  const dotClass = health === null ? "bg-muted-foreground" : ok ? "bg-green-500" : "bg-destructive";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        // aria-live so a printer that drops mid-event is announced, not merely
        // recoloured — staff are watching the queue, not this pill.
        role="status"
        aria-live="polite"
        className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1.5 text-[13px]"
      >
        <span className={`size-2 rounded-full ${dotClass}`} aria-hidden />
        {health === null
          ? "Checking printer…"
          : ok
            ? `Printer ready · ${health.printer}`
            : health.reason}
      </span>

      {health && !health.ok && (
        <>
          <span className="text-[13px] text-muted-foreground">{health.fixHint}</span>
          <button
            type="button"
            onClick={() => void retry()}
            disabled={retrying}
            className="min-h-9 rounded-md border border-border px-3 text-[13px] font-semibold hover:bg-accent disabled:opacity-50"
          >
            {retrying ? "Checking…" : "Retry"}
          </button>
        </>
      )}
    </div>
  );
}
