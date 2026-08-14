/**
 * Section label for the events index.
 *
 * Deliberately quiet. An earlier pass set "What's on" as a 44px serif display,
 * which left the index's own generic label visually outranking the event being
 * sold — the abstract heading dominating the actual product. The event title is
 * the page's headline; this is just the rule above it.
 *
 * It also no longer repeats "Strawberry Agency Events", which the site header states
 * ~100px higher up.
 */
export function EventsHeroBanner({
  openCount,
  comingSoonCount,
}: {
  openCount: number;
  comingSoonCount: number;
}) {
  const parts: string[] = ["What's on"];
  if (openCount > 0) {
    parts.push(`${openCount} ${openCount === 1 ? "event" : "events"}`);
  }
  if (comingSoonCount > 0) parts.push(`${comingSoonCount} coming soon`);

  return (
    <header className="border-b border-border pt-2 pb-3 sm:pt-6">
      {/* Still the page's h1 even though it is visually quiet — demoting the
          type must not delete the document outline. The event titles below are
          h2s beneath it. */}
      <h1 className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase tabular-nums">
        {parts.join(" · ")}
      </h1>
    </header>
  );
}
