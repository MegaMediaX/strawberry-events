import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getOrderByCode } from "@/lib/registration/access";

export const dynamic = "force-dynamic";

export default async function PaymentPendingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; orderCode: string }>;
}) {
  const { locale, orderCode } = await params;
  setRequestLocale(locale);

  const order = await getOrderByCode(orderCode);
  if (!order) notFound();

  return (
    <main className="mx-auto max-w-md px-4 py-12 text-center">
      <h1 className="text-2xl font-bold">Payment pending</h1>
      <p className="mt-2 text-muted-foreground">
        {order.eventMapping.titleEn} · Order {order.orderCode}
      </p>
      <div className="mt-6 rounded-[var(--radius-lg)] border border-border bg-card p-4 text-sm text-muted-foreground">
        Your registration is reserved. Pay on arrival or as instructed by the
        organizer. Your ticket and QR code will be issued once payment is
        confirmed. Keep your order code{" "}
        <span className="font-mono font-semibold text-foreground">
          {order.orderCode}
        </span>
        .
      </div>
    </main>
  );
}
