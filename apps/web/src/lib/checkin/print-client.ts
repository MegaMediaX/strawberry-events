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
 */

const PRINTER_KEY = "strawberry.checkin.printerName";

/** The raw-ZPL print payload QZ Tray expects. Pure + unit-testable. */
export function rawZplData(zpl: string) {
  return [{ type: "raw" as const, format: "plain" as const, data: zpl }];
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
  configs: { create: (printer: string) => unknown };
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
    const config = qz.configs.create(printer);
    await qz.print(config, rawZplData(zpl));
  } catch {
    throw new PrintError("The printer rejected the job. Check paper/ribbon and try again.");
  }
}
