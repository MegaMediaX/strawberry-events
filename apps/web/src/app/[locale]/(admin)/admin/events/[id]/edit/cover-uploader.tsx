"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { uploadCoverAction, removeCoverAction } from "./cover-actions";

export function CoverUploader({
  locale,
  eventId,
  initialUrl,
}: {
  locale: string;
  eventId: string;
  initialUrl: string | null;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function onUpload(file: File) {
    setBusy(true);
    setMsg(null);
    const fd = new FormData();
    fd.append("file", file);
    const res = await uploadCoverAction(locale, eventId, fd);
    setBusy(false);
    if (res.ok) {
      // Cache-bust so the swapped image refreshes immediately.
      setUrl(res.url ? `${res.url}?t=${Date.now()}` : null);
      setMsg("Cover updated.");
    } else {
      setMsg(res.error ?? "Upload failed");
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onRemove() {
    setBusy(true);
    setMsg(null);
    const res = await removeCoverAction(locale, eventId);
    setBusy(false);
    setUrl(res.ok ? null : url);
    setMsg(res.ok ? "Cover removed." : res.error ?? "Failed");
  }

  return (
    <section className="mt-8 max-w-2xl border-t pt-6">
      <h2 className="text-lg font-semibold">Cover photo</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown on the event card and detail page. JPEG, PNG, or WebP, up to 5 MB.
      </p>

      <div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-border">
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Event cover" className="h-44 w-full object-cover" />
        ) : (
          <div
            className="flex h-44 w-full items-center justify-center text-sm text-muted-foreground"
            style={{ backgroundImage: "var(--gradient-hero)" }}
          >
            No cover photo yet
          </div>
        )}
      </div>

      <div className="mt-3 flex items-center gap-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onUpload(f);
          }}
          className="text-sm"
        />
        {url && (
          <Button type="button" variant="outline" onClick={onRemove} disabled={busy}>
            Remove
          </Button>
        )}
      </div>
      {msg && <p className="mt-2 text-sm text-muted-foreground">{msg}</p>}
    </section>
  );
}
