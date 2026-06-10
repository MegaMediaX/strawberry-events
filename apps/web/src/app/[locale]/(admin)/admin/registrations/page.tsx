import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { eventScope } from "@/lib/admin/scope";
import { listRegistrations, type RegistrationFilters } from "@/lib/admin/registrations";

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
  await requireRole(["super_admin", "organizer_admin", "finance"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  const filters = toFilters(sp);
  const rows = await listRegistrations(session, filters);

  // Accessible events for the filter dropdown.
  const ev = eventScope(session);
  const events = await prisma.eventMapping.findMany({
    where: ev ?? {},
    select: { id: true, titleEn: true },
    orderBy: { createdAt: "desc" },
    take: 100,
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

      <p className="mt-3 text-sm text-muted-foreground">{rows.length} registrations</p>

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
