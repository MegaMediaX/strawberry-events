/**
 * Sticky step ribbon.
 *
 * Replaces the previous numbered-pill row: the pills spent a full line of
 * vertical space restating labels the user had already read, and disagreed
 * with the mobile progress bar about what the step system even looked like.
 * One treatment now, at both breakpoints.
 */
export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  const label = `Step ${current + 1} of ${steps.length} — ${steps[current]}`;

  return (
    <div
      className="sticky top-0 z-30 -mx-4 border-b border-border bg-background/92 px-4 backdrop-blur"
      role="group"
      aria-label="Registration progress"
    >
      {/* One live region for the whole stepper. The visual layers below are
          aria-hidden so a step change is announced exactly once. */}
      <p className="sr-only" aria-live="polite">
        {label}
      </p>

      <div
        className="flex h-11 items-center justify-between gap-3"
        aria-hidden="true"
      >
        <span className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase tabular-nums">
          Step {current + 1} / {steps.length}
        </span>
        <span className="truncate text-[15px] font-medium">{steps[current]}</span>
      </div>

      <div className="flex gap-1 pb-2" aria-hidden="true">
        {steps.map((s, i) => (
          <div
            key={s}
            className="h-[2px] flex-1 rounded-full transition-colors duration-200"
            style={{
              background: i <= current ? "var(--primary)" : "var(--border)",
            }}
          />
        ))}
      </div>
    </div>
  );
}
