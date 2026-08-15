import * as React from "react"

import { cn } from "@/lib/utils"

/**
 * Multi-line counterpart to `Input`, sharing its border, focus ring and
 * invalid states so the two sit together in a form without drifting apart.
 *
 * Exists because descriptions that render as a list need real newlines, and a
 * single-line `<input>` cannot hold one. Anything rendered through
 * `ExpandableText` preserves those newlines, so what is typed here is what the
 * attendee reads.
 */
function Textarea({ className, rows = 5, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      rows={rows}
      className={cn(
        "field-sizing-content min-h-20 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
