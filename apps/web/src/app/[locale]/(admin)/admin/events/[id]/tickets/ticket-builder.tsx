"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createTicketAction } from "../../actions";

export function TicketBuilder({
  locale,
  eventId,
}: {
  locale: string;
  eventId: string;
}) {
  const router = useRouter();
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [price, setPrice] = useState("0.00");
  const [quota, setQuota] = useState("100");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setError(null);
    setBusy(true);
    const res = await createTicketAction(locale, eventId, {
      titleEn,
      titleAr: titleAr || null,
      priceCents: Math.round(parseFloat(price || "0") * 100),
      quotaSize: quota === "" ? null : parseInt(quota, 10),
    });
    setBusy(false);
    if (res?.error) {
      setError(res.error);
      return;
    }
    if (res?.fieldErrors) {
      setError(Object.values(res.fieldErrors).flat().join(", "));
      return;
    }
    setTitleEn("");
    setTitleAr("");
    setPrice("0.00");
    setQuota("100");
    router.refresh();
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-3 font-semibold">Add ticket</h2>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Title (EN)</Label>
          <Input value={titleEn} onChange={(e) => setTitleEn(e.target.value)} />
        </div>
        <div>
          <Label>Title (ع)</Label>
          <Input dir="rtl" value={titleAr} onChange={(e) => setTitleAr(e.target.value)} />
        </div>
        <div>
          <Label>Price (USD)</Label>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <Label>Quota (blank = unlimited)</Label>
          <Input value={quota} onChange={(e) => setQuota(e.target.value)} />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <Button className="mt-4" onClick={add} disabled={busy || !titleEn}>
        Add ticket
      </Button>
    </div>
  );
}
