export function Stepper({
  steps,
  current,
}: {
  steps: string[];
  current: number;
}) {
  return (
    <div>
      {/* Mobile: segmented progress */}
      <div className="sm:hidden">
        <p className="mb-2 text-sm font-medium">
          Step {current + 1} of {steps.length} — {steps[current]}
        </p>
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
      <ol className="hidden items-center gap-4 sm:flex">
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
