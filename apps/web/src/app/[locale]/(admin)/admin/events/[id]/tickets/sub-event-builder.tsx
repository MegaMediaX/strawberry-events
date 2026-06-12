"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { createSubEventAction } from "../../actions";

export function SubEventBuilder({
  locale,
  eventId,
}: {
  locale: string;
  eventId: string;
}) {
  const router = useRouter();
  const [titleEn, setTitleEn] = useState("");
  const [titleAr, setTitleAr] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [price, setPrice] = useState("0.00");
  const [maxAttendees, setMaxAttendees] = useState("");
  const [ticketsPerUser, setTicketsPerUser] = useState("1");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function add() {
    setError(null);
    setBusy(true);
    const res = await createSubEventAction(locale, eventId, {
      titleEn,
      titleAr: titleAr || null,
      category,
      location: location || null,
      dateFrom,
      dateTo,
      priceCents: Math.round(parseFloat(price || "0") * 100),
      maxAttendees: maxAttendees === "" ? null : parseInt(maxAttendees, 10),
      ticketsPerUser: parseInt(ticketsPerUser || "1", 10),
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
    setCategory("");
    setLocation("");
    setDateFrom("");
    setDateTo("");
    setPrice("0.00");
    setMaxAttendees("");
    setTicketsPerUser("1");
    toast.success("Sub-event added");
    router.refresh();
  }

  return (
    <div className="rounded-lg border p-4">
      <h2 className="mb-3 font-semibold">Add sub-event</h2>
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
          <Label>Category</Label>
          <Input value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <div>
          <Label>Location</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />
        </div>
        <div>
          <Label>Date from</Label>
          <Input
            type="datetime-local"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
          />
        </div>
        <div>
          <Label>Date to</Label>
          <Input
            type="datetime-local"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </div>
        <div>
          <Label>Price (USD)</Label>
          <Input value={price} onChange={(e) => setPrice(e.target.value)} />
        </div>
        <div>
          <Label>Max attendees (blank = unlimited)</Label>
          <Input
            value={maxAttendees}
            onChange={(e) => setMaxAttendees(e.target.value)}
          />
        </div>
        <div>
          <Label>Tickets per user</Label>
          <Input
            value={ticketsPerUser}
            onChange={(e) => setTicketsPerUser(e.target.value)}
          />
        </div>
      </div>
      {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
      <Button
        className="mt-4"
        onClick={add}
        disabled={busy || !titleEn || !category || !dateFrom || !dateTo}
      >
        Add sub-event
      </Button>
    </div>
  );
}
