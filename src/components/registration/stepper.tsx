export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  const label = `Step ${current + 1} of ${steps.length} — ${steps[current]}`;

  return (
    // A single live region announces step changes once. The two layouts below
    // are the same information at two breakpoints, so only one is exposed to
    // assistive tech and the other is hidden, otherwise it is announced twice.
    <div aria-label="Registration progress" role="group">
      <p className="sr-only" aria-live="polite">
        {label}
      </p>

      {/* Mobile: segmented progress */}
      <div className="sm:hidden" aria-hidden="true">
        <p className="mb-2 text-sm font-medium">{label}</p>
        <div className="flex gap-1">
          {steps.map((s, i) => (
            <div
              key={s}
              className="h-1 flex-1 rounded-full"
              style={{
                background: i <= current ? "var(--primary)" : "var(--border)",
              }}
            />
          ))}
        </div>
      </div>

      {/* Desktop: node row */}
      <ol className="hidden items-center gap-4 sm:flex" aria-hidden="true">
        {steps.map((s, i) => (
          <li key={s} className="flex items-center gap-2">
            <span
              className="flex size-7 items-center justify-center rounded-full text-xs font-semibold"
              style={
                i <= current
                  ? { backgroundImage: "var(--gradient-hero)", color: "#fff" }
                  : { background: "var(--border)", color: "var(--muted-foreground)" }
              }
            >
              {i + 1}
            </span>
            <span
              className={
                i === current ? "text-sm font-medium" : "text-sm text-muted-foreground"
              }
            >
              {s}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
