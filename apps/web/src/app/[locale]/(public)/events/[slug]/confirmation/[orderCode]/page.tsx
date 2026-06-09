import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getOrderByCode } from "@/lib/registration/access";
import { QrCodeDisplay } from "@/components/public/qr-code-display";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; orderCode: string }>;
}) {
  const { locale, orderCode } = await params;
  setRequestLocale(locale);

  const order = await getOrderByCode(orderCode);
  if (!order) notFound();

  const issued = order.status === "paid";

  return (
    <main className="mx-auto max-w-md px-4 py-12 text-center">
      <h1 className="text-2xl font-bold">
        {issued ? "You're in! 🎉" : "Registration received"}
      </h1>
      <p className="mt-2 text-muted-foreground">
        {order.eventMapping.titleEn} · Order {order.orderCode}
      </p>

      {issued ? (
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
            <QrCodeDisplay value={order.orderCode} />
          </div>
          <p className="text-sm text-muted-foreground">
            Present this QR at the entrance.
          </p>
        </div>
      ) : (
        <p className="mt-6 text-sm text-muted-foreground">
          Your ticket will be available once payment is confirmed.
        </p>
      )}
    </main>
  );
}
