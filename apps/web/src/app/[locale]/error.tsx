"use client"; // Error boundaries must be Client Components.

import { useEffect } from "react";

import { Button } from "@/components/ui/button";

/**
 * The last stop for an unexpected failure anywhere under /[locale].
 *
 * Without this file every thrown error reached the framework's own error
 * screen: no nav, no branding, and nothing an attendee holding a ticket link
 * could do next. `digest` is the id the server logged the real stack under —
 * shown deliberately, because it is the one thing support can act on.
 */
export default function LocaleError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error("[ui] unhandled error", error);
  }, [error]);

  return (
    <main className="mx-auto max-w-md px-4 py-16 text-center">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
        Something went wrong
      </p>
      <h1 className="mt-2 font-heading text-[32px] leading-[1.05] tracking-[-0.01em]">
        We couldn&rsquo;t load this page
      </h1>
      <p className="mt-3 text-[15px] leading-[1.55] text-muted-foreground">
        The problem is on our side, not with your registration. Try again — if it keeps
        happening, send the organizer the reference below.
      </p>
      <div className="mt-6 flex justify-center">
        <Button size="lg" className="h-11 px-6" onClick={() => unstable_retry()}>
          Try again
        </Button>
      </div>
      {error.digest && (
        <p className="mt-6 font-mono text-xs text-muted-foreground">
          Reference {error.digest}
        </p>
      )}
    </main>
  );
}
