import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getEventForSession, listTickets } from "@/lib/events/service";
import { listFields } from "@/lib/admin/custom-fields";
import { FieldEditor } from "./field-editor";

export const dynamic = "force-dynamic";

export default async function EventFieldsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  const mapping = await getEventForSession(session, id);
  if (!mapping) notFound();

  const fields = await listFields(session, id);
  let tickets: { id: number; title: string }[] = [];
  try {
    const items = await listTickets(session, id);
    tickets = items.filter((i) => i.active).map((i) => ({ id: i.id, title: i.titleEn }));
  } catch {
    tickets = [];
  }
  const ticketName = (tid: string | null) =>
    tid == null ? "All tickets" : (tickets.find((t) => String(t.id) === tid)?.title ?? `#${tid}`);

  return (
    <div className="mx-auto max-w-3xl">
      <Link className="text-sm text-primary underline" href={`/${locale}/admin/events`}>← Events</Link>
      <h1 className="mt-2 text-2xl font-bold">Custom fields — {mapping.titleEn}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Modular attendee fields collected during registration, per ticket type.
      </p>

      {fields.length === 0 ? (
        <p className="mt-6 text-muted-foreground">No custom fields yet.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Label (EN)</th><th>Label (ع)</th><th>Type</th><th>Ticket</th><th>Required</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.id} className="border-b border-border">
                <td className="py-2">{f.labelEn}</td>
                <td>{f.labelAr ?? "—"}</td>
                <td>{f.type}</td>
                <td>{ticketName(f.ticketId)}</td>
                <td>{f.required ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-6">
        <FieldEditor eventId={id} tickets={tickets} />
      </div>
    </div>
  );
}
