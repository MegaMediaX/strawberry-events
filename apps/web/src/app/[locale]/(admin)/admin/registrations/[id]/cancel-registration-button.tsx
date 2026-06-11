"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelRegistrationAction } from "./cancel-actions";

/**
 * Guarded cancel control: requires an explicit confirm click before firing
 * (cancellation is irreversible from the UI — it transitions the order to
 * canceled in pretix + locally and releases the seat). Never hard-deletes.
 */
export function CancelRegistrationButton({
  locale,
  orderId,
}: {
  locale: string;
  orderId: string;
}) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function doCancel() {
    setBusy(true);
    setError(null);
    const res = await cancelRegistrationAction(locale, orderId);
    setBusy(false);
    if (res.ok) {
      setConfirming(false);
      router.refresh();
    } else {
      setError(res.error ?? "Failed");
    }
  }

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="rounded-md border border-destructive/40 px-3 py-1.5 text-destructive hover:bg-destructive/10"
      >
        Cancel registration
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={doCancel}
        disabled={busy}
        className="rounded-md bg-destructive px-3 py-1.5 font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
      >
        {busy ? "Canceling…" : "Confirm cancel"}
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        disabled={busy}
        className="rounded-md border border-border px-3 py-1.5 hover:bg-muted"
      >
        Keep
      </button>
      {error && <span className="text-destructive">{error}</span>}
    </span>
  );
}
