import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { requireRole, getSessionContext } from "@/lib/auth/session";
import { getDashboard } from "@/lib/admin/dashboard";
import { centsToPrice } from "@/lib/pretix/mappers";

export const dynamic = "force-dynamic";

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-[var(--radius-lg)] border border-border p-4">
      <div className="text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin", "finance"], `/${locale}/login`);
  const session = await getSessionContext();
  if (!session) return null;

  const d = await getDashboard(session);
  const k = d.kpis;
  const L = (p: string) => `/${locale}/admin${p}`;

  return (
    <div>
      <h1 className="text-2xl font-bold">Dashboard</h1>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <Kpi label="Total events" value={k.totalEvents} />
        <Kpi label="Open events" value={k.openEvents} />
        <Kpi label="Upcoming" value={k.upcomingEvents} />
        <Kpi label="Registrations" value={k.totalRegistrations} />
        <Kpi label="Issued tickets" value={k.issuedTickets} />
        <Kpi label="Pending approval" value={k.pendingApproval} />
        {d.sections.financial && <Kpi label="Pending payment" value={k.pendingPayment} />}
        {d.sections.checkins && <Kpi label="Checked in" value={k.checkedIn} />}
        {d.sections.waitlist && <Kpi label="Waitlist" value={k.waitlist} />}
        {d.sections.financial && <Kpi label="COD pending" value={`$${centsToPrice(k.codPendingCents)}`} />}
        <Kpi label="Today's registrations" value={k.todayRegistrations} />
      </div>

      <div className="mt-6 flex flex-wrap gap-2 text-sm">
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={L("/events/new")}>+ Create event</Link>
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={L("/approvals")}>Approvals</Link>
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={L("/finance")}>Finance</Link>
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={L("/registrations")}>Registrations</Link>
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={`/${locale}/staff/events`}>Check-in</Link>
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={L("/audit")}>Audit</Link>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section>
          <h2 className="font-semibold">Events</h2>
          {d.upcomingEventsList.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {d.upcomingEventsList.map((e) => (
                <li key={e.id} className="flex items-center justify-between border-b border-border py-1.5">
                  <span>{e.titleEn}</span>
                  <span className="text-xs text-muted-foreground">
                    {e.comingSoon ? "Coming soon" : e.liveOnPretix && e.visibility === "public" ? "Open" : "Draft"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="font-semibold">Recent registrations</h2>
          {d.recentRegistrations.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="mt-2 flex flex-col gap-1 text-sm">
              {d.recentRegistrations.map((r) => (
                <li key={r.id} className="flex items-center justify-between border-b border-border py-1.5">
                  <span>{r.attendee} · <span className="text-muted-foreground">{r.event}</span></span>
                  <span className="font-mono text-xs">{r.orderCode}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {d.sections.checkins && (
          <section>
            <h2 className="font-semibold">Recent check-ins</h2>
            {d.recentCheckins.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {d.recentCheckins.map((c) => (
                  <li key={c.id} className="flex items-center justify-between border-b border-border py-1.5">
                    <span className="font-mono text-xs">{c.attendeeRef}</span>
                    <span className="text-muted-foreground">{c.event}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {d.sections.audit && (
          <section>
            <h2 className="font-semibold">Recent activity</h2>
            {d.recentAudit.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">No activity.</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {d.recentAudit.map((a) => (
                  <li key={a.id} className="flex items-center justify-between border-b border-border py-1.5">
                    <span>{a.action}</span>
                    <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="lg:col-span-2">
          <h2 className="font-semibold">Event capacity overview</h2>
          {d.capacity.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No registrations yet.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="py-1.5">Event</th><th>Registrations</th><th>Issued</th>
                </tr>
              </thead>
              <tbody>
                {d.capacity.map((c) => (
                  <tr key={c.eventId} className="border-b border-border">
                    <td className="py-1.5">{c.titleEn}</td>
                    <td>{c.registrations}</td>
                    <td>{c.issued}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </div>
  );
}
