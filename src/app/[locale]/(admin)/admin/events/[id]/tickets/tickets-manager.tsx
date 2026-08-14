"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "@/components/ui/toast";
import { centsToPrice } from "@/lib/pretix/mappers";
import { InviteControls } from "./invite-controls";
import { saveTicketsAction } from "../../actions";

/** A ticket row in the editor. Saved rows have a positive numeric `id`
 *  (the pretix item id); newly added rows use a negative temp id. */
interface TicketRow {
  id: number;
  titleEn: string;
  titleAr: string;
  price: string; // dollars, as typed
  quota: string; // blank = unlimited
}

interface SubRow {
  id: string; // saved cuid, or "new-N" for additions
  titleEn: string;
  titleAr: string;
  category: string;
  location: string;
  dateFrom: string; // datetime-local value
  dateTo: string;
  price: string;
  maxAttendees: string;
  ticketsPerUser: string;
}

export interface InitialTicket {
  id: number;
  titleEn: string;
  titleAr: string | null;
  priceCents: number;
  quotaSize: number | null;
}

export interface InitialSubEvent {
  id: string;
  titleEn: string;
  titleAr: string | null;
  category: string;
  location: string | null;
  dateFrom: string; // ISO
  dateTo: string; // ISO
  priceCents: number;
  maxAttendees: number | null;
  ticketsPerUser: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
// Render a stored UTC instant as the admin's LOCAL wall-clock for the
// datetime-local input, so the value round-trips without a timezone shift
// (the browser interprets datetime-local as local time).
const toLocalInput = (iso: string) => {
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};
const centsField = (c: number) => (c / 100).toFixed(2);

function ticketFrom(t: InitialTicket): TicketRow {
  return {
    id: t.id,
    titleEn: t.titleEn,
    titleAr: t.titleAr ?? "",
    price: centsField(t.priceCents),
    quota: t.quotaSize == null ? "" : String(t.quotaSize),
  };
}

function subFrom(s: InitialSubEvent): SubRow {
  return {
    id: s.id,
    titleEn: s.titleEn,
    titleAr: s.titleAr ?? "",
    category: s.category,
    location: s.location ?? "",
    dateFrom: toLocalInput(s.dateFrom),
    dateTo: toLocalInput(s.dateTo),
    price: centsField(s.priceCents),
    maxAttendees: s.maxAttendees == null ? "" : String(s.maxAttendees),
    ticketsPerUser: String(s.ticketsPerUser),
  };
}

const ticketInput = (t: TicketRow) => ({
  titleEn: t.titleEn,
  titleAr: t.titleAr || null,
  priceCents: Math.round(parseFloat(t.price || "0") * 100),
  quotaSize: t.quota === "" ? null : parseInt(t.quota, 10),
});

const subInput = (s: SubRow) => ({
  titleEn: s.titleEn,
  titleAr: s.titleAr || null,
  category: s.category,
  location: s.location || null,
  dateFrom: s.dateFrom,
  dateTo: s.dateTo,
  priceCents: Math.round(parseFloat(s.price || "0") * 100),
  maxAttendees: s.maxAttendees === "" ? null : parseInt(s.maxAttendees, 10),
  ticketsPerUser: parseInt(s.ticketsPerUser || "1", 10),
});

export function TicketsManager({
  locale,
  eventId,
  initialTickets,
  initialSubEvents,
  inviteOnlyItemIds,
}: {
  locale: string;
  eventId: string;
  initialTickets: InitialTicket[];
  initialSubEvents: InitialSubEvent[];
  inviteOnlyItemIds: number[];
}) {
  const router = useRouter();
  const [tickets, setTickets] = useState<TicketRow[]>(initialTickets.map(ticketFrom));
  const [subs, setSubs] = useState<SubRow[]>(initialSubEvents.map(subFrom));
  const [removedTickets, setRemovedTickets] = useState<{ itemId: number; label: string }[]>([]);
  const [removedSubs, setRemovedSubs] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [nextTemp, setNextTemp] = useState(-1);
  const [nextSub, setNextSub] = useState(1);

  function patchTicket(id: number, p: Partial<TicketRow>) {
    setTickets((rows) => rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }
  function patchSub(id: string, p: Partial<SubRow>) {
    setSubs((rows) => rows.map((r) => (r.id === id ? { ...r, ...p } : r)));
  }

  function addTicket() {
    setTickets((r) => [...r, { id: nextTemp, titleEn: "", titleAr: "", price: "0.00", quota: "100" }]);
    setNextTemp((n) => n - 1);
  }
  function removeTicket(row: TicketRow) {
    if (row.id > 0) {
      if (!confirm(`Remove ticket "${row.titleEn}"? This is applied when you Save.`)) return;
      setRemovedTickets((r) => [...r, { itemId: row.id, label: row.titleEn }]);
    }
    setTickets((rows) => rows.filter((r) => r.id !== row.id));
  }

  function addSub() {
    const id = `new-${nextSub}`;
    setSubs((r) => [
      ...r,
      { id, titleEn: "", titleAr: "", category: "", location: "", dateFrom: "", dateTo: "", price: "0.00", maxAttendees: "", ticketsPerUser: "1" },
    ]);
    setNextSub((n) => n + 1);
  }
  function removeSub(row: SubRow) {
    if (!row.id.startsWith("new-")) {
      if (!confirm(`Remove sub-event "${row.titleEn}"? This is applied when you Save.`)) return;
      setRemovedSubs((r) => [...r, row.id]);
    }
    setSubs((rows) => rows.filter((r) => r.id !== row.id));
  }

  async function save() {
    // Reject non-numeric prices/quotas up front with a clear message rather than
    // shipping NaN to the server (where it surfaces as a generic field error).
    const badNumber = [...tickets, ...subs].some((r) => {
      const price = parseFloat(r.price || "0");
      const cap = "quota" in r ? r.quota : (r as SubRow).maxAttendees;
      return !Number.isFinite(price) || (cap !== "" && !Number.isFinite(Number(cap)));
    });
    if (badNumber) {
      toast.error("Check the price / quota fields — they must be numbers.");
      return;
    }

    setBusy(true);
    try {
      const initTById = new Map(initialTickets.map((t) => [t.id, t]));
      const ticketCreate = tickets.filter((t) => t.id < 0).map(ticketInput);
      const ticketUpdate = tickets
        .filter((t) => t.id > 0)
        .filter((t) => {
          const o = initTById.get(t.id)!;
          const c = ticketInput(t);
          return (
            c.titleEn !== o.titleEn ||
            (c.titleAr ?? null) !== (o.titleAr ?? null) ||
            c.priceCents !== o.priceCents ||
            (c.quotaSize ?? null) !== (o.quotaSize ?? null)
          );
        })
        .map((t) => ({ itemId: t.id, input: ticketInput(t) }));

      const initSById = new Map(initialSubEvents.map((s) => [s.id, s]));
      const subCreate = subs.filter((s) => s.id.startsWith("new-")).map(subInput);
      const subUpdate = subs
        .filter((s) => !s.id.startsWith("new-"))
        .filter((s) => {
          const o = initSById.get(s.id);
          if (!o) return false;
          const c = subInput(s);
          return (
            c.titleEn !== o.titleEn ||
            (c.titleAr ?? null) !== (o.titleAr ?? null) ||
            c.category !== o.category ||
            (c.location ?? null) !== (o.location ?? null) ||
            new Date(c.dateFrom).getTime() !== new Date(o.dateFrom).getTime() ||
            new Date(c.dateTo).getTime() !== new Date(o.dateTo).getTime() ||
            c.priceCents !== o.priceCents ||
            (c.maxAttendees ?? null) !== (o.maxAttendees ?? null) ||
            c.ticketsPerUser !== o.ticketsPerUser
          );
        })
        .map((s) => ({ id: s.id, input: subInput(s) }));

      const res = await saveTicketsAction(locale, eventId, {
        tickets: { create: ticketCreate, update: ticketUpdate, delete: removedTickets },
        subEvents: { create: subCreate, update: subUpdate, delete: removedSubs },
      });

      if (res?.error) {
        toast.error(res.error);
        return;
      }
      if (res?.fieldErrors) {
        toast.error(Object.values(res.fieldErrors).flat().join(", "));
        return;
      }
      toast.success("Saved");
      setRemovedTickets([]);
      setRemovedSubs([]);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const inputCls = "w-full";

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h2 className="mb-3 text-xl font-semibold">Tickets</h2>
        {tickets.length === 0 && <p className="mb-3 text-muted-foreground">No tickets yet.</p>}
        <div className="flex flex-col gap-3">
          {tickets.map((t) => (
            <div key={t.id} className="rounded-[var(--radius-lg)] border border-border p-3">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="col-span-2 sm:col-span-1">
                  <Label>Title (EN)</Label>
                  <Input className={inputCls} value={t.titleEn} onChange={(e) => patchTicket(t.id, { titleEn: e.target.value })} />
                </div>
                <div className="col-span-2 sm:col-span-1">
                  <Label>Title (ع)</Label>
                  <Input dir="rtl" className={inputCls} value={t.titleAr} onChange={(e) => patchTicket(t.id, { titleAr: e.target.value })} />
                </div>
                <div>
                  <Label>Price (USD)</Label>
                  <Input className={inputCls} value={t.price} onChange={(e) => patchTicket(t.id, { price: e.target.value })} />
                </div>
                <div>
                  <Label>Quota</Label>
                  <Input className={inputCls} placeholder="∞" value={t.quota} onChange={(e) => patchTicket(t.id, { quota: e.target.value })} />
                </div>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3">
                {t.id > 0 ? (
                  <InviteControls locale={locale} eventId={eventId} itemId={t.id} isInviteOnly={inviteOnlyItemIds.includes(t.id)} />
                ) : (
                  <span className="text-xs text-muted-foreground">New — saved on Save</span>
                )}
                <Button type="button" variant="destructive" size="sm" onClick={() => removeTicket(t)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addTicket}>
          + Add ticket
        </Button>
      </section>

      <section>
        <h2 className="mb-3 text-xl font-semibold">Sub-events</h2>
        {subs.length === 0 && <p className="mb-3 text-muted-foreground">No sub-events yet.</p>}
        <div className="flex flex-col gap-3">
          {subs.map((s) => (
            <div key={s.id} className="rounded-[var(--radius-lg)] border border-border p-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Title (EN)</Label>
                  <Input value={s.titleEn} onChange={(e) => patchSub(s.id, { titleEn: e.target.value })} />
                </div>
                <div>
                  <Label>Title (ع)</Label>
                  <Input dir="rtl" value={s.titleAr} onChange={(e) => patchSub(s.id, { titleAr: e.target.value })} />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input value={s.category} onChange={(e) => patchSub(s.id, { category: e.target.value })} />
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={s.location} onChange={(e) => patchSub(s.id, { location: e.target.value })} />
                </div>
                <div>
                  <Label>From</Label>
                  <Input type="datetime-local" value={s.dateFrom} onChange={(e) => patchSub(s.id, { dateFrom: e.target.value })} />
                </div>
                <div>
                  <Label>To</Label>
                  <Input type="datetime-local" value={s.dateTo} onChange={(e) => patchSub(s.id, { dateTo: e.target.value })} />
                </div>
                <div>
                  <Label>Price (USD)</Label>
                  <Input value={s.price} onChange={(e) => patchSub(s.id, { price: e.target.value })} />
                </div>
                <div>
                  <Label>Max attendees</Label>
                  <Input placeholder="∞" value={s.maxAttendees} onChange={(e) => patchSub(s.id, { maxAttendees: e.target.value })} />
                </div>
                <div>
                  <Label>Tickets / user</Label>
                  <Input value={s.ticketsPerUser} onChange={(e) => patchSub(s.id, { ticketsPerUser: e.target.value })} />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button type="button" variant="destructive" size="sm" onClick={() => removeSub(s)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
        </div>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={addSub}>
          + Add sub-event
        </Button>
      </section>

      <div className="sticky bottom-0 -mx-6 flex justify-end border-t border-border bg-background/90 px-6 py-3 backdrop-blur">
        <Button type="button" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save changes"}
        </Button>
      </div>
    </div>
  );
}
