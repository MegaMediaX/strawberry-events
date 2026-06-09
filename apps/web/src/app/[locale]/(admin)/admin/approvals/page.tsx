import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import type { AttendeeApprovalStatus } from "@prisma/client";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { listApprovals } from "@/lib/approval/service";
import { DecisionButtons } from "./decision-buttons";

export const dynamic = "force-dynamic";

const STATUSES = ["pending", "approved", "rejected"] as const;

export default async function ApprovalsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ status?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();

  const status = STATUSES.includes(sp.status as never)
    ? (sp.status as AttendeeApprovalStatus)
    : "pending";
  const rows = session ? await listApprovals(session, { approvalStatus: status }) : [];
  const impersonating = !!session?.impersonating;

  return (
    <div>
      <h1 className="text-2xl font-bold">Approvals</h1>
      <div className="mt-4 flex gap-2">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`?status=${s}`}
            className={`rounded-full border px-3 py-1 text-xs ${status === s ? "bg-primary text-primary-foreground" : "border-border"}`}
          >
            {s}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <p className="mt-6 text-muted-foreground">Nothing {status}.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Event</th>
              <th>Order</th>
              <th>Email</th>
              <th>Method</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((o) => (
              <tr key={o.id} className="border-b">
                <td className="py-2">{o.eventMapping.titleEn}</td>
                <td>
                  <Link className="text-primary underline" href={`/${locale}/admin/approvals/${o.id}`}>
                    {o.orderCode}
                  </Link>
                </td>
                <td className="text-muted-foreground">{o.email}</td>
                <td>{o.provider === "manual_cod" ? "COD" : "Free"}</td>
                <td className="text-end">
                  {o.approvalStatus === "pending" && (
                    <DecisionButtons locale={locale} orderId={o.id} disabled={impersonating} />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {impersonating && (
        <p className="mt-3 text-xs text-destructive">
          Approvals are disabled while impersonating.
        </p>
      )}
    </div>
  );
}
