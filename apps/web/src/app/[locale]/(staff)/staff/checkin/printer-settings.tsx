"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { buildBadgeZpl } from "@/lib/checkin/badge-zpl";
import {
  getPrinterName,
  setPrinterName,
  printZpl,
  PrintError,
} from "@/lib/checkin/print-client";

/** A sample badge used by the "Test print" button. */
const TEST_BADGE = {
  tag: "staff",
  fullName: "Test Badge",
  company: "Strawberry Agency",
  qrValue: "TEST-PRINT",
} as const;

/**
 * Printer settings for check-in: edit which printer QZ Tray prints to (blank =
 * system default) and fire a test print. The name must match what QZ Tray
 * reports — e.g. "Honeywell PC42d (203 dpi)".
 */
export function PrinterSettings() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(getPrinterName() ?? "");
  }, []);

  function save() {
    setPrinterName(name.trim() || null);
    setMsg({ kind: "ok", text: "Saved." });
  }

  async function testPrint() {
    setBusy(true);
    setMsg(null);
    setPrinterName(name.trim() || null);
    try {
      await printZpl(buildBadgeZpl(TEST_BADGE));
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
            placeholder="Honeywell PC42d (203 dpi)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
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
            Requires QZ Tray running on this machine. The name must match what QZ Tray reports.
          </p>
        </div>
      )}
    </div>
  );
}
