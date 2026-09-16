"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { qrViewState } from "./qr-state";

/** ISO/IEC 18004 minimum. Anything less and readers hunt for the symbol. */
export const QR_QUIET_ZONE_MODULES = 4;

export function QrCodeDisplay({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

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
        if (active) setSrc(url);
      })
      .catch(() => {
        if (active) setError(true);
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
