"use client";

/**
 * Browser-side print client for the Honeywell PC42d via QZ Tray.
 *
 * QZ Tray (https://qz.io) is a small app installed on the staff machine that
 * exposes a localhost WebSocket. The browser connects to it and sends RAW ZPL,
 * which QZ forwards to the USB printer — giving silent, dialog-free printing of
 * crisp 203 dpi labels (which browser print can't do for raw ZPL).
 *
 * Signing: requests are SIGNED, so QZ never shows its "anonymous request"
 * dialog. The private key lives on the server (see lib/checkin/qz-signing.ts);
 * the browser only ever fetches the public certificate and asks the server to
 * sign QZ's challenge. If signing is not configured, both promises reject and
 * QZ falls back to prompting — degraded, but still able to print.
 *
 * Raw printing: see RAW_PRINT_OPTIONS. Sending ZPL without it prints the ZPL
 * source as text rather than a badge.
 */

const PRINTER_KEY = "strawberry.checkin.printerName";

/** The raw-ZPL print payload QZ Tray expects. Pure + unit-testable. */
export function rawZplData(zpl: string) {
  return [{ type: "raw" as const, format: "plain" as const, data: zpl }];
}

/**
 * Printer options for raw ZPL. `altPrinting` is not optional here.
 *
 * macOS stopped supporting raw CUPS queues (`lpadmin -m raw` is rejected), so
 * the PC42d queue has to carry a real driver — `drv:///sample.drv/zebra.ppd`.
 * That driver has a filter chain (text -> PDF -> raster), and without
 * `altPrinting` QZ hands the job to it. CUPS then faithfully RENDERS THE ZPL AS
 * TEXT: the label comes out covered in `^XA ^FO20,60 ^A0N...` instead of a
 * badge. It looks exactly like a printer that does not understand ZPL, which is
 * what makes it so expensive to diagnose — it cost five labels and two wrong
 * conclusions the first time, via `lp`.
 *
 * `altPrinting` makes QZ shell out to the CUPS `lp`/`lpr` CLI in raw mode,
 * which is the same escape hatch as `lpr -l` from a terminal.
 *
 * Verified on the real PC42d: without it, gibberish; with it, the label renders.
 */
export const RAW_PRINT_OPTIONS = { altPrinting: true } as const;

/**
 * Reduce a QZ config's options to `altPrinting` ONLY, in place.
 *
 * Setting altPrinting is necessary but NOT sufficient, which cost a full round
 * of "fixed" badges that still printed as source text. QZ only takes the raw
 * CLI path when altPrinting is the ONLY option present. `qz.configs.create()`
 * always injects its full ~20-key default set (copies, colorType, density,
 * encoding, spool...), and the mere PRESENCE of those makes QZ fall back to
 * `sun.print.UnixPrintJob` — the Java print service, which goes through the
 * driver and rasterises.
 *
 * Confirmed in QZ Tray's own debug log:
 *   {altPrinting:true} alone  -> "Using qz.printer.action.PrintRaw", no
 *                                UnixPrintJob, label renders
 *   + any other option        -> "PrintEvent on sun.print.UnixPrintJob",
 *                                label prints "^XA ^FO16,23 ^A0N..." as text
 *
 * Mutates the object rather than replacing it because qz.print() reads the
 * config's live options object at send time.
 */
export function stripToRawOptions(options: Record<string, unknown>): Record<string, unknown> {
  for (const key of Object.keys(options)) delete options[key];
  return Object.assign(options, RAW_PRINT_OPTIONS);
}

/** True when the options carry altPrinting and nothing else. */
export function isRawOnly(options: Record<string, unknown>): boolean {
  const keys = Object.keys(options);
  return keys.length === 1 && keys[0] === "altPrinting" && options.altPrinting === true;
}

/** The configured printer name, or null to use the system default. */
export function getPrinterName(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(PRINTER_KEY);
}

export function setPrinterName(name: string | null): void {
  if (typeof window === "undefined") return;
  if (name) window.localStorage.setItem(PRINTER_KEY, name);
  else window.localStorage.removeItem(PRINTER_KEY);
}

// qz-tray ships as a CommonJS module without bundled types; load it lazily so it
// never runs during SSR and only enters the client bundle when printing is used.
type Qz = {
  websocket: { isActive: () => boolean; connect: () => Promise<void> };
  security: {
    setCertificatePromise: (fn: (resolve: (v?: unknown) => void, reject: (e?: unknown) => void) => void) => void;
    setSignaturePromise: (
      fn: (toSign: string) => (resolve: (v?: unknown) => void, reject: (e?: unknown) => void) => void,
    ) => void;
    setSignatureAlgorithm?: (algorithm: string) => void;
  };
  printers: { find: (name?: string) => Promise<string | string[]> };
  configs: {
    create: (
      printer: string,
      opts?: Record<string, unknown>,
    ) => { getOptions?: () => Record<string, unknown> };
  };
  print: (config: unknown, data: unknown) => Promise<void>;
};

let qzPromise: Promise<Qz> | null = null;

