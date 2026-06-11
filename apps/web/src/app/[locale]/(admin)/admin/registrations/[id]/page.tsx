import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getRegistrationDetail } from "@/lib/admin/registrations";
import { hasAnyRole } from "@/lib/auth/guards";
import { centsToPrice } from "@/lib/pretix/mappers";
import { QrCodeDisplay } from "@/components/public/qr-code-display";
import { CancelRegistrationButton } from "./cancel-registration-button";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  issued: "Issued",
  pending_payment: "Pending payment",
  pending_approval: "Pending approval",
  rejected: "Rejected",
  canceled: "Canceled",
};

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between border-b border-border py-1.5 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right">{value}</span>
    </div>
  );
}

export default async function RegistrationDetailPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin", "finance"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  let d;
  try {
    d = await getRegistrationDetail(session, id);
  } catch {
    notFound();
  }
  const o = d.order;

  return (
    <div className="mx-auto max-w-3xl">
      <Link className="text-sm text-primary underline" href={`/${locale}/admin/registrations`}>← Registrations</Link>
      <h1 className="mt-2 text-2xl font-bold">{o.attendee}</h1>
      <p className="text-sm text-muted-foreground">
        Order <span className="font-mono">{o.orderCode}</span> · {STATE_LABEL[o.state] ?? o.state}
      </p>

      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        {(o.state === "pending_approval") && (
          <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={`/${locale}/admin/approvals/${id}`}>Approve / reject</Link>
        )}
        {(o.method === "COD" && o.state === "pending_payment") && (
          <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={`/${locale}/admin/finance/${id}`}>Mark COD paid</Link>
        )}
        <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={`/${locale}/admin/emails?q=${encodeURIComponent(o.orderCode)}`}>
          Emails
        </Link>
        {(session.isSuperAdmin || hasAnyRole(session, ["organizer_admin"])) && o.state !== "canceled" && (
          <CancelRegistrationButton locale={locale} orderId={id} />
        )}
      </div>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <section>
          <h2 className="font-semibold">Attendee</h2>
          <div className="mt-2">
            <Row label="Name" value={o.attendee} />
            <Row label="Email" value={o.email} />
            <Row label="Phone" value={o.phoneCC && o.phone ? `${o.phoneCC} ${o.phone}` : (o.phone ?? "—")} />
            <Row label="Company" value={o.company ?? "—"} />
            <Row label="Role / tag" value={o.roleTag} />
          </div>
        </section>

        <section>
          <h2 className="font-semibold">Order</h2>
          <div className="mt-2">
            <Row label="Method" value={o.method} />
            <Row label="Payment" value={o.status} />
            <Row label="Approval" value={o.approvalStatus} />
            <Row label="Total" value={`$${centsToPrice(o.totalCents)}`} />
            <Row label="Created" value={new Date(o.createdAt).toLocaleString()} />
            <Row label="Seat" value={d.seat ? d.seat.label : "—"} />
          </div>
        </section>

        {d.modularAnswers.length > 0 && (
          <section className="sm:col-span-2">
            <h2 className="font-semibold">Submitted fields</h2>
            <div className="mt-2">
              {d.modularAnswers.map((a, i) => <Row key={i} label={a.label} value={a.value} />)}
            </div>
          </section>
        )}

        <section>
          <h2 className="font-semibold">Ticket</h2>
          {d.qrValue ? (
            <div className="mt-2">
              <QrCodeDisplay value={d.qrValue} />
            </div>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">QR is available once the ticket is issued.</p>
          )}
        </section>

        <section>
          <h2 className="font-semibold">Check-in / badges</h2>
          {d.badgePrints.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Not checked in.</p>
          ) : (
            <ul className="mt-2 text-sm">
              {d.badgePrints.map((b) => (
                <li key={b.id} className="border-b border-border py-1.5">
                  {b.reprint ? "Reprint" : "Badge printed"} · {new Date(b.createdAt).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </section>

        {d.waitlist.length > 0 && (
          <section>
            <h2 className="font-semibold">Waitlist history</h2>
            <ul className="mt-2 text-sm">
              {d.waitlist.map((w) => (
                <li key={w.id} className="border-b border-border py-1.5">#{w.position} · {w.status} · {new Date(w.createdAt).toLocaleDateString()}</li>
              ))}
            </ul>
          </section>
        )}

        <section className="sm:col-span-2">
          <h2 className="font-semibold">Audit trail</h2>
          {d.audit.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">No audit entries.</p>
          ) : (
            <ul className="mt-2 text-sm">
              {d.audit.map((a) => (
                <li key={a.id} className="flex justify-between border-b border-border py-1.5">
                  <span>{a.action}</span>
                  <span className="text-xs text-muted-foreground">{new Date(a.createdAt).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
