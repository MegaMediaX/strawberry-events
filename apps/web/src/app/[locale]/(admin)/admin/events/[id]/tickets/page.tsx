import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { getEventForSession, listTickets } from "@/lib/events/service";
import { centsToPrice } from "@/lib/pretix/mappers";
import { TicketBuilder } from "./ticket-builder";

export default async function TicketsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getSessionContext();
  const event = session ? await getEventForSession(session, id) : null;
  if (!event) notFound();

  const items = await listTickets(session!, id);

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
            </tr>
          </thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.id} className="border-b">
                <td className="py-2">{i.titleEn}</td>
                <td>${centsToPrice(i.priceCents)}</td>
                <td>{i.active ? "✓" : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <TicketBuilder locale={locale} eventId={id} />
    </div>
  );
}
