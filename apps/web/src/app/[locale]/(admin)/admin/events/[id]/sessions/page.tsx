import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getEventForSession, listSubEventBookings } from "@/lib/events/service";
import { VENUE_TIME_ZONE } from "@/lib/datetime/uk";

export const dynamic = "force-dynamic";

/** Session times are naive venue wall-clock — never render them in the viewer's zone. */
function fmt(d: Date): string {
  return d.toLocaleString("en-GB", {
    timeZone: VENUE_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function FillBar({ booked, capacity }: { booked: number; capacity: number | null }) {
  if (!capacity) {
    return <span className="text-xs text-muted-foreground">uncapped</span>;
  }
  const pct = Math.min(100, Math.round((booked / capacity) * 100));
  // Amber from 75%, red at 90% — an organiser needs to see a room filling up
  // well before it is full, because the fix (bigger room, second sitting) has a
  // lead time.
  const tone =
    pct >= 90 ? "bg-destructive" : pct >= 75 ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-muted">
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-muted-foreground">{pct}%</span>
    </div>
  );
}

export default async function SessionsPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin", "finance"], `/${locale}/admin`);
  const session = await getSessionContext();

  const event = session ? await getEventForSession(session, id) : null;
  if (!event) notFound();

  const rows = session ? await listSubEventBookings(session, id) : [];
  const totalBooked = rows.reduce((n, r) => n + (r.booked ?? 0), 0);

  return (
    <div>
      <h1 className="text-2xl font-bold">Sessions — {event.titleEn}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Who has booked each session. These figures come from pretix, which is the
        only place a session booking is recorded.
      </p>

      {rows.length === 0 ? (
        <p className="mt-6 text-muted-foreground">This event has no sessions.</p>
      ) : (
        <>
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground">
                <th className="py-2">Session</th>
                <th>When</th>
                <th className="text-end">Booked</th>
                <th className="text-end">Capacity</th>
                <th className="text-end">Remaining</th>
                <th>Fill</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b align-top">
                  <td className="py-2">
                    <div className="font-medium">{r.titleEn}</div>
                    <div className="text-xs text-muted-foreground">
                      {r.category}
                      {r.location ? ` · ${r.location}` : ""}
                    </div>
                  </td>
                  <td className="whitespace-nowrap">
                    {fmt(r.dateFrom)}
                    <span className="text-muted-foreground"> — </span>
                    {r.dateTo.toLocaleString("en-GB", {
                      timeZone: VENUE_TIME_ZONE,
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                  <td className="text-end font-medium">
                    {r.error ? "—" : r.booked}
                    {r.pending > 0 && (
                      <span className="ms-1 text-xs text-muted-foreground">
                        (+{r.pending} pending)
                      </span>
                    )}
                  </td>
                  <td className="text-end">{r.capacity ?? "∞"}</td>
                  <td className="text-end">
                    {r.remaining === null ? "—" : r.remaining}
                  </td>
                  <td>
                    {r.error ? (
                      <span className="text-xs text-destructive">
                        unavailable: {r.error}
                      </span>
                    ) : (
                      <FillBar booked={r.booked ?? 0} capacity={r.capacity} />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <p className="mt-4 text-sm text-muted-foreground">
            {totalBooked} session booking{totalBooked === 1 ? "" : "s"} in total.
            An attendee may hold several.
          </p>
        </>
      )}
    </div>
  );
}
