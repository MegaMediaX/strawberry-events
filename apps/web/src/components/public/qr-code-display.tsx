"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";

export function QrCodeDisplay({ value }: { value: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(value, { width: 220, margin: 1 })
      .then((url) => {
        if (active) setSrc(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [value]);

  if (!src) {
    return <div className="size-[220px] animate-pulse rounded-lg bg-muted" />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt="Ticket QR code" width={220} height={220} />;
}
