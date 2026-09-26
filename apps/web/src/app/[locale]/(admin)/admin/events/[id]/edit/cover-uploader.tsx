"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { coverFocus, safeCropBox, type CoverFocus } from "@/lib/events/cover-focus";
import { uploadCoverAction, removeCoverAction, setCoverFocusAction } from "./cover-actions";

/**
 * The only crop left: the listing card's 16/9 thumbnail (event-card.tsx).
 *
 * This was 16/6, the ratio the homepage feature and the event page used to cut
 * every cover to. Both now show the poster WHOLE (poster.tsx), so previewing a
 * 16/6 crop would tell an organiser that part of their poster is lost when it
 * is not — and hide the crop the grid card really does apply.
 */
const CARD_RATIO = 16 / 9;

export function CoverUploader({
  locale,
  eventId,
  initialUrl,
  initialSize,
  initialFocus,
}: {
  locale: string;
  eventId: string;
  initialUrl: string | null;
  /** The cover's own pixel size, when it is known. */
  initialSize: { width: number; height: number } | null;
  initialFocus: CoverFocus;
}) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [size, setSize] = useState(initialSize);
  const [focus, setFocus] = useState<CoverFocus>(initialFocus);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  /**
   * Choose what survives the crop, by pointing at it.
   *
   * Saved on the click rather than behind a Save button: this is one value,
   * it is instantly visible, and the box redraws under the cursor — a form
   * around it would be more ceremony than the decision deserves.
   */
  async function setFocusTo(next: CoverFocus) {
    setFocus(next);
    const res = await setCoverFocusAction(locale, eventId, next.x, next.y);
    if (res.ok && res.focus) setFocus(res.focus);
    else toast.error(res.error ?? "Could not save the focal point");
  }

  function onPick(e: React.MouseEvent<HTMLElement>) {
    // Enter and Space fire a click with no pointer behind it (detail 0). Its
    // clientX/clientY are 0, which would silently slam the focal point into
    // the top-left corner — so the keyboard path is the arrow keys, below.
    if (e.detail === 0) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (!box.width || !box.height) return;
    void setFocusTo(
      coverFocus(
        ((e.clientX - box.left) / box.width) * 100,
        ((e.clientY - box.top) / box.height) * 100,
      ),
    );
  }

  /** The same choice from a keyboard, which a click target alone does not give. */
  function onKey(e: React.KeyboardEvent<HTMLElement>) {
    const step = e.shiftKey ? 10 : 2;
    const move: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const delta = move[e.key];
    if (!delta) return;
    e.preventDefault();
    void setFocusTo(coverFocus(focus.x + delta[0], focus.y + delta[1]));
  }

  const crop = safeCropBox(size, focus, CARD_RATIO);

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
      setSize(res.size ?? null);
      // A new picture is a new crop: the server reset the focus to centre and
      // the picker follows, rather than drawing the old event's box over it.
      setFocus(res.focus ?? { x: 50, y: 50 });
      setMsg("Cover updated.");
      toast.success("Cover updated");
    } else {
      setMsg(res.error ?? "Upload failed");
      toast.error(res.error ?? "Upload failed");
    }
    if (inputRef.current) inputRef.current.value = "";
  }

  async function onRemove() {
    setBusy(true);
    setMsg(null);
    const res = await removeCoverAction(locale, eventId);
    setBusy(false);
    setUrl(res.ok ? null : url);
    if (res.ok) {
      setSize(null);
      setFocus({ x: 50, y: 50 });
    }
    setMsg(res.ok ? "Cover removed." : res.error ?? "Failed");
    if (res.ok) toast.success("Cover removed");
    else toast.error(res.error ?? "Failed");
  }

  return (
    <section className="mt-8 max-w-2xl border-t pt-6">
      <h2 className="text-lg font-semibold">Cover photo</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Shown full-width on the event page and on the events index. JPEG, PNG, or
        WebP, up to 5 MB. Landscape works best — a tall photo loses most of its
        height to the frame.
      </p>

      <div className="mt-4 overflow-hidden rounded-[var(--radius-lg)] border border-border text-center">
        {url ? (
          /* The whole image, with the surviving area lit and the rest dimmed.
             Showing it already cropped would hide the thing the organiser is
             here to decide: what is being LOST. */
          <button
            type="button"
            onClick={onPick}
            onKeyDown={onKey}
            aria-label={`Focal point: ${focus.x}% across, ${focus.y}% down. Click the part of the photo that must stay in frame, or use the arrow keys.`}
            /* INLINE-BLOCK, so the button shrinks to the picture itself.
               With a full-width button and an object-contain image, every
               overlay percentage below is a percentage of the BUTTON — and the
               letterbox bars are part of that, so the crop box was drawn
               across grey nothing and the marker landed somewhere the
               photograph was not. Caught by screenshot. Sized by the image,
               all the arithmetic is in the image's own coordinates, which is
               what safeCropBox returns. */
            className="relative inline-block max-w-full cursor-crosshair align-top outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="Event cover" className="block max-h-80 max-w-full" />

            {crop && (
              <>
                <div aria-hidden="true" className="pointer-events-none absolute inset-0 bg-black/55" />
                {/* The same image again, clipped to exactly the surviving
                    window — so the lit area is the real pixels, not a
                    rectangle drawn near them. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  aria-hidden="true"
                  src={url}
                  alt=""
                  className="pointer-events-none absolute inset-0 h-full w-full"
                  style={{
                    clipPath: `inset(${crop.top}% ${100 - crop.left - crop.width}% ${
                      100 - crop.top - crop.height
                    }% ${crop.left}%)`,
                  }}
                />
                <div
                  aria-hidden="true"
                  className="pointer-events-none absolute border-2 border-white"
                  style={{
                    left: `${crop.left}%`,
                    top: `${crop.top}%`,
                    width: `${crop.width}%`,
                    height: `${crop.height}%`,
                  }}
                />
              </>
            )}

            <span
              aria-hidden="true"
              className="pointer-events-none absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-[var(--primary)]"
              style={{ left: `${focus.x}%`, top: `${focus.y}%` }}
            />
          </button>
        ) : (
          <div
            className="flex h-44 w-full items-center justify-center text-sm text-muted-foreground"
            style={{ backgroundImage: "var(--gradient-hero)" }}
          >
            No cover photo yet
          </div>
        )}
      </div>

      {url && (
        <p className="mt-2 text-sm text-muted-foreground">
          {crop ? (
            <>
              The lit area is what shows on the event&apos;s listing card; the
              event page and the homepage feature show the whole poster. Click the
              part that must stay in frame, or focus the photo and use the arrow
              keys.{" "}
              {crop.height < 99.5 && `Keeps ${Math.round(crop.height)}% of the height.`}
              {crop.width < 99.5 && `Keeps ${Math.round(crop.width)}% of the width.`}
            </>
          ) : (
            // Honest rather than decorative: without the file's size there is
            // no way to say which part survives, so nothing is promised.
            "This cover was uploaded before crop previews existed. Re-upload it to choose a focal point."
          )}
        </p>
      )}

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
