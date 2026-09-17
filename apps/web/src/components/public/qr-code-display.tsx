"use client";

import { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { qrViewState } from "./qr-state";

/** ISO/IEC 18004 minimum. Anything less and readers hunt for the symbol. */
export const QR_QUIET_ZONE_MODULES = 4;

export function QrCodeDisplay({
  value,
  onSettled,
}: {
  value: string;
  /**
   * Fired once the symbol is drawn — or has definitively failed and the
   * fallback code is on screen. The ticket screen holds its reveal until this
   * says the payoff is actually there: a plate that rises over a pulsing grey
   * square is a reveal of a loading state.
   */
  onSettled?: () => void;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  // The latest-ref pattern: kept in a ref so a caller passing an inline arrow
  // cannot restart QR generation on every render, and assigned in an effect
  // rather than during render, because a ref is not readable or writable while
  // rendering.
  const settled = useRef(onSettled);
  useEffect(() => {
    settled.current = onSettled;
  }, [onSettled]);

  useEffect(() => {
    let active = true;
    // margin is the QUIET ZONE, in modules. ISO/IEC 18004 requires 4; this
    // asked for 1. A symbol printed on a badge respects it — badge-layout.ts
    // reserves the room and says why ("Beyond it, the QR loses its quiet zone
    // and stops scanning") — while the ticket an attendee holds up at the door
    // did not. Costs nothing: the code is rendered into a fixed 220px box, so
    // a wider margin trades a few modules of size for a symbol that a reader
    // can actually lock onto.
    QRCode.toDataURL(value, { width: 220, margin: QR_QUIET_ZONE_MODULES })
      .then((url) => {
        if (!active) return;
        setSrc(url);
        settled.current?.();
      })
      .catch(() => {
        if (!active) return;
        setError(true);
        // A failure settles too. The fallback below is a readable code that
        // gets someone through a door, and it is as much the payoff as the
        // symbol would have been — holding the reveal for a QR that is never
        // coming would leave the screen waiting forever.
        settled.current?.();
      });
    return () => {
      active = false;
    };
  }, [value]);

  const state = qrViewState({ src, error });

  if (state === "loading") {
    return (
      <div className="size-[220px] animate-pulse rounded-lg bg-muted motion-reduce:animate-none" />
    );
  }

  if (state === "error") {
    // QR generation failed — show the code as selectable text so the attendee
    // can still be checked in at the entrance. Never leave them on a spinner.
    return (
      <div
        role="alert"
        data-testid="qr-fallback"
        className="flex size-[220px] flex-col items-center justify-center gap-2 rounded-lg border border-border bg-muted p-3 text-center"
      >
        {/* Not muted-foreground: on this muted plate it measures 3.73:1 in
            dark mode, and this is the sentence that gets someone through a
            door when the symbol above it failed to render. */}
        <span className="text-xs text-foreground">
          QR code unavailable — show this code at the entrance:
        </span>
        <span className="select-all break-all font-mono text-sm font-semibold text-foreground">
          {value}
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src!}
      alt="Ticket QR code"
      width={220}
      height={220}
      data-testid="qr-image"
    />
  );
}
