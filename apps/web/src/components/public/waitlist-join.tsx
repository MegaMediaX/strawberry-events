"use client";

import { useId, useState, useTransition } from "react";
import { Press } from "@/components/paper/press";
import { Ink, Caption } from "@/components/paper/field";

import { isValidEmail } from "@/lib/registration/email";
import { joinWaitlistAction } from "@/app/[locale]/(public)/events/[slug]/waitlist-actions";

export function WaitlistJoin({ eventId }: { eventId: string }) {
  const id = useId();
  const emailId = `${id}-email`;
  const statusId = `${id}-status`;
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  // Success and failure used to render into the same muted grey paragraph:
  // "You're on the waitlist (position 4)" and "Could not join" looked
  // identical, and neither was announced.
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);

  const joined = result?.ok === true;

  function join() {
    if (!isValidEmail(email)) {
      setResult({ ok: false, text: "Enter an email address we can reach you at." });
      return;
    }
    start(async () => {
      const res = await joinWaitlistAction(eventId, email);
      setResult(
        res.ok
          ? {
              ok: true,
              text: `You're on the waitlist at position ${res.position}. We'll email ${email} if a spot opens.`,
            }
          : { ok: false, text: res.error ?? "We couldn't add you to the waitlist." },
      );
    });
  }

  return (
    <div className="rounded-[var(--radius-lg)] border border-border p-4">
      <div className="font-medium">This event is full — join the waitlist</div>
      {joined ? (
        // The form stayed live after a successful join, filled in and inviting
        // a second submission of the same address.
        <p id={statusId} role="status" className="mt-2 text-sm font-medium">
          {result.text}
        </p>
      ) : (
        <>
          <div className="mt-2 flex flex-col gap-1.5">
            <Caption htmlFor={emailId}>Your email</Caption>
            <div className="flex gap-2">
              <Ink
                id={emailId}
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                aria-invalid={result?.ok === false || undefined}
                aria-describedby={result ? statusId : undefined}
                className="h-11"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
              <Press
                className="h-11 shrink-0 px-5"
                disabled={pending || !email}
                onClick={join}
              >
                {pending ? "Joining…" : "Join"}
              </Press>
            </div>
          </div>
          {result && (
            <p
              id={statusId}
              role="status"
              className="mt-2 text-sm font-medium text-destructive-text"
            >
              {result.text}
            </p>
          )}
        </>
      )}
    </div>
  );
}
