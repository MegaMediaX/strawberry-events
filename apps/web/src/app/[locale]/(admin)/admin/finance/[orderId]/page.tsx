import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getFinanceOrder } from "@/lib/finance/service";
import { centsToPrice } from "@/lib/pretix/mappers";
import { MarkPaidButton } from "../mark-paid-button";

export const dynamic = "force-dynamic";

export default async function FinanceOrderPage({
  params,
}: {
  params: Promise<{ locale: string; orderId: string }>;
}) {
  const { locale, orderId } = await params;
  setRequestLocale(locale);
  await requireRole(
    ["super_admin", "organizer_admin", "finance"],
    `/${locale}/login`,
  );
  const session = await getSessionContext();
  const order = session ? await getFinanceOrder(session, orderId) : null;
  if (!order) notFound();

  const impersonating = !!session?.impersonating;

  return (
    <div className="max-w-lg">
      <h1 className="text-2xl font-bold">Order {order.orderCode}</h1>
      <dl className="mt-4 grid grid-cols-[120px_1fr] gap-y-2 text-sm">
        <dt className="text-muted-foreground">Event</dt>
        <dd>{order.eventMapping.titleEn}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd>{order.email}</dd>
        <dt className="text-muted-foreground">Amount</dt>
        <dd>{order.totalCents === 0 ? "Free" : `$${centsToPrice(order.totalCents)}`}</dd>
        <dt className="text-muted-foreground">Method</dt>
        <dd>{order.provider === "manual_cod" ? "COD / manual" : "Free"}</dd>
        <dt className="text-muted-foreground">Status</dt>
        <dd className="font-medium">{order.status}</dd>
      </dl>

      {order.status === "pending" && order.provider === "manual_cod" && (
        <div className="mt-6">
          <MarkPaidButton locale={locale} orderId={order.id} disabled={impersonating} />
        </div>
      )}
    </div>
  );
}
