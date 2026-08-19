import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { eventScope } from "@/lib/admin/scope";
import { subEventScope } from "@/lib/auth/org-scope";
import { listRegistrationsPage, type RegistrationFilters } from "@/lib/admin/registrations";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  issued: "Issued",
  pending_payment: "Pending payment",
  pending_approval: "Pending approval",
  rejected: "Rejected",
  canceled: "Canceled",
};
const ROLE_TAGS = ["", "visitor", "media", "partner", "speaker", "staff"];

type SP = Record<string, string | undefined>;

function toFilters(sp: SP): RegistrationFilters {
  return {
    eventId: sp.event || undefined,
    subEventId: sp.session || undefined,
    roleTag: sp.roleTag || undefined,
    approvalStatus: sp.approval || undefined,
    paymentStatus: sp.payment || undefined,
    issued: sp.issued === "yes" ? true : sp.issued === "no" ? false : undefined,
    checkedIn: sp.checkin === "yes" ? true : sp.checkin === "no" ? false : undefined,
    createdFrom: sp.from ? new Date(sp.from) : undefined,
    createdTo: sp.to ? new Date(sp.to) : undefined,
    q: sp.q || undefined,
  };
}

export default async function RegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SP>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin", "finance", "workshop_organiser"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  // null for everyone unrestricted; an array for a workshop organiser.
  const allowedSessions = subEventScope(session);
  const filters = toFilters(sp);
  // 1000 comfortably covers current volume (812 orders, largest session 695), so
  // nothing is cut in practice — and when it ever is, `capped` says so rather
  // than letting a truncated list read as the total.
  // A session id the caller cannot reach throws ForbiddenError. The single
  // registration page already degrades rather than propagating; do the same here
  // instead of replacing the entire Registrations screen with an error boundary
  // because one bookmarked query param went stale.
  let page;
  let sessionDenied = false;
  try {
    page = await listRegistrationsPage(session, filters, { take: 1000 });
  } catch {
    sessionDenied = true;
    page = await listRegistrationsPage(
      session,
      { ...filters, subEventId: undefined },
      { take: 1000 },
    );
  }
  const { rows, total, capped, sessionFilter } = page;

  // Accessible events for the filter dropdown.
  const ev = eventScope(session);
  const events = await prisma.eventMapping.findMany({
    where: ev ?? {},
    select: { id: true, titleEn: true },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Sessions for the filter. Scoped to the chosen event when there is one,
  // otherwise every session the source events allow — the label carries the
  // event name so the options stay unambiguous.
  const subEvents = await prisma.subEvent.findMany({
    // Both keys, always. Narrowing by the requested event must not replace the
    // org scope: `?event=<another org's id>` would otherwise populate this
    // dropdown with that event's session titles, categories and bookable state.
    // The registrant rows stay protected by orderScope, but the programme
    // metadata leaked.
    where: {
      ...(sp.event ? { eventMappingId: sp.event } : {}),
      eventMapping: ev ?? {},
      // A session-scoped user picks from their own sessions and no others —
      // otherwise the dropdown advertises the rest of the programme.
      ...(allowedSessions ? { id: { in: allowedSessions } } : {}),
    },
    select: {
      id: true,
      titleEn: true,
      category: true,
      pretixItemId: true,
      eventMapping: { select: { titleEn: true } },
    },
    orderBy: { dateFrom: "asc" },
    take: 200,
  });

  const exportHref = `/${locale}/admin/registrations/export?${new URLSearchParams(
    Object.entries(sp).filter(([, v]) => v) as [string, string][],
  ).toString()}`;

  const sel = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Registrations</h1>
        <div className="flex gap-2 text-sm">
          <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={`/${locale}/staff/registrations`}>
            + New registration
          </Link>
          <a className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={exportHref}>
            Export CSV
          </a>
        </div>
      </div>

      <form className="mt-4 flex flex-wrap gap-2" method="get">
        <input className={sel} type="search" name="q" placeholder="Name / email / phone / company" defaultValue={sp.q ?? ""} />
        <select className={sel} name="event" defaultValue={sp.event ?? ""}>
          <option value="">All events</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.titleEn}</option>)}
        </select>
        <select className={sel} name="session" defaultValue={sp.session ?? ""}>
          {!allowedSessions && <option value="">All sessions</option>}
          {subEvents.map((se) => (
            <option key={se.id} value={se.id} disabled={se.pretixItemId == null}>
              {se.titleEn}
              {se.category ? ` (${se.category})` : ""}
              {se.pretixItemId == null ? " — not bookable" : ""}
              {!sp.event ? ` · ${se.eventMapping.titleEn}` : ""}
            </option>
          ))}
        </select>
        <select className={sel} name="roleTag" defaultValue={sp.roleTag ?? ""}>
          {ROLE_TAGS.map((t) => <option key={t} value={t}>{t || "All roles"}</option>)}
        </select>
        <select className={sel} name="approval" defaultValue={sp.approval ?? ""}>
          <option value="">All approval</option>
          <option value="not_required">Not required</option>
          <option value="pending">Pending</option>
          <option value="approved">Approved</option>
          <option value="rejected">Rejected</option>
        </select>
        <select className={sel} name="payment" defaultValue={sp.payment ?? ""}>
          <option value="">All payment</option>
          <option value="pending">Pending</option>
          <option value="paid">Paid</option>
          <option value="canceled">Canceled</option>
        </select>
        <select className={sel} name="issued" defaultValue={sp.issued ?? ""}>
          <option value="">Issued: any</option>
          <option value="yes">Issued</option>
          <option value="no">Not issued</option>
        </select>
        <select className={sel} name="checkin" defaultValue={sp.checkin ?? ""}>
          <option value="">Check-in: any</option>
          <option value="yes">Checked in</option>
          <option value="no">Not checked in</option>
        </select>
        <input className={sel} type="date" name="from" defaultValue={sp.from ?? ""} />
        <input className={sel} type="date" name="to" defaultValue={sp.to ?? ""} />
        <button className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground" type="submit">Filter</button>
      </form>

      <p className="mt-3 text-sm text-muted-foreground">
        {capped ? `Showing ${rows.length} of ${total}` : `${total}`} registrations
        {sp.session && (() => {
          const se = subEvents.find((x) => x.id === sp.session);
          return se ? ` booked into ${se.titleEn}` : "";
        })()}
      </p>
      {sessionDenied && (
        <p className="mt-2 rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          You do not have access to that session, so the session filter was
          ignored. Everything else still applies.
        </p>
      )}
      {sessionFilter?.ok === false && (
        <p className="mt-2 rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Could not read bookings from pretix, so this shows nothing rather than
          everything. It is not a count of zero — try again shortly.
        </p>
      )}
      {sessionFilter?.notBookable && (
        <p className="mt-2 rounded-[var(--radius-md)] border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-sm text-amber-700">
          That session is not linked to a pretix product, so it cannot be booked
          and will always show zero. See Data → Checks.
        </p>
      )}
      {capped && (
        <p className="mt-1 rounded-[var(--radius-md)] border border-amber-500/40 bg-amber-500/5 px-3 py-2 text-xs text-amber-700">
          This list is truncated — narrow the filters, or use Export CSV, which
          includes every matching row.
        </p>
      )}
      {sp.session && (
        <p className="mt-1 max-w-[70ch] text-xs text-muted-foreground">
          Session bookings live in pretix, not in this database, so filtering by
          one reads every order from pretix. It is a few seconds now and worth
          avoiding on event days, when pretix is answering the door scanner.
        </p>
      )}

      {rows.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No registrations match.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Event</th><th>Attendee</th><th>Order</th><th>Role</th><th>Method</th><th>State</th><th>Created</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border">
                <td className="py-2">{r.event}</td>
                <td>{r.attendee}</td>
                <td className="font-mono text-xs">{r.orderCode}</td>
                <td>{r.roleTag}</td>
                <td>{r.method}</td>
                <td>{STATE_LABEL[r.state] ?? r.state}</td>
                <td>{new Date(r.createdAt).toLocaleDateString()}</td>
                <td>
                  <Link className="text-primary underline" href={`/${locale}/admin/registrations/${r.id}`}>View</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
