"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { claimTicketAction } from "./claim-actions";

/**
 * Shown above the ticket. Two states only, because there is nothing to decide:
 * holding this link is already proof, so a signed-in person gets one button and
 * a signed-out person gets a sentence.
 */
export function ClaimBanner({
  locale,
  token,
  signedIn,
  alreadyMine,
}: {
  locale: string;
  token: string;
  signedIn: boolean;
  alreadyMine: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  if (alreadyMine || saved) {
    return (
      <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm">
        <span className="font-medium">Saved to your account.</span>{" "}
        <Link
          href={`/${locale}/my-registrations`}
          className="text-primary underline-offset-4 hover:underline"
        >
          See your registrations
        </Link>
      </div>
    );
  }

  if (!signedIn) {
    return (
      <div className="mb-4 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
        <Link
          href={`/${locale}/login`}
          className="font-medium text-primary underline-offset-4 hover:underline"
        >
          Sign in
        </Link>{" "}
        and open this link again to keep this ticket in an account. Your ticket works either
        way — nothing here expires.
      </div>
    );
  }

  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-muted/40 p-3 text-sm">
      <div>
        <span className="font-medium">Keep this ticket in your account</span>
        <p className="text-muted-foreground">
          Next time we&apos;ll fill the registration form in for you.
        </p>
        {error && <p className="mt-1 text-destructive">{error}</p>}
      </div>
      <Button
        size="sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const res = await claimTicketAction(locale, token);
            if (!res.ok) setError(res.error ?? "Could not save this ticket.");
            else setSaved(true);
          })
        }
      >
        Save to my account
      </Button>
    </div>
  );
}
