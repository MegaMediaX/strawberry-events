"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { joinWaitlistAction } from "@/app/[locale]/(public)/events/[slug]/waitlist-actions";

export function WaitlistJoin({ eventId }: { eventId: string }) {
  const [email, setEmail] = useState("");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="rounded-[var(--radius-lg)] border border-border p-4">
      <div className="font-medium">This event is full — join the waitlist</div>
      <div className="mt-2 flex gap-2">
        <Input
          type="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <Button
          disabled={pending || !email}
          onClick={() =>
            start(async () => {
              const res = await joinWaitlistAction(eventId, email);
              setMsg(
                res.ok
                  ? `You're on the waitlist (position ${res.position}). We'll email you if a spot opens.`
                  : (res.error ?? "Could not join"),
              );
            })
          }
        >
          Join
        </Button>
      </div>
      {msg && <p className="mt-2 text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
