"use client";

import { useId, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * Long prose that must stay fully readable without pushing the page's primary
 * action below the fold.
 *
 * Collapsed it shows `lines` lines; expanded it shows everything. The full text
 * is always in the DOM — the clamp is purely visual — so it stays available to
 * search engines and to screen readers that ignore the clamp.
 *
 * Newlines are preserved. Organisers write these as a list of points, and HTML
 * would otherwise collapse every line break into a space and serve one run-on
 * sentence. Consecutive spaces still collapse, so text pasted from a document
 * does not arrive full of stray gaps.
 *
 * `whitespace-pre-line` is applied to the element rather than folded into the
 * `textClassName` default, so a caller restyling the text cannot accidentally
 * drop it — which is exactly what the sub-event picker's override would have
 * done.
 */
export function ExpandableText({
  text,
  lines = 3,
  className,
  textClassName = "max-w-[52ch] text-[15px] leading-[1.55] text-muted-foreground",
}: {
  text: string;
  lines?: number;
  className?: string;
  textClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const id = useId();

  return (
    <div className={className}>
      <p
        id={id}
        className={cn("whitespace-pre-line", textClassName)}
        style={
          open
            ? undefined
            : {
                display: "-webkit-box",
                WebkitLineClamp: lines,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              }
        }
      >
        {text}
      </p>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="mt-1 inline-flex min-h-10 items-center text-[13px] font-semibold tracking-[0.04em] text-primary uppercase underline-offset-4 outline-none hover:underline focus-visible:underline"
      >
        {open ? "Show less" : "Read more"}
      </button>
    </div>
  );
}
