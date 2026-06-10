"use client";

import { motion } from "framer-motion";
import { CheckCircle2, Clock, XCircle, Ban } from "lucide-react";
import { registrationState } from "@/lib/approval/state";
import { hasLocation, locationLine, directionsUrl, type EventLocation } from "@/lib/events/location";
import { QrCodeDisplay } from "./qr-code-display";

interface OrderLike {
  orderCode: string;
  status: "pending" | "paid" | "canceled";
  approvalStatus: "not_required" | "pending" | "approved" | "rejected";
  pretixSecret?: string | null;
  eventMapping: { titleEn: string } & EventLocation;
}

const STATE_CONFIG = {
  issued: {
    Icon: CheckCircle2,
    iconCls: "text-emerald-500",
    heading: "You're in!",
    bg: "from-emerald-500/5 to-transparent",
  },
  pending_approval: {
    Icon: Clock,
    iconCls: "text-amber-500",
    heading: "Registration under review",
    bg: "from-amber-500/5 to-transparent",
  },
  pending_payment: {
    Icon: Clock,
    iconCls: "text-blue-500",
    heading: "Payment pending",
    bg: "from-blue-500/5 to-transparent",
  },
  rejected: {
    Icon: XCircle,
    iconCls: "text-destructive",
    heading: "Registration not approved",
    bg: "from-destructive/5 to-transparent",
  },
  canceled: {
    Icon: Ban,
    iconCls: "text-muted-foreground",
    heading: "Registration canceled",
    bg: "from-muted/40 to-transparent",
  },
} as const;

export function AttendeeStateView({ order }: { order: OrderLike }) {
  const state = registrationState(order);
  const { Icon, iconCls, heading, bg } = STATE_CONFIG[state];

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: "easeOut" }}
        className={`rounded-[var(--radius-xl)] border border-border bg-gradient-to-b ${bg} p-8 text-center`}
      >
        <Icon className={`mx-auto h-12 w-12 ${iconCls}`} />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">{heading}</h1>
        <p className="mt-1 font-medium text-foreground">{order.eventMapping.titleEn}</p>
        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{order.orderCode}</p>

        {state === "issued" && (
          <div className="mt-8 flex flex-col items-center gap-3">
            <div className="rounded-[var(--radius-lg)] border-2 border-primary/20 bg-background p-4 shadow-sm">
              <QrCodeDisplay value={order.pretixSecret ?? order.orderCode} />
            </div>
            <p className="text-xs text-muted-foreground">Present this QR at the entrance.</p>
          </div>
        )}

        {state === "pending_approval" && (
          <p className="mt-6 text-sm text-muted-foreground">
            Your registration is awaiting organizer approval. We&apos;ll email you once it&apos;s reviewed.
            No ticket is issued yet.
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
            Unfortunately this registration was not approved. Contact the organizer if you have questions.
          </p>
        )}
        {state === "canceled" && (
          <p className="mt-6 text-sm text-muted-foreground">This registration was canceled.</p>
        )}

        {state !== "rejected" && state !== "canceled" && hasLocation(order.eventMapping) && (
          <div className="mt-8 border-t border-border pt-4 text-sm">
            <div className="font-medium">Venue</div>
            {locationLine(order.eventMapping) && (
              <p className="mt-1 text-muted-foreground">{locationLine(order.eventMapping)}</p>
            )}
            {directionsUrl(order.eventMapping) && (
              <a
                className="mt-1 inline-block text-primary underline"
                href={directionsUrl(order.eventMapping)!}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get directions
              </a>
            )}
          </div>
        )}
      </motion.div>
    </main>
  );
}
