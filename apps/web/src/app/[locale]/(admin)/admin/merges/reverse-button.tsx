"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reverseAction } from "./actions";

export function ReverseButton({ locale, eventId }: { locale: string; eventId: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Reverse
      </Button>
    );
  }

  return (
    <div className="flex w-full flex-col gap-2">
      <Input
        value={reason}
        placeholder="Why is this being reversed?"
        onChange={(e) => setReason(e.target.value)}
      />
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant="destructive"
          disabled={pending || !reason.trim()}
          onClick={() =>
            start(async () => {
              setError(null);
              const res = await reverseAction(locale, eventId, reason);
              if (!res.ok) setError(res.error ?? "Failed.");
              else setOpen(false);
            })
          }
        >
          Confirm reverse
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={pending}>
          Cancel
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
