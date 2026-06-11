import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getPublicEvent } from "@/lib/events/public";
import { getSeatMap } from "@/lib/seats/service";
import { getEventFields } from "@/lib/admin/custom-fields";
import { RegistrationWizard } from "@/components/registration/registration-wizard";
import { prisma } from "@/lib/db/client";
import { verifyInvite } from "@/lib/tokens/invite";
import type { SectionNode } from "@/components/seats/seat-selector";
import type { SubEventItem } from "@/components/registration/sub-event-picker";

export const dynamic = "force-dynamic";

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
  let unlockedItemIds: Set<number> = new Set();
  if (rawInvite) {
    const payload = verifyInvite(rawInvite);
    if (payload && payload.ev === slug) {
      inviteToken = rawInvite;
      for (const id of payload.items) unlockedItemIds.add(id);
    }
  }

  const title = locale === "ar" && data.event.titleAr ? data.event.titleAr : data.event.titleEn;

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
    <div>
      <div className="mx-auto max-w-xl px-4 pt-6">
        <h1 className="text-xl font-semibold">Register — {title}</h1>
      </div>
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
      />
    </div>
  );
}
