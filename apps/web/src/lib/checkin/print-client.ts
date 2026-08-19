"use client";

/**
 * Browser-side print client for the Honeywell PC42d via QZ Tray.
 *
 * QZ Tray (https://qz.io) is a small app installed on the staff machine that
 * exposes a localhost WebSocket. The browser connects to it and sends RAW ZPL,
 * which QZ forwards to the USB printer — giving silent, dialog-free printing of
 * crisp 203 dpi labels (which browser print can't do for raw ZPL).
 *
 * Signing: in production QZ uses a code-signing cert to avoid a per-print trust
 * prompt. Here we run UNSIGNED (dev mode): the first print shows a one-time
 * "Allow" dialog in QZ Tray. Drop a real cert into the security promises below
 * when you have one — see the QZ Tray "Signing Messages" docs.
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
    setSignaturePromise: (fn: (toSign: string) => (resolve: (v?: unknown) => void) => void) => void;
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
      // Unsigned dev mode: empty cert + no signature → QZ prompts once to allow.
      qz.security.setCertificatePromise((resolve) => resolve());
      qz.security.setSignaturePromise(() => (resolve) => resolve());
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

export class PrintError extends Error {}

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
      );
    }
    stripToRawOptions(options);
    if (!isRawOnly(config.getOptions?.() ?? {})) {
      throw new PrintError(
        "Could not put the printer in raw mode — badges would print as text. Check the QZ Tray version.",
      );
    }

    await qz.print(config, rawZplData(zpl));
  } catch {
    throw new PrintError("The printer rejected the job. Check paper/ribbon and try again.");
  }
}
