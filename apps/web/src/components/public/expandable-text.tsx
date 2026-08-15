"use client";

import { useId, useState } from "react";

/**
 * Long prose that must stay fully readable without pushing the page's primary
 * action below the fold.
 *
 * Collapsed it shows `lines` lines; expanded it shows everything. The full text
 * is always in the DOM — the clamp is purely visual — so it stays available to
 * search engines and to screen readers that ignore the clamp.
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
        className={textClassName}
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
