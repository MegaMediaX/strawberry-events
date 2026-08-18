"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { registerWebhookAction } from "./actions";

export function RegisterWebhookButton({ locale, eventId }: { locale: string; eventId: string }) {
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await registerWebhookAction(locale, eventId);
      setMsg(res.message);
    } catch (err) {
      // A rejecting server action must never fail silently — that is how the
      // tickets Save button looked broken for a day.
      setMsg(`Could not register: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <Button type="button" onClick={run} disabled={busy}>
        {busy ? "Registering…" : "Register webhook in pretix"}
      </Button>
      {msg && <p className="mt-2 text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
