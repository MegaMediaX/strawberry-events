"use client";

import { useEffect, useRef, useState } from "react";

const CONTAINER_ID = "qr-reader";

/**
 * Camera QR scanner for check-in. Reads the badge QR (which encodes the pretix
 * secret) and calls onScan with the decoded text. Duplicate reads of the same
 * code within a short window are suppressed so one badge doesn't fire twice.
 *
 * html5-qrcode touches navigator/document, so it's imported lazily inside the
 * effect (never during SSR).
 */
export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let stopped = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scanner: any = null;
    let last: { text: string; at: number } | null = null;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (stopped) return;
        scanner = new Html5Qrcode(CONTAINER_ID, false);
        await scanner.start(
          { facingMode: "environment" },
          { fps: 10, qrbox: 250 },
          (text: string) => {
            const now = Date.now();
            if (last && last.text === text && now - last.at < 2500) return;
            last = { text, at: now };
            onScanRef.current(text);
          },
          () => {
            // per-frame decode failures are normal; ignore.
          },
        );
      } catch {
        if (!stopped) setError("Camera unavailable — check browser permissions.");
      }
    })();

    return () => {
      stopped = true;
      if (scanner) {
        scanner
          .stop()
          .catch(() => {})
          .finally(() => scanner.clear?.());
      }
    };
  }, []);

  return (
    <div>
      <div
        id={CONTAINER_ID}
        className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[var(--radius-lg)] border border-border"
      />
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </div>
  );
}
