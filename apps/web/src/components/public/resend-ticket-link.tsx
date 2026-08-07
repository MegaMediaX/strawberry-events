"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { resendTicketLinkAction } from "@/app/[locale]/(public)/events/[slug]/confirmation/[orderCode]/actions";

/**
 * Offered on the order-code-addressed confirmation page in place of the QR.
 * The action's reply is always the same neutral sentence, so clicking this
 * never confirms whether the code in the URL is real.
 */
export function ResendTicketLink({
  slug,
  orderCode,
}: {
  slug: string;
  orderCode: string;
}) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-center gap-2">
      <Button
        variant="outline"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const res = await resendTicketLinkAction(slug, orderCode);
            setMsg(res.message);
          })
        }
      >
        Email me my ticket link
      </Button>
      {msg && <p className="text-xs text-muted-foreground">{msg}</p>}
    </div>
  );
}
