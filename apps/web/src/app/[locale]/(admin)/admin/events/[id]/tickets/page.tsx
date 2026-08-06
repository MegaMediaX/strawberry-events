import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getEventForSession, listTicketsWithQuota, listSubEvents } from "@/lib/events/service";
import { TicketsManager } from "./tickets-manager";
import { EmailInvitePanel } from "./email-invite-panel";

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);

  const session = await getSessionContext();
  const event = session ? await getEventForSession(session, id) : null;
  if (!event) notFound();

  const tickets = await listTicketsWithQuota(session!, id);
  const subEvents = await listSubEvents(session!, id);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">Tickets &amp; sub-events</h1>
      <p className="mb-6 text-muted-foreground">{event.titleEn}</p>

      <TicketsManager
        // Remount with fresh state after a save changes the persisted set
        // (new ids / removals) so edit state never drifts from server data.
        key={`${tickets.map((t) => t.id).join(",")}|${subEvents.map((s) => s.id).join(",")}`}
        locale={locale}
        eventId={id}
        inviteOnlyItemIds={event.inviteOnlyItemIds}
        initialTickets={tickets.map((t) => ({
          id: t.id,
          titleEn: t.titleEn,
          titleAr: t.titleAr,
          descriptionEn: t.descriptionEn,
          descriptionAr: t.descriptionAr,
          priceCents: t.priceCents,
          quotaSize: t.quotaSize,
        }))}
        initialSubEvents={subEvents.map((s) => ({
          id: s.id,
          titleEn: s.titleEn,
          titleAr: s.titleAr,
          category: s.category,
          location: s.location,
          descriptionEn: s.descriptionEn,
          descriptionAr: s.descriptionAr,
          dateFrom: s.dateFrom.toISOString(),
          dateTo: s.dateTo.toISOString(),
          priceCents: s.priceCents,
          maxAttendees: s.maxAttendees,
          ticketsPerUser: s.ticketsPerUser,
          requiresOptIn: s.requiresOptIn,
        }))}
      />

      <div className="mt-8">
        <EmailInvitePanel
          locale={locale}
          eventId={id}
          inviteOnlyItemIds={event.inviteOnlyItemIds}
        />
      </div>
    </div>
  );
}
