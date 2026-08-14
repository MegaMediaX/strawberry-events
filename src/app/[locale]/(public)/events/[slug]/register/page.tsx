import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getPublicEvent } from "@/lib/events/public";
import { coverImageUrl } from "@/lib/events/cover-image";
import { getSeatMap } from "@/lib/seats/service";
import { getEventFields } from "@/lib/admin/custom-fields";
import { RegistrationWizard } from "@/components/registration/registration-wizard";
import { prisma } from "@/lib/db/client";
import { verifyInvite } from "@/lib/tokens/invite";
import type { SectionNode } from "@/components/seats/seat-selector";
import type { SubEventItem } from "@/components/registration/sub-event-picker";

export const dynamic = "force-dynamic";

/** "28—30 AUG 2026 · VENUE". Each half is dropped when its data is absent. */
function buildMetaLine(
  from: string | null,
  to: string | null,
  venue: string | null,
): string | null {
  const parts: string[] = [];

  if (from) {
    const a = new Date(from);
    const b = to ? new Date(to) : null;
    const day = (d: Date) =>
      new Intl.DateTimeFormat("en-GB", { day: "numeric", timeZone: "UTC" }).format(d);
    const monthYear = (d: Date) =>
      new Intl.DateTimeFormat("en-GB", {
        month: "short",
        year: "numeric",
        timeZone: "UTC",
      }).format(d);
    const sameMonth =
      b && a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();

    if (b && sameMonth && day(a) !== day(b)) {
      parts.push(`${day(a)}—${day(b)} ${monthYear(a)}`);
    } else if (b && !sameMonth) {
      parts.push(`${day(a)} ${monthYear(a)} — ${day(b)} ${monthYear(b)}`);
    } else {
      parts.push(`${day(a)} ${monthYear(a)}`);
    }
  }

  if (venue) parts.push(venue);
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default async function RegisterPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; slug: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const [{ locale, slug }, sp] = await Promise.all([params, searchParams]);
  setRequestLocale(locale);

  const data = await getPublicEvent(slug);
  if (!data) notFound();

  // Validate invite token and unlock invite-only tickets if valid.
  const rawInvite = typeof sp.invite === "string" ? sp.invite : undefined;
  let inviteToken: string | undefined;
  const unlockedItemIds: Set<number> = new Set();
  if (rawInvite) {
    const payload = verifyInvite(rawInvite);
    if (payload && payload.ev === slug) {
      inviteToken = rawInvite;
      for (const id of payload.items) unlockedItemIds.add(id);
    }
  }

  const title = locale === "ar" && data.event.titleAr ? data.event.titleAr : data.event.titleEn;

  const coverUrl = data.event.coverImagePath
    ? coverImageUrl(data.event.coverImagePath)
    : null;

  // "28—30 AUG 2026 · LE ROYAL HOTEL BEIRUT", collapsing to a single date when
  // the event runs one day and omitting either half when the data is missing.
  const metaLine = buildMetaLine(data.dateFrom, data.dateTo, data.event.venueName);

  const unlockedInviteTickets = data.inviteOnlyTickets.filter((t) =>
    unlockedItemIds.has(t.id),
  );
  const allTickets = [...data.tickets, ...unlockedInviteTickets];

  const tickets = allTickets.map((t) => ({
    id: t.id,
    title: locale === "ar" && t.titleAr ? t.titleAr : t.titleEn,
    priceCents: t.priceCents,
  }));

  let seatSections: SectionNode[] | undefined;
  if (data.event.seatSelectionEnabled) {
    const maps = await getSeatMap(data.event.id);
    seatSections = maps.flatMap((m) =>
      m.sections.map((s) => ({
        id: s.id,
        name: s.name,
        rows: s.rows.map((r) => ({
          id: r.id,
          label: r.label,
          seats: r.seats.map((seat) => ({
            id: seat.id,
            label: seat.label,
            state: seat.state,
          })),
        })),
      })),
    );
  }

  const customFields = await getEventFields(data.event.id);

  // Load sub-events + live quota availability for remaining seats.
  const rawSubEvents = await prisma.subEvent.findMany({
    where: { eventMappingId: data.event.id },
    orderBy: { dateFrom: "asc" },
  });

  // Map sub-events for the picker. `remaining` is passed as null — pretix will
  // enforce sold-out at order creation; we avoid an extra API call here since
  // PretixQuotaAvailability doesn't expose which items a quota covers.
  const subEvents: SubEventItem[] = rawSubEvents
    .filter((se) => se.pretixItemId !== null)
    .map((se) => ({
      id: se.id,
      titleEn: se.titleEn,
      titleAr: se.titleAr,
      category: se.category,
      location: se.location,
      dateFrom: se.dateFrom.toISOString(),
      dateTo: se.dateTo.toISOString(),
      priceCents: se.priceCents,
      maxAttendees: se.maxAttendees,
      ticketsPerUser: se.ticketsPerUser,
      pretixItemId: se.pretixItemId,
      remaining: null,
    }));

  return (
    // <main> was missing here, so the page had no main landmark to skip to.
    <main className="mx-auto max-w-xl px-4 pb-4 lg:max-w-5xl lg:px-8">
      {/* Cover band. No text is ever placed over it: the image is admin-uploaded
          at an unknown crop, and type below it on cream is both safer and a
          better composition than a scrim. When there is no cover the masthead
          stands on its own — that is a complete design, not a fallback. */}
      {coverUrl && (
        <div className="-mx-4 overflow-hidden sm:mx-0 sm:rounded-[var(--radius-xl)]">
          <img
            src={coverUrl}
            alt=""
            className="aspect-[16/9] w-full object-cover object-center sm:aspect-[21/9]"
            style={{ filter: "saturate(0.9) contrast(1.03)" }}
          />
        </div>
      )}

      <header className="flex flex-col gap-2 pt-6">
        <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
          Registration
        </p>
        <h1 className="font-heading text-[40px] leading-[0.98] tracking-[-0.02em] lg:text-[60px] lg:leading-[0.94]">
          {title}
        </h1>
        <div className="h-[3px] w-11 rounded-full bg-primary" />
        {metaLine && (
          <p className="text-[13px] font-medium tracking-[0.04em] text-muted-foreground uppercase tabular-nums">
            {metaLine}
          </p>
        )}
        {/* Clamped to 3 lines on purpose. Unclamped, this description is ~390px
            tall and pushes the first form field below the fold on a 812px
            viewport — you would land on a registration page and see no form.
            The full text lives on the event detail page. */}
        {data.event.descriptionEn && (
          <p className="mt-1 line-clamp-3 max-w-[42ch] text-[15px] leading-[1.55] text-muted-foreground">
            {data.event.descriptionEn}
          </p>
        )}
      </header>
      <RegistrationWizard
        locale={locale}
        slug={slug}
        tickets={tickets}
        seatSections={seatSections}
        customFields={customFields}
        subEvents={subEvents}
        ticketsPerUserMain={data.event.ticketsPerUserMain}
        ticketsPerUserTotal={data.event.ticketsPerUserTotal}
        inviteToken={inviteToken}
        attendeeTypeEnabled={data.event.attendeeTypeEnabled}
        attendeeTypeRequired={data.event.attendeeTypeRequired}
      />
    </main>
  );
}
