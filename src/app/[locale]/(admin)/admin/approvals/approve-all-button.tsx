"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { approveAllAction } from "./actions";

export function ApproveAllButton({
  locale,
  count,
  disabled,
}: {
  locale: string;
  count: number;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    if (!confirm(`Approve all ${count} pending registration(s)?`)) return;
    start(async () => {
      const res = await approveAllAction(locale);
      if (!res.ok) {
        toast.error(res.error ?? "Failed");
        return;
      }
      const skipped = res.skipped ?? 0;
      toast.success(
        skipped > 0
          ? `Approved ${res.approved}, ${skipped} skipped`
          : `Approved ${res.approved}`,
      );
      router.refresh();
    });
  }

  return (
    <Button size="sm" disabled={disabled || pending} onClick={run}>
      {pending ? "Approving…" : `Approve all (${count})`}
    </Button>
  );
}
