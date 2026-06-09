"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { promoteAction } from "./actions";

export function PromoteButton({
  locale,
  eventId,
  entryId,
  disabled,
}: {
  locale: string;
  eventId: string;
  entryId: string;
  disabled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start">
      <Button
        size="sm"
        disabled={disabled || pending}
        onClick={() =>
          start(async () => {
            const res = await promoteAction(locale, eventId, entryId);
            if (!res.ok) setError(res.error ?? "Failed");
          })
        }
      >
        {pending ? "…" : "Promote"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
