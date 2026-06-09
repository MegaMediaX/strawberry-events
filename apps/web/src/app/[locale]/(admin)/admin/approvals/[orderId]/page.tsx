import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getApproval } from "@/lib/approval/service";
import { prisma } from "@/lib/db/client";
import { DecisionButtons } from "../decision-buttons";

export const dynamic = "force-dynamic";

export default async function ApprovalDetailPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();
  const order = session ? await getApproval(session, orderId) : null;
  if (!order) notFound();

  // Submitted modular field answers (if any were collected for this order).
  const answers = await prisma.customFormAnswer.findMany({
    where: { attendeeRef: order.orderCode },
    include: { field: true },
  });

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold">Registration {order.orderCode}</h1>
      <dl className="mt-4 grid grid-cols-[140px_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">Event</dt>
        <dd>{order.eventMapping.titleEn}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd>{order.email}</dd>
        <dt className="text-muted-foreground">Method</dt>
        <dd>{order.provider === "manual_cod" ? "COD / manual" : "Free"}</dd>
        <dt className="text-muted-foreground">Approval</dt>
        <dd className="font-medium">{order.approvalStatus}</dd>
      </dl>

      <h2 className="mt-6 text-sm font-semibold">Submitted fields</h2>
      {answers.length === 0 ? (
        <p className="text-sm text-muted-foreground">No custom fields submitted.</p>
      ) : (
        <ul className="mt-2 text-sm">
          {answers.map((a) => (
            <li key={a.id}>
              <span className="text-muted-foreground">{a.field.labelEn}: </span>
              {a.value}
            </li>
          ))}
        </ul>
      )}

      {order.approvalStatus === "pending" && (
        <div className="mt-6">
          <DecisionButtons
            locale={locale}
            orderId={order.id}
            disabled={!!session?.impersonating}
          />
        </div>
      )}
    </div>
  );
}
