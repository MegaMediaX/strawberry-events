"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  getPrinterName,
  setPrinterName,
  getPrinterLanguage,
  setPrinterLanguage,
  type PrinterLanguage,
  PrintError,
} from "@/lib/checkin/print-client";
import { printBadge } from "@/lib/checkin/print-badge";

/** A sample badge used by the "Test print" button. */
const TEST_BADGE = {
  tag: "staff",
  fullName: "Test Badge",
  company: "Strawberry Agency",
} as const;

/**
 * Printer settings for check-in: edit which printer QZ Tray prints to (blank =
 * system default) and fire a test print. The name must match what QZ Tray
 * reports — e.g. "Honeywell PC42d (203 dpi)".
 */
export function PrinterSettings() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [language, setLanguage] = useState<PrinterLanguage>("zpl");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    // Read the persisted printer name after hydration — it lives in
    // localStorage, so it cannot seed useState (that initializer also runs on
    // the server). External-store read, not derived state; useSyncExternalStore
    // is the idiomatic fix and is deferred.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setName(getPrinterName() ?? "");
    setLanguage(getPrinterLanguage());
  }, []);

  function save() {
    setPrinterName(name.trim() || null);
    setPrinterLanguage(language);
    setMsg({ kind: "ok", text: "Saved." });
  }

  async function testPrint() {
    setBusy(true);
    setMsg(null);
    setPrinterName(name.trim() || null);
    setPrinterLanguage(language);
    try {
      // Goes through the same entry point as a real badge, so a test print
      // proves the language setting too — not just that the printer answers.
      await printBadge(TEST_BADGE);
      setMsg({ kind: "ok", text: "Test badge sent to the printer." });
    } catch (err) {
      setMsg({
        kind: "err",
        text: err instanceof PrintError ? err.message : "Test print failed.",
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mb-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-sm text-muted-foreground underline-offset-2 hover:underline"
      >
        {open ? "Hide printer settings" : "Printer settings"}
      </button>

      {open && (
        <div className="mt-2 rounded-[var(--radius-lg)] border border-border p-3">
          <label className="text-sm font-medium" htmlFor="printer-name">
            Printer name (blank = system default)
          </label>
          <Input
            id="printer-name"
            className="mt-1"
            placeholder="PC42d"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <label className="mt-3 flex flex-col gap-1 text-sm">
              <span className="font-medium">Printer language</span>
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value as PrinterLanguage)}
                className="h-10 rounded-lg border border-input bg-transparent px-2 text-base md:text-sm"
              >
                <option value="zpl">ZPL — Honeywell PC42d</option>
                <option value="tspl">TSPL — Xprinter XP-365B</option>
              </select>
              <span className="text-xs text-muted-foreground">
                Leave on ZPL unless this station has the Xprinter. The two are not
                interchangeable — the wrong one prints nothing at all.
              </span>
          </label>

          <div className="mt-3 flex gap-2">
            <Button size="sm" onClick={save} disabled={busy}>Save</Button>
            <Button size="sm" variant="outline" onClick={testPrint} disabled={busy}>
              Test print
            </Button>
          </div>
          {msg && (
            <p className={`mt-2 text-sm ${msg.kind === "ok" ? "text-green-600" : "text-destructive"}`}>
              {msg.text}
            </p>
          )}
          <p className="mt-2 text-xs text-muted-foreground">
            Requires QZ Tray running on this machine. The name must match what QZ Tray reports exactly (for this printer: PC42d).
          </p>
        </div>
      )}
    </div>
  );
}
