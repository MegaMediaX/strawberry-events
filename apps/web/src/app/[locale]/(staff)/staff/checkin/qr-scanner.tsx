"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { CAMERA_KEY, pickCamera, type CameraOption } from "@/lib/checkin/camera-choice";

const CONTAINER_ID = "qr-reader";

/**
 * Camera QR scanner for check-in.
 *
 * Reads EITHER payload and hands the raw text to onScan: the pretix e-ticket QR
 * (a pretix secret) or the printed badge QR (a contact-profile URL carrying a
 * badgeSlug). `checkInBySecret` resolves both, secret first.
 *
 * Duplicate reads of the same code within a short window are suppressed, so a
 * badge left in front of the lens does not check someone in repeatedly.
 *
 * The camera is chosen EXPLICITLY. This used to start with
 * `{ facingMode: "environment" }`, which is a mobile concept — desktop cameras
 * generally report no facing at all, and the constraint was not `exact`, so the
 * browser satisfied it with the built-in lid camera. On a lane with a USB
 * webcam plugged in and aimed at the badges, the preview showed the operator's
 * own face while the right camera sat idle beside it.
 *
 * html5-qrcode touches navigator/document, so it's imported lazily inside the
 * effect (never during SSR).
 */
export function QrScanner({ onScan }: { onScan: (text: string) => void }) {
  const onScanRef = useRef(onScan);
  // Keep the latest callback without re-running the scanner effect. Writing the
  // ref during render is a React violation (and an eslint error); the scan
  // callback only reads it later, so syncing in an effect is equivalent.
  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const [error, setError] = useState<string | null>(null);
  const [cameras, setCameras] = useState<CameraOption[]>([]);
  const [retryTick, setRetryTick] = useState(0);
  /**
   * Seeded synchronously rather than in an effect.
   *
   * Reading it in an effect meant the scanner effect ran ONCE with null and
   * again with the saved id: two getCameras() calls and two overlapping
   * start() attempts on every mount of a lane that had chosen a camera. On a
   * slow USB webcam the loser of that race can end up holding the device — and
   * on Windows many webcam drivers are exclusive-access, so the camera the
   * operator actually picked then cannot open at all.
   *
   * Safe to read here despite SSR: the initializer is guarded, and nothing
   * rendered before the async enumeration depends on it.
   */
  const [cameraId, setCameraId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage.getItem(CAMERA_KEY);
    } catch {
      return null;
    }
  });

  const choose = useCallback((id: string) => {
    setCameraId(id);
    try {
      window.localStorage.setItem(CAMERA_KEY, id);
    } catch {
      // Not being able to remember is survivable; not being able to pick is not.
    }
  }, []);

  useEffect(() => {
    let stopped = false;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let scanner: any = null;
    let last: { text: string; at: number } | null = null;

    (async () => {
      try {
        const { Html5Qrcode } = await import("html5-qrcode");
        if (stopped) return;

        // Labels are only populated after camera permission is granted, which
        // getCameras() prompts for. Without labels there is nothing to choose
        // between, so enumeration has to come before selection.
        const found: CameraOption[] = await Html5Qrcode.getCameras();
        if (stopped) return;
        setCameras(found);

        const chosen = pickCamera(cameraId, found);
        if (!chosen) {
          setError("No camera found — plug one in, or search by name instead.");
          return;
        }

        // Checked again HERE, not just after getCameras(). Permission and
        // device-open are slow; if cleanup ran during them, assigning and
        // starting now creates a stream whose owning effect is already gone.
        if (stopped) return;

        scanner = new Html5Qrcode(CONTAINER_ID, false);
        await scanner.start(
          chosen.id,
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
        if (stopped) {
          // Cleanup ran while start() was in flight. Nothing else will ever
          // reach this instance, so it has to stop itself or the device stays
          // held open — the failure is silent, and on Windows it locks out the
          // next attempt entirely.
          scanner.stop().catch(() => {}).finally(() => scanner?.clear?.());
          scanner = null;
          return;
        }
        setError(null);
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
    // Restarts when the operator picks a different camera — stopping the old
    // stream is what the cleanup above is for.
  }, [cameraId, retryTick]);

  // A webcam unplugged mid-shift produced no error at all — the per-frame
  // decode callback cannot tell "no QR in this frame" from "no frames". The
  // preview simply froze, and a lane with one camera had no control to recover
  // with short of reloading the page.
  useEffect(() => {
    const md = typeof navigator !== "undefined" ? navigator.mediaDevices : undefined;
    if (!md?.addEventListener) return;
    const onChange = () => setRetryTick((n) => n + 1);
    md.addEventListener("devicechange", onChange);
    return () => md.removeEventListener("devicechange", onChange);
  }, []);

  return (
    <div>
      <div
        id={CONTAINER_ID}
        className="mx-auto w-full max-w-[320px] overflow-hidden rounded-[var(--radius-lg)] border border-border"
      />

      {/* Only when there is a choice to make. One camera needs no control, and
          a select with a single option is a tab stop that teaches nothing. */}
      {cameras.length > 1 && (
        <label className="mt-2 flex flex-col gap-1">
          <span className="text-[12px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
            Camera
          </span>
          <select
            value={pickCamera(cameraId, cameras)?.id ?? ""}
            onChange={(e) => choose(e.target.value)}
            className="h-10 w-full rounded-lg border border-input bg-transparent px-2 text-[14px]"
          >
            {cameras.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label || "Unnamed camera"}
              </option>
            ))}
          </select>
        </label>
      )}

      {error && (
        <div className="mt-2">
          <p className="text-sm text-destructive">{error}</p>
          <button
            type="button"
            onClick={() => setRetryTick((n) => n + 1)}
            className="mt-2 min-h-11 rounded-md border border-border px-4 text-[14px] font-semibold hover:bg-accent"
          >
            Retry camera
          </button>
        </div>
      )}
    </div>
  );
}
