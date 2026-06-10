"use client";

import { buildIcs, googleCalUrl, type CalendarEvent } from "@/lib/calendar/ics";

/**
 * `icsHref`, when provided, points at the server `.ics` route (canonical, works
 * without JS and reflects pretix dates server-side). Without it, falls back to a
 * client-side blob download.
 */
export function AddToCalendar({ event, icsHref }: { event: CalendarEvent; icsHref?: string }) {
  function downloadIcs() {
    const blob = new Blob([buildIcs(event)], { type: "text/calendar" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${event.title.replace(/\s+/g, "-").toLowerCase()}.ics`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mt-2 flex items-center justify-center gap-3 text-xs text-muted-foreground">
      <a
        href={googleCalUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className="underline hover:text-foreground"
      >
        Add to Google
      </a>
      <span aria-hidden>·</span>
      {icsHref ? (
        <a href={icsHref} className="underline hover:text-foreground">
          Download .ics
        </a>
      ) : (
        <button onClick={downloadIcs} className="underline hover:text-foreground">
          Download .ics
        </button>
      )}
    </div>
  );
}
