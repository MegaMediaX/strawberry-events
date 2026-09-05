import Link from "next/link";
import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getRegistrationDetail } from "@/lib/admin/registrations";
import { hasAnyRole } from "@/lib/auth/guards";
import { subEventScope } from "@/lib/auth/org-scope";
import { centsToPrice } from "@/lib/pretix/mappers";
import { QrCodeDisplay } from "@/components/public/qr-code-display";
import { CancelRegistrationButton } from "./cancel-registration-button";
import { getOrderForOperator } from "@/lib/merge/admin";
import { LinkPanel } from "./link-panel";

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
  await requireRole(["super_admin", "organizer_admin", "finance", "workshop_organiser"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  let d;
  try {
    d = await getRegistrationDetail(session, id);
  } catch {
    notFound();
  }
  const o = d.order;

  /**
   * This page opens for finance and workshop_organiser too, but neither may
   * change who owns a registration — so the section is not merely disabled for
   * them, it is never rendered. `getOrderForOperator` would throw for those
   * roles, which is the point: the guard lives in the service and the UI simply
   * does not ask.
   */
  const mayMerge =
    hasAnyRole(session, ["super_admin", "organizer_admin"]) && !session.impersonating;
  const ownership = mayMerge ? await getOrderForOperator(session, id) : null;

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
        {subEventScope(session) === null && (
          <Link className="rounded-md border border-border px-3 py-1.5 hover:bg-muted" href={`/${locale}/admin/emails?q=${encodeURIComponent(o.orderCode)}`}>
            Emails
          </Link>
        )}
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
            <Row label="Job title" value={o.jobTitle ?? "—"} />
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
      {ownership ? (
        <section className="mt-8 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">Linked account</h2>
          {ownership.order.user ? (
            <p className="mt-1 text-sm">
              <span className="font-medium">{ownership.order.user.email}</span>
              {ownership.order.user.emailVerified ? "" : " · address not verified"}
            </p>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              Not linked to an account. The attendee reaches this registration through the link in
              their confirmation email.
            </p>
          )}

          <LinkPanel
            locale={locale}
            orderId={id}
            isLinked={Boolean(ownership.order.userId)}
            currentEmail={ownership.order.user?.email ?? null}
          />

          {ownership.history.length > 0 && (
            <>
              <h3 className="mt-5 text-sm font-semibold">Link history</h3>
              <ul className="mt-2 flex flex-col gap-2">
                {ownership.history.map((h) => (
                  <li key={h.eventId} className="text-xs text-muted-foreground">
                    {h.at.toISOString().slice(0, 16).replace("T", " ")} UTC ·{" "}
                    {h.actorType === "staff_override" ? "organiser" : "attendee claim"} ·{" "}
                    {h.proofType}
                    {h.reason ? ` — ${h.reason}` : ""}
                    {h.reversedAt ? " · reversed" : ""}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      ) : null}

    </div>
  );
}
