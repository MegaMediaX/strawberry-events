import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getOrderByToken } from "@/lib/registration/access";
import { QrCodeDisplay } from "@/components/public/qr-code-display";

export const dynamic = "force-dynamic";

export default async function GuestTicketPage({
  params,
}: {
  params: Promise<{ locale: string; token: string }>;
}) {
  const { locale, token } = await params;
  setRequestLocale(locale);

  const order = await getOrderByToken(token);
  if (!order) notFound(); // invalid/tampered → generic not-found, no info leak

  const issued = order.status === "paid";

  return (
    <main className="mx-auto max-w-md px-4 py-12 text-center">
      <h1 className="text-2xl font-bold">{order.eventMapping.titleEn}</h1>
      <p className="mt-1 text-muted-foreground">Order {order.orderCode}</p>
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
          Your ticket will be issued once payment is confirmed.
        </p>
      )}
    </main>
  );
}
