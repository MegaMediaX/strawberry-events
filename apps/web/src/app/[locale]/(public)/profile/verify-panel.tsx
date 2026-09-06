"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { sendMyVerificationCode, verifyMyEmail } from "./verify-actions";

/**
 * The route out of the gap: 68 of 74 accounts are unverified, and until now the
 * only way to get a code was to submit your existing address at signup and
 * click "Send a new code" — real, but nobody would find it.
 *
 * Verification is not required to sign in or to hold a ticket, so this states
 * what it is FOR rather than nagging. It is what lets future registrations
 * attach to the account by themselves.
 */
export function VerifyEmailPanel({
  locale,
  email,
  verified,
}: {
  locale: string;
  email: string;
  verified: boolean;
}) {
  const [pending, start] = useTransition();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (verified || done) {
    return (
      <section className="mt-8 rounded-md border border-border p-4">
        <h2 className="text-sm font-semibold">Email address</h2>
        <p className="mt-1 text-sm">
          <span className="font-medium">{email}</span>{" "}
          <span className="text-muted-foreground">· verified</span>
        </p>
        <p className="mt-2 text-xs text-muted-foreground">
          Registrations you make with this address will appear here automatically.
        </p>
      </section>
    );
  }

  return (
    <section className="mt-8 rounded-md border border-border p-4">
      <h2 className="text-sm font-semibold">Email address</h2>
      <p className="mt-1 text-sm">
        <span className="font-medium">{email}</span>{" "}
        <span className="text-muted-foreground">· not verified</span>
      </p>
      <p className="mt-2 text-xs text-muted-foreground">
        Verifying is optional — your tickets work either way. It lets future registrations you
        make with this address appear here on their own.
      </p>

      {!sent ? (
        <Button
          className="mt-3"
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await sendMyVerificationCode(locale);
              if (!res.ok) setError(res.error ?? "Could not send a code.");
              else setSent(true);
            })
          }
        >
          Send me a code
        </Button>
      ) : (
        <div className="mt-3 flex flex-col gap-2">
          <Label htmlFor="verify-code">6-digit code</Label>
          <Input
            id="verify-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              disabled={pending || code.length !== 6}
              onClick={() =>
                start(async () => {
                  setError(null);
                  const res = await verifyMyEmail(locale, code);
                  if (!res.ok) setError(res.error ?? "That code isn't right.");
                  else setDone(true);
                })
              }
            >
              Verify
            </Button>
            <button
              type="button"
              className="text-xs text-primary underline-offset-4 hover:underline disabled:opacity-50"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  setError(null);
                  await sendMyVerificationCode(locale);
                })
              }
            >
              Send another
            </button>
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
    </section>
  );
}
