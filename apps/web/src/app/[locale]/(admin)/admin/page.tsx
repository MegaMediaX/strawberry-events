import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import {
  CalendarDays,
  Users,
  Ticket,
  Clock,
  CheckSquare,
  DollarSign,
  List,
  TrendingUp,
} from "lucide-react";
import { requireRole, getSessionContext } from "@/lib/auth/session";
import { getDashboard } from "@/lib/admin/dashboard";
import { centsToPrice } from "@/lib/pretix/mappers";
import { StatCard } from "@/components/admin/stat-card";

export const dynamic = "force-dynamic";

export default async function AdminDashboardPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(
    ["super_admin", "organizer_admin", "finance"],
    `/${locale}/login`,
  );
  const session = await getSessionContext();
  if (!session) return null;

  const d = await getDashboard(session);
  const k = d.kpis;
  const L = (p: string) => `/${locale}/admin${p}`;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Overview of your events and registrations.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        <StatCard label="Total events" value={k.totalEvents} Icon={CalendarDays} />
        <StatCard
          label="Open events"
          value={k.openEvents}
          Icon={CalendarDays}
          accent="green"
        />
        <StatCard label="Upcoming" value={k.upcomingEvents} Icon={CalendarDays} />
        <StatCard label="Registrations" value={k.totalRegistrations} Icon={Users} />
        <StatCard
          label="Issued tickets"
          value={k.issuedTickets}
          Icon={Ticket}
          accent="green"
        />
        <StatCard
          label="Pending approval"
          value={k.pendingApproval}
          Icon={Clock}
          accent={k.pendingApproval > 0 ? "amber" : "default"}
        />
        {d.sections.financial && (
          <StatCard
            label="Pending payment"
            value={k.pendingPayment}
            Icon={DollarSign}
            accent={k.pendingPayment > 0 ? "blue" : "default"}
          />
        )}
        {d.sections.checkins && (
          <StatCard
            label="Checked in"
            value={k.checkedIn}
            Icon={CheckSquare}
            accent="green"
          />
        )}
        {d.sections.waitlist && (
          <StatCard label="Waitlist" value={k.waitlist} Icon={List} />
        )}
        {d.sections.financial && (
          <StatCard
            label="COD pending"
            value={`$${centsToPrice(k.codPendingCents)}`}
            Icon={DollarSign}
          />
        )}
        <StatCard
          label="Today's registrations"
          value={k.todayRegistrations}
          Icon={TrendingUp}
          accent={k.todayRegistrations > 0 ? "green" : "default"}
        />
      </div>

      <div className="flex flex-wrap gap-2">
        <Link
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          href={L("/events/new")}
        >
          + Create event
        </Link>
        {[
          { href: L("/approvals"), label: "Approvals" },
          { href: L("/finance"), label: "Finance" },
          { href: L("/registrations"), label: "Registrations" },
          { href: `/${locale}/staff/events`, label: "Check-in" },
          { href: L("/audit"), label: "Audit" },
        ].map((a) => (
          <Link
            key={a.href}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground"
            href={a.href}
          >
            {a.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Upcoming events</h2>
          {d.upcomingEventsList.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No events yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {d.upcomingEventsList.map((e) => (
                <li
                  key={e.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span className="font-medium">{e.titleEn}</span>
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {e.comingSoon
                      ? "Coming soon"
                      : e.liveOnPretix && e.visibility === "public"
                        ? "Open"
                        : "Draft"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Recent registrations</h2>
          {d.recentRegistrations.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">None yet.</p>
          ) : (
            <ul className="mt-3 flex flex-col divide-y divide-border">
              {d.recentRegistrations.map((r) => (
                <li
                  key={r.id}
                  className="flex items-center justify-between py-2 text-sm"
                >
                  <span>
                    {r.attendee}
                    <span className="ms-1 text-muted-foreground">· {r.event}</span>
                  </span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {r.orderCode}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {d.sections.checkins && (
          <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Recent check-ins</h2>
            {d.recentCheckins.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">None yet.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-border">
                {d.recentCheckins.map((c) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span className="font-mono text-xs">{c.attendeeRef}</span>
                    <span className="text-muted-foreground">{c.event}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {d.sections.audit && (
          <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
            <h2 className="text-sm font-semibold">Recent activity</h2>
            {d.recentAudit.length === 0 ? (
              <p className="mt-3 text-sm text-muted-foreground">No activity.</p>
            ) : (
              <ul className="mt-3 flex flex-col divide-y divide-border">
                {d.recentAudit.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center justify-between py-2 text-sm"
                  >
                    <span>{a.action}</span>
                    <span className="text-xs text-muted-foreground">
                      {new Date(a.createdAt).toLocaleString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        <section className="rounded-[var(--radius-lg)] border border-border bg-card p-4 lg:col-span-2">
          <h2 className="text-sm font-semibold">Event capacity overview</h2>
          {d.capacity.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No registrations yet.</p>
          ) : (
            <table className="mt-3 w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted-foreground">
                  <th className="pb-2 font-medium">Event</th>
                  <th className="pb-2 font-medium">Registrations</th>
                  <th className="pb-2 font-medium">Issued</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {d.capacity.map((c) => (
                  <tr key={c.eventId}>
                    <td className="py-2">{c.titleEn}</td>
                    <td className="py-2">{c.registrations}</td>
                    <td className="py-2">{c.issued}</td>
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
