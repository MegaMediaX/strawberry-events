import { registrationState } from "@/lib/approval/state";
import { QrCodeDisplay } from "./qr-code-display";

interface OrderLike {
  orderCode: string;
  status: "pending" | "paid" | "canceled";
  approvalStatus: "not_required" | "pending" | "approved" | "rejected";
  pretixSecret?: string | null;
  eventMapping: { titleEn: string };
}

export function AttendeeStateView({ order }: { order: OrderLike }) {
  const state = registrationState(order);

  const heading: Record<typeof state, string> = {
    pending_approval: "Registration under review",
    rejected: "Registration not approved",
    pending_payment: "Payment pending",
    issued: "You're in! 🎉",
    canceled: "Registration canceled",
  };

  return (
    <main className="mx-auto max-w-md px-4 py-12 text-center">
      <h1 className="text-2xl font-bold">{heading[state]}</h1>
      <p className="mt-2 text-muted-foreground">
        {order.eventMapping.titleEn} · Order {order.orderCode}
      </p>

      {state === "issued" && (
        <div className="mt-6 flex flex-col items-center gap-3">
          <div className="rounded-[var(--radius-lg)] border border-border bg-card p-4">
            <QrCodeDisplay value={order.pretixSecret ?? order.orderCode} />
          </div>
          <p className="text-sm text-muted-foreground">Present this QR at the entrance.</p>
        </div>
      )}

      {state === "pending_approval" && (
        <p className="mt-6 text-sm text-muted-foreground">
          Your registration is awaiting organizer approval. We&apos;ll email you once it&apos;s
          reviewed. No ticket is issued yet.
        </p>
      )}

      {state === "pending_payment" && (
        <p className="mt-6 text-sm text-muted-foreground">
          Your spot is reserved. Pay on arrival or as instructed by the organizer; your
          ticket and QR are issued once payment is confirmed.
        </p>
      )}

      {state === "rejected" && (
        <p className="mt-6 text-sm text-muted-foreground">
          Unfortunately this registration was not approved. Contact the organizer if you have
          questions.
        </p>
      )}

      {state === "canceled" && (
        <p className="mt-6 text-sm text-muted-foreground">This registration was canceled.</p>
      )}
    </main>
  );
}
