"use client";

import * as React from "react";
import { Check } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Consent checkbox with a 48px hit row.
 *
 * The real <input> stays in the DOM and keeps native semantics and keyboard
 * behaviour — it is visually hidden rather than replaced, and the styled box is
 * aria-hidden. Replacing it with a div+role would have meant reimplementing
 * space-to-toggle and form participation for no gain.
 */
export function Checkbox({
  checked,
  onCheckedChange,
  children,
  id,
  className,
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  children: React.ReactNode;
  id?: string;
  className?: string;
}) {
  const generated = React.useId();
  const inputId = id ?? generated;

  return (
    <div className={cn("flex min-h-12 items-center", className)}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="peer sr-only"
      />
      {/* The focus styles hang off the label, not the box: peer-* compiles to a
          sibling combinator, and only the label is a sibling of the input. The
          child selector then reaches the box. */}
      <label
        htmlFor={inputId}
        className={cn(
          "flex cursor-pointer items-center gap-3 text-sm leading-snug select-none",
          "peer-focus-visible:[&>span:first-child]:border-ring",
          "peer-focus-visible:[&>span:first-child]:ring-3",
          "peer-focus-visible:[&>span:first-child]:ring-ring/50",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border-2 transition-colors",
            checked
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border bg-card",
          )}
        >
          {checked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        <span>{children}</span>
      </label>
    </div>
  );
}
