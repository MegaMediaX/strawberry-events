"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { approveAction, rejectAction } from "./actions";

export function DecisionButtons({
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

  const run = (fn: typeof approveAction) =>
    start(async () => {
      const res = await fn(locale, orderId);
      if (!res.ok) setError(res.error ?? "Failed");
    });

  return (
    <span className="inline-flex items-center gap-2">
      <Button size="sm" disabled={disabled || pending} onClick={() => run(approveAction)}>
        Approve
      </Button>
      <Button
        size="sm"
        variant="outline"
        disabled={disabled || pending}
        onClick={() => run(rejectAction)}
      >
        Reject
      </Button>
      {error && <span className="text-xs text-destructive">{error}</span>}
    </span>
  );
}
