import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getEventForSession, listTickets, listSubEvents } from "@/lib/events/service";
import { centsToPrice } from "@/lib/pretix/mappers";
import { TicketBuilder } from "./ticket-builder";
import { SubEventBuilder } from "./sub-event-builder";
import { InviteControls } from "./invite-controls";
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

  const items = await listTickets(session!, id);
  const subEvents = await listSubEvents(session!, id);

  return (
    <div className="max-w-2xl">
      <h1 className="mb-1 text-2xl font-bold">Tickets</h1>
      <p className="mb-4 text-muted-foreground">{event.titleEn}</p>

      {items.length === 0 ? (
        <p className="text-muted-foreground">No tickets yet.</p>
      ) : (
        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Ticket</th>
              <th>Price</th>
              <th>Active</th>
              <th>Invite only</th>
              <th>Invite link</th>
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b">
                <td className="py-2">{i.titleEn}</td>
                <td>${centsToPrice(i.priceCents)}</td>
                <td>{i.active ? "✓" : "—"}</td>
                <td colSpan={2}>
                  <InviteControls
                    locale={locale}
                    eventId={id}
                    itemId={i.id}
                    isInviteOnly={event.inviteOnlyItemIds.includes(i.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <TicketBuilder locale={locale} eventId={id} />

      <EmailInvitePanel
        locale={locale}
        eventId={id}
        inviteOnlyItemIds={event.inviteOnlyItemIds}
      />

      <h2 className="mb-3 mt-8 text-xl font-semibold">Sub-events</h2>
      {subEvents.length === 0 ? (
        <p className="mb-4 text-muted-foreground">No sub-events yet.</p>
      ) : (
        <table className="mb-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Title</th>
              <th>Category</th>
              <th>Location</th>
              <th>From</th>
              <th>To</th>
            </tr>
          </thead>
          <tbody>
            {subEvents.map((s) => (
              <tr key={s.id} className="border-b">
                <td className="py-2">{s.titleEn}</td>
                <td>{s.category}</td>
                <td>{s.location ?? "—"}</td>
                <td>{s.dateFrom.toISOString().slice(0, 16).replace("T", " ")}</td>
                <td>{s.dateTo.toISOString().slice(0, 16).replace("T", " ")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <SubEventBuilder locale={locale} eventId={id} />
    </div>
  );
}
