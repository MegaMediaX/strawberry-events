"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { resendEmailAction } from "../actions";

export function ResendButton({ id, canResend }: { id: string; canResend: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  if (!canResend) {
    return <p className="text-sm text-muted-foreground">You do not have permission to resend.</p>;
  }

  async function resend() {
    setBusy(true);
    setMsg(null);
    const res = await resendEmailAction(id);
    setBusy(false);
    if (!res.ok) return setMsg(res.error ?? "Failed");
    setMsg(res.sent ? "Resent." : "Logged, but email is disabled in this environment (not sent).");
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      <Button type="button" onClick={resend} disabled={busy}>
        {busy ? "Resending…" : "Resend email"}
      </Button>
      {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
    </div>
  );
}
