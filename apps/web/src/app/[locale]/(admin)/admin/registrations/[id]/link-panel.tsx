"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { linkAction, unlinkAction } from "./merge-actions";

/**
 * Deliberately no confirmation dialog on unlink.
 *
 * This is used at a door with a queue behind the person. An operator who has
 * been told a registration is on the wrong account needs one click, and every
 * unlink is reversible from the ledger anyway — a modal buys nothing here and
 * costs seconds when seconds are the whole problem.
 *
 * The reason field is required instead. It is what an audit actually needs, and
 * typing it is the pause a confirm dialog was pretending to be.
 */
export function LinkPanel({
  locale,
  orderId,
  isLinked,
  currentEmail,
}: {
  locale: string;
  orderId: string;
  isLinked: boolean;
  currentEmail: string | null;
}) {
  const [pending, start] = useTransition();
  const [email, setEmail] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  function run(fn: () => Promise<{ ok: boolean; error?: string }>, okMessage: string) {
    setError(null);
    setDone(null);
    start(async () => {
      const res = await fn();
      if (!res.ok) {
        setError(res.error ?? "Failed.");
        return;
      }
      setDone(okMessage);
      setEmail("");
      setReason("");
    });
  }

  return (
    <div className="mt-4 flex flex-col gap-3 border-t border-border pt-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="reason">Reason (recorded)</Label>
        <Input
          id="reason"
          value={reason}
          placeholder="e.g. identity checked at the desk"
          onChange={(e) => setReason(e.target.value)}
        />
      </div>

      {isLinked ? (
        <div className="flex flex-col gap-2">
          <Button
            variant="destructive"
            disabled={pending || !reason.trim()}
            onClick={() =>
              run(() => unlinkAction(locale, orderId, reason), `Unlinked from ${currentEmail ?? "the account"}.`)
            }
          >
            Unlink from this account
          </Button>
          <p className="text-xs text-muted-foreground">
            The registration keeps its ticket, QR and badge role. Only who owns it changes.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <Label htmlFor="email">Link to account</Label>
          <Input
            id="email"
            type="email"
            value={email}
            placeholder="attendee@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
          <Button
            disabled={pending || !email.trim() || !reason.trim()}
            onClick={() => run(() => linkAction(locale, orderId, email, reason), "Linked.")}
          >
            Link
          </Button>
        </div>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      {done && <p className="text-sm text-muted-foreground">{done}</p>}
    </div>
  );
}
