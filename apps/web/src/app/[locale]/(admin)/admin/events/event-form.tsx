"use client";

import { useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { DateTimeField } from "@/components/ui/datetime-field";
import {
  eventInputSchema,
  type EventInput,
  type EventFormValues,
} from "@/lib/events/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createEventAction, updateEventAction, type ActionResult } from "./actions";

const TABS = ["Details", "Schedule & Location", "Registration", "Tickets"] as const;
type Tab = (typeof TABS)[number];

export function EventForm({
  locale,
  eventId,
  initial,
}: {
  locale: string;
  eventId?: string;
  initial?: Partial<EventInput>;
}) {
  const [tab, setTab] = useState<Tab>("Details");
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<EventFormValues>({
    resolver: zodResolver(eventInputSchema),
    defaultValues: {
      visibility: "public",
      accountMode: "optional",
      approvalMode: "none",
      comingSoon: false,
      live: false,
      waitlistEnabled: false,
      seatSelectionEnabled: false,
      badgeAutoPrint: false,
      payBeforeApproval: false,
      ...initial,
    },
  });

  async function onSubmit(values: EventFormValues) {
    setServerError(null);
    const res: ActionResult = eventId
      ? await updateEventAction(locale, eventId, values)
      : await createEventAction(locale, values);
    // On success the action redirects; we only get here on error.
    if (res?.fieldErrors) {
      for (const [k, msgs] of Object.entries(res.fieldErrors)) {
        setError(k as keyof EventFormValues, { message: msgs.join(", ") });
      }
    }
    if (res?.error) setServerError(res.error);
  }

  const err = (k: keyof EventFormValues) =>
    errors[k] && <p className="text-sm text-destructive">{errors[k]?.message}</p>;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-2xl">
      <div className="mb-4 flex gap-4 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`pb-2 text-sm ${
              tab === t
                ? "border-b-2 border-primary font-semibold text-primary"
                : "text-muted-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className={tab === "Details" ? "flex flex-col gap-3" : "hidden"}>
        <div><Label>Title (EN)</Label><Input {...register("titleEn")} />{err("titleEn")}</div>
        <div><Label>Title (ع)</Label><Input dir="rtl" {...register("titleAr")} /></div>
        <div><Label>Slug</Label><Input {...register("slug")} />{err("slug")}</div>
        <div><Label>Description (EN)</Label><Input {...register("descriptionEn")} /></div>
        <div><Label>Description (ع)</Label><Input dir="rtl" {...register("descriptionAr")} /></div>
      </div>

      <div className={tab === "Schedule & Location" ? "flex flex-col gap-3" : "hidden"}>
        <div>
          <Label>Start</Label>
          <Controller
            control={control}
            name="dateFrom"
            render={({ field }) => (
              <DateTimeField value={field.value} onChange={(iso) => field.onChange(iso ?? "")} />
            )}
          />
          {err("dateFrom")}
        </div>
        <div>
          <Label>End (optional)</Label>
          <Controller
            control={control}
            name="dateTo"
            render={({ field }) => (
              <DateTimeField value={field.value} onChange={(iso) => field.onChange(iso)} />
            )}
          />
        </div>
        <div className="mt-2 border-t pt-3 text-sm font-medium text-muted-foreground">Location (optional)</div>
        <div><Label>Venue name</Label><Input {...register("venueName")} /></div>
        <div><Label>Address</Label><Input {...register("address")} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>City</Label><Input {...register("city")} /></div>
          <div><Label>Country</Label><Input {...register("country")} /></div>
        </div>
        <div><Label>Google Maps URL</Label><Input placeholder="https://maps.google.com/…" {...register("mapUrl")} />{err("mapUrl")}</div>
        <div><Label>Map embed URL (optional)</Label><Input placeholder="https://www.google.com/maps/embed?…" {...register("mapEmbedUrl")} />{err("mapEmbedUrl")}</div>
        <div className="mt-2 border-t pt-3 text-sm font-medium text-muted-foreground">Community</div>
        <div><Label>WhatsApp channel link (optional)</Label><Input placeholder="https://whatsapp.com/channel/… or https://chat.whatsapp.com/…" {...register("whatsappChannelUrl")} />{err("whatsappChannelUrl")}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Latitude</Label><Input type="number" step="any" {...register("latitude", { setValueAs: (v) => (v === "" || v == null ? null : Number(v)) })} /></div>
          <div><Label>Longitude</Label><Input type="number" step="any" {...register("longitude", { setValueAs: (v) => (v === "" || v == null ? null : Number(v)) })} /></div>
        </div>
      </div>

      <div className={tab === "Registration" ? "flex flex-col gap-3" : "hidden"}>
        <div><Label>Visibility</Label>
          <select className="w-full rounded-md border px-2 py-1" {...register("visibility")}>
            <option value="public">Public</option><option value="private">Private</option><option value="hidden">Hidden</option>
          </select>
        </div>
        <div><Label>Account mode</Label>
          <select className="w-full rounded-md border px-2 py-1" {...register("accountMode")}>
            <option value="optional">Optional</option><option value="required">Required</option><option value="guest">Guest only</option>
          </select>
        </div>
        <div><Label>Approval mode</Label>
          <select className="w-full rounded-md border px-2 py-1" {...register("approvalMode")}>
            <option value="none">None</option><option value="manual">Manual</option><option value="automatic">Automatic</option><option value="manual_and_automatic">Manual + automatic</option>
          </select>
        </div>
        <label className="flex items-center gap-2"><input type="checkbox" {...register("comingSoon")} /> Coming soon</label>
        <label className="flex items-center gap-2"><input type="checkbox" {...register("live")} /> Live (published in pretix)</label>
        <div className="mt-2 border-t pt-3 text-sm font-medium text-muted-foreground">Registration features</div>
        <label className="flex items-center gap-2"><input type="checkbox" {...register("waitlistEnabled")} /> Enable waitlist when sold out</label>
        <label className="flex items-center gap-2"><input type="checkbox" {...register("seatSelectionEnabled")} /> Enable seat selection</label>
        <label className="flex items-center gap-2"><input type="checkbox" {...register("badgeAutoPrint")} /> Auto-print badge on check-in</label>
        <label className="flex items-center gap-2"><input type="checkbox" {...register("payBeforeApproval")} /> Require payment before approval</label>
        <div className="mt-2 border-t pt-3 text-sm font-medium text-muted-foreground">Capacity & ticket limits</div>
        <div><Label>Max attendees (blank = unlimited)</Label><Input type="number" min={0} {...register("maxAttendees", { setValueAs: (v) => (v === "" || v == null ? null : Number(v)) })} />{err("maxAttendees")}</div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Tickets per user — main event</Label><Input type="number" min={1} {...register("ticketsPerUserMain", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })} />{err("ticketsPerUserMain")}</div>
          <div><Label>Tickets per user — total</Label><Input type="number" min={1} {...register("ticketsPerUserTotal", { setValueAs: (v) => (v === "" || v == null ? undefined : Number(v)) })} />{err("ticketsPerUserTotal")}</div>
        </div>
      </div>

      <div className={tab === "Tickets" ? "" : "hidden"}>
        {eventId ? (
          <a className="text-primary underline" href={`/${locale}/admin/events/${eventId}/tickets`}>Manage tickets →</a>
        ) : (
          <p className="text-muted-foreground">Save the event first, then add tickets.</p>
        )}
      </div>

      {serverError && <p className="mt-4 text-sm text-destructive">{serverError}</p>}
      <div className="mt-6">
        <Button type="submit" disabled={isSubmitting}>
          {eventId ? "Save changes" : "Create event"}
        </Button>
      </div>
    </form>
  );
}
