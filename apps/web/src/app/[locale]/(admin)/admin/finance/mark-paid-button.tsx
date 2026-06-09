"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { markPaidAction } from "./actions";

export function MarkPaidButton({
  locale,
  orderId,
  disabled,
}: {
  locale: string;
  orderId: string;
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
            const res = await markPaidAction(locale, orderId);
            if (!res.ok) setError(res.error ?? "Failed");
          })
        }
      >
        {pending ? "…" : "Mark paid"}
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
