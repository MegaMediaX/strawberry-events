"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { qrViewState } from "./qr-state";

export function QrCodeDisplay({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: 220, margin: 1 })
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
    return <div className="size-[220px] animate-pulse rounded-lg bg-muted" />;
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
        <span className="text-xs text-muted-foreground">
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
