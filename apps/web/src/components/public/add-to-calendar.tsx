"use client";

import { buildIcs, googleCalUrl, type CalendarEvent } from "@/lib/calendar/ics";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const btnClass = cn(
  buttonVariants({ variant: "outline", size: "sm" }),
  "flex-1 gap-2",
);

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden>
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.84 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.18a11 11 0 0 0 0 9.88l3.66-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.06l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z"
      />
    </svg>
  );
}

function AppleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" fill="currentColor" aria-hidden>
      <path d="M17.05 12.04c-.03-2.62 2.14-3.88 2.24-3.94-1.22-1.79-3.12-2.03-3.79-2.06-1.61-.16-3.15.95-3.97.95-.82 0-2.08-.93-3.42-.9-1.76.02-3.38 1.02-4.29 2.6-1.83 3.18-.47 7.88 1.31 10.46.87 1.26 1.91 2.68 3.28 2.63 1.31-.05 1.81-.85 3.4-.85 1.58 0 2.03.85 3.42.82 1.41-.02 2.31-1.29 3.17-2.56 1-1.47 1.41-2.89 1.43-2.96-.03-.01-2.75-1.05-2.78-4.17ZM14.54 4.13c.72-.88 1.21-2.1 1.08-3.31-1.04.04-2.3.69-3.05 1.56-.67.78-1.25 2.02-1.09 3.21 1.16.09 2.34-.59 3.06-1.46Z" />
    </svg>
  );
}

/**
 * `icsHref`, when provided, points at the server `.ics` route (canonical, works
 * without JS and reflects pretix dates server-side). Without it, falls back to a
 * client-side blob download. The `.ics` file opens in Apple Calendar by default.
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
    <div className="mt-3 flex items-center gap-2">
      <a
        href={googleCalUrl(event)}
        target="_blank"
        rel="noopener noreferrer"
        className={btnClass}
      >
        <GoogleIcon />
        Google Calendar
      </a>
      {icsHref ? (
        <a href={icsHref} className={btnClass}>
          <AppleIcon />
          Apple Calendar
        </a>
      ) : (
        <button type="button" onClick={downloadIcs} className={btnClass}>
          <AppleIcon />
          Apple Calendar
        </button>
      )}
    </div>
  );
}
