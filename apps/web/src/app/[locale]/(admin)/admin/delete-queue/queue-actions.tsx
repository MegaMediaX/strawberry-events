"use client";

import { useTransition } from "react";
import { Button } from "@/components/ui/button";
import { restoreAction, cancelAction, purgeAction } from "./actions";

export function QueueActions({
  locale, id, status, canPurge,
}: {
  locale: string; id: string; status: string; canPurge: boolean;
}) {
  const [pending, start] = useTransition();
  if (status !== "queued") return null;
  return (
    <span className="inline-flex gap-2">
      <Button size="sm" variant="outline" disabled={pending}
        onClick={() => start(async () => { await restoreAction(locale, id); })}>Restore</Button>
      <Button size="sm" variant="outline" disabled={pending}
        onClick={() => start(async () => { await cancelAction(locale, id); })}>Cancel purge</Button>
      {canPurge && (
        <Button size="sm" variant="outline" disabled={pending}
          onClick={() => start(async () => { await purgeAction(locale, id); })}>Purge now</Button>
      )}
    </span>
  );
}
