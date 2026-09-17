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
 *
 * It used to be the page's h1 as well — quiet type, top billing — which meant
 * the index's generic label outranked the event being sold in the document
 * outline too, not just visually. The featured event's title card carries the
 * h1 now (`featured-event-plate.tsx`, or the empty state when nothing is
 * open); this is the rule above the frame and nothing more.
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
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase tabular-nums">
        {parts.join(" · ")}
      </p>
    </header>
  );
}