async function getQz(): Promise<Qz> {
  if (!qzPromise) {
    qzPromise = (async () => {
      const mod = await import("qz-tray");
      const qz = (mod.default ?? mod) as unknown as Qz;

      // Signed requests. Without these QZ shows "an anonymous request wants to
      // access connected printers" — and that grant lasts only for the current
      // QZ SESSION, so restarting QZ Tray brings the dialog back. At a door
      // that means the first badge of the morning blocks behind a modal.
      //
      // The private key never reaches the browser: we fetch the public
      // certificate, and send QZ's challenge to an authenticated endpoint that
      // signs it. Shipping the key in this bundle would let anyone view-source
      // it and print to every QZ Tray trusting our certificate.
      qz.security.setSignatureAlgorithm?.("SHA512");

      qz.security.setCertificatePromise((resolve, reject) => {
        fetch("/api/print/certificate")
          .then((r) => (r.ok ? r.text() : Promise.reject(new Error(String(r.status)))))
          .then(resolve)
          // Rejecting makes QZ fall back to its unsigned path, which still
          // prints — it just prompts. A deployment without signing configured
          // must not lose the ability to print entirely.
          .catch(reject);
      });

      qz.security.setSignaturePromise((toSign) => (resolve, reject) => {
        fetch("/api/print/sign", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ toSign }),
        })
          .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
          .then((d: { signature?: string }) =>
            d.signature ? resolve(d.signature) : reject(new Error("no signature")),
          )
          .catch(reject);
      });

      return qz;
    })();
  }
  return qzPromise;
}

async function ensureConnected(qz: Qz): Promise<void> {
  if (!qz.websocket.isActive()) {
    await qz.websocket.connect();
  }
}

/**
 * Why a print failed, because the caller must treat these differently.
 *
 * - "transport": QZ Tray itself is unreachable. Nothing will print until a human
 *   fixes it, so the door should stop dialling and switch to browser printing.
 * - "printer": QZ is up but the configured printer is missing. Also persistent,
 *   but the fix is in settings, not in QZ.
 * - "job": THIS label was rejected — out of stock, jam, bad ribbon. Transient
 *   and per-badge. Latching on this would let one bad label downgrade every
 *   remaining attendee in the queue.
 */
export type PrintErrorKind = "transport" | "printer" | "job";

export class PrintError extends Error {
  constructor(
    message: string,
    readonly kind: PrintErrorKind,
  ) {
    super(message);
  }
}

/** Only these mean "stop trying" — a rejected job does not. */
export function isPersistentPrintFailure(err: unknown): boolean {
  return err instanceof PrintError && err.kind !== "job";
}

export type PrinterHealth =
  | { ok: true; printer: string }
  | { ok: false; reason: string; fixHint: string };

/**
 * Ask QZ Tray whether it is reachable and whether the configured printer is
 * present, WITHOUT printing anything.
 *
 * Exists so the door learns the printer is down while the queue is still
 * outside, rather than on the first attendee. Every failure carries a fix hint,
 * because the raw errors point at the wrong thing: a browser blocked by CSP and
 * a QZ Tray that genuinely is not running produce the same "cannot connect".
 */
export async function probePrinter(): Promise<PrinterHealth> {
  let qz: Qz;
  try {
    qz = await getQz();
    await ensureConnected(qz);
  } catch {
    return {
      ok: false,
      reason: "Printer service not reachable",
      fixHint: "Open QZ Tray on this machine, then press Retry.",
    };
  }

  const configured = getPrinterName();
  try {
    const found = await qz.printers.find(configured ?? undefined);
    const printer = Array.isArray(found) ? found[0] : found;
    if (!printer) {
      return {
        ok: false,
        reason: "No printer selected",
        fixHint: "Open Printer settings and enter the name QZ Tray reports.",
      };
    }
    return { ok: true, printer };
  } catch {
    return {
      ok: false,
      reason: configured ? `Printer "${configured}" not found` : "No default printer",
      fixHint: "Check the printer is on and connected, then press Retry.",
    };
  }
}

/**
 * Print raw ZPL to the configured (or default) printer. Throws PrintError with a
 * staff-readable message if QZ Tray isn't running or the printer can't be found.
 */
export async function printZpl(zpl: string): Promise<void> {
  let qz: Qz;
  try {
    qz = await getQz();
    await ensureConnected(qz);
  } catch {
    throw new PrintError(
      "Can't reach the printer service (QZ Tray). Is QZ Tray running on this machine?",
      "transport",
    );
  }

  const configured = getPrinterName();
  let printer: string;
  try {
    const found = await qz.printers.find(configured ?? undefined);
    printer = Array.isArray(found) ? found[0] : found;
  } catch {
    throw new PrintError(
      configured
        ? `Printer "${configured}" not found. Check it's connected and powered on.`
        : "No default printer found. Connect the badge printer or set one in settings.",
      "printer",
    );
  }

  try {
    const config = qz.configs.create(printer, RAW_PRINT_OPTIONS);

    // Verify rather than assume. If a QZ upgrade stops exposing the live
    // options object, this must fail loudly at the first badge — not print 812
    // labels covered in ZPL source while every test still passes.
    const options = config.getOptions?.();
    if (!options) {
      throw new PrintError(
        "Printer options unavailable — QZ Tray may be an unsupported version. Badges would print as raw text.",
        "transport",
      );
    }
    stripToRawOptions(options);
    if (!isRawOnly(config.getOptions?.() ?? {})) {
      throw new PrintError(
        "Could not put the printer in raw mode — badges would print as text. Check the QZ Tray version.",
        "transport",
      );
    }

    await qz.print(config, rawZplData(zpl));
  } catch (err) {
    // Preserve a PrintError we raised ourselves. The raw-mode checks above throw
    // "transport" from INSIDE this try, and blanket-rethrowing as "job" silently
    // downgraded them: the latch never engaged, so the door re-ran the whole
    // connect/configure dance and failed it for every badge, each time telling
    // the operator to check paper and ribbon — the wrong fix for a QZ version
    // problem, mid-event.
    if (err instanceof PrintError) throw err;

    // Only a genuine qz.print() rejection is per-label: this one failed, the
    // next may well succeed.
    throw new PrintError(
      "The printer rejected that label. Check paper and ribbon, then reprint.",
      "job",
    );
  }
}
