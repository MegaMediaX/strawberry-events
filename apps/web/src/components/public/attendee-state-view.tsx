"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, Clock, XCircle, Ban, MessageCircle } from "lucide-react";
import { registrationState } from "@/lib/approval/state";
import { hasLocation, locationLine, directionsUrl } from "@/lib/events/location";
import { QrCodeDisplay } from "./qr-code-display";
import { AddToCalendar } from "./add-to-calendar";
import { eventMetaLine } from "@/lib/events/format";
import { shouldShowTicketQr, shouldOfferTicketRecovery } from "./ticket-reveal";
import { claimFirstView, browserRevealStore } from "./ticket-reveal-memory";
import { shouldWatchForTicket, WATCH_INTERVAL_MS, WATCH_LIMIT } from "./ticket-refresh";
import { Ticket, TicketBody, TicketStub } from "@/components/paper/plate";
import { Stamp } from "@/components/paper/stamp";
import { PressLink } from "@/components/paper/press";
import type { AttendeeView } from "@/lib/registration/attendee-view";


const STATE_CONFIG = {
  issued: {
    Icon: CheckCircle2,
    heading: "You're registered.",
    /* The stamp's word IS the state. It is never the colour alone: the tint
       shifts only within tones that clear 4.5:1 on the stock, and the word and
       icon carry the meaning on their own (WCAG 1.4.1). */
    stamp: "Admit one",
    tone: "ink" as const,
  },
  pending_approval: {
    Icon: Clock,
    heading: "Registration under review",
    stamp: "Under review",
    tone: "ink" as const,
  },
  pending_payment: {
    Icon: Clock,
    heading: "Payment pending",
    stamp: "Unpaid",
    tone: "ink" as const,
  },
  rejected: {
    Icon: XCircle,
    heading: "Registration not approved",
    stamp: "Not approved",
    tone: "faded" as const,
  },
  canceled: {
    Icon: Ban,
    heading: "Registration canceled",
    stamp: "Void",
    tone: "faded" as const,
  },
} as const;

/** Added to the heading block on a first view. See app/globals.css. */
const SHEEN_CLASSES = ["ticket-sheen"];

interface AttendeeStateViewProps {
  order: AttendeeView;
  /**
   * Authorization to render the scannable pretix secret. Defaults to false so
   * every surface fails closed: only the HMAC-signed `/t/[token]` route, whose
   * URL cannot be guessed, is allowed to opt in. See ./ticket-reveal.
   */
  canRevealTicket?: boolean;
  /**
   * Optional recovery affordance rendered in place of a withheld QR (the
   * confirmation page passes a "email me my ticket link" button). Injected by
   * the route so this component stays route-agnostic.
   */
  ticketRecovery?: ReactNode;
}

export function AttendeeStateView({
  order,
  canRevealTicket = false,
  ticketRecovery,
}: AttendeeStateViewProps) {
  const state = registrationState(order);
  const { Icon, heading, stamp, tone } = STATE_CONFIG[state];
  const showQr = shouldShowTicketQr(state, canRevealTicket);
  // Venue-pinned, like every other date in the flow.
  const whenLine = order.schedule
    ? eventMetaLine(order.schedule.from, order.schedule.to, null)
    : null;
  const offerRecovery = shouldOfferTicketRecovery(state, canRevealTicket);

  /**
   * The payoff, once per ticket.
   *
   * Two conditions, and neither is known while rendering: whether this browser
   * has opened this ticket before (only localStorage knows) and whether the QR
   * has finished drawing (a flourish over a pulsing grey square reveals a
   * loading state). So the class is added imperatively once both land.
   *
   * Deliberately NOT React state. State would re-render the screen whose whole
   * job is to hold a barcode still, and setting it from an effect is the
   * cascading render the hooks lint rightly refuses. The server renders, and a
   * browser with storage blocked keeps, the plain ticket — the sweep is the
   * only thing that ever gets added, never taken away.
   */
  const headingRef = useRef<HTMLDivElement>(null);
  const firstView = useRef(false);
  // No QR on this screen means nothing to wait for.
  const qrSettled = useRef(!showQr);

  const playReveal = useCallback(() => {
    if (!firstView.current || !qrSettled.current) return;
    headingRef.current?.classList.add(...SHEEN_CLASSES);
  }, []);

  useEffect(() => {
    firstView.current = claimFirstView(order.orderCode, browserRevealStore());
    playReveal();
  }, [order.orderCode, playReveal]);

  const onQrSettled = useCallback(() => {
    qrSettled.current = true;
    playReveal();
  }, [playReveal]);

  /**
   * Wait for the ticket, instead of making the attendee think of reloading.
   *
   * Payment-pending and approval-pending are waiting rooms: someone else acts
   * and the QR appears. This route is force-dynamic, so its data was only ever
   * as fresh as the request that fetched it — an attendee could sit on
   * "Payment pending" while an organiser marked them paid across the room.
   *
   * `router.refresh()` re-runs the server component and merges the result
   * without discarding client state, so the reveal memory and the scroll
   * position survive. Paused while the tab is hidden, because a phone in a
   * pocket is not watching, and capped: a tab left open overnight must not
   * spend the night polling a route that queries pretix.
   */
  const router = useRouter();
  const watching = shouldWatchForTicket(state);
  useEffect(() => {
    if (!watching) return;
    let spent = 0;
    const id = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      spent += 1;
      if (spent > WATCH_LIMIT) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, WATCH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [watching, router]);

  return (
    <main className="mx-auto max-w-md px-4 py-12">
      {/* The plate no longer animates itself in. That entrance played for
          EVERY view of an emailed link — which is a door queue — and it opened
          at opacity 0, so a slow script left the ticket blank. What replaces
          it is below: one sweep of light across the heading, on the first view
          of this ticket in this browser, and never over the QR. */}
      <Ticket>
        <TicketBody className="px-7 pt-8 pb-9 text-center">
          <div ref={headingRef} className="-m-2 p-2">
            {/* The stamp carries the state; the icon is supplementary and
                hidden from the accessibility tree because the stamp's own word
                already says it and a duplicate announcement helps nobody. */}
            <Stamp tone={tone} icon={<Icon className="h-3.5 w-3.5" aria-hidden="true" />}>
              {stamp}
            </Stamp>
            <h1 className="font-heading mt-5 text-[length:var(--display-4)] leading-[1.05] tracking-[-0.01em]">
              {heading}
            </h1>
            <p className="mt-3 font-medium">{order.eventMapping.titleEn}</p>
          </div>

          {showQr && (
            <div className="mt-7 flex flex-col items-center gap-3">
              {/* The QR sits in a ruled well rather than a rounded, shadowed
                  box. The quiet zone ISO/IEC 18004 requires is the padding —
                  it is why this has generous inset padding and why nothing is
                  allowed to encroach on it. */}
              <div className="border border-[color:var(--paper-rule)] bg-white p-4">
                <QrCodeDisplay
                  value={order.pretixSecret ?? order.orderCode}
                  onSettled={onQrSettled}
                />
              </div>
              <p className="text-xs text-muted-foreground">Present this QR at the entrance.</p>
            </div>
          )}

          {offerRecovery && (
            <div className="mt-7 flex flex-col items-center gap-3">
              <p className="text-sm text-muted-foreground">
                Your ticket is ready. For security, the entrance QR is only shown
                on the personal ticket link we emailed you — an order code alone
                is not enough to open it.
              </p>
              {ticketRecovery}
            </div>
          )}

          {state === "pending_approval" && (
            <p className="mt-6 text-sm text-muted-foreground">
              Your registration is awaiting organizer approval. We&apos;ll email you once it&apos;s reviewed.
              No ticket is issued yet.{" "}
              <span className="font-medium text-foreground">
                This page updates on its own — you do not need to reload it.
              </span>
            </p>
          )}
          {state === "pending_payment" && (
            <p className="mt-6 text-sm text-muted-foreground">
              Your spot is reserved. Pay on arrival or as instructed by the organizer; your
              ticket and QR are issued once payment is confirmed.{" "}
              {/* Said out loud, because a screen that silently refreshes itself
                  is indistinguishable from one that has frozen. */}
              <span className="font-medium text-foreground">
                This page updates on its own — you do not need to reload it.
              </span>
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
        </TicketBody>

        {/* The stub. What is worth keeping once the door has scanned the body:
            the code, when, and where. */}
        <TicketStub className="px-7 pt-7 pb-8">
          {/* The order code is the ticket's serial number, so it is set like
              one — mono, letterspaced, and the largest thing on the stub. */}
          <div className="text-[0.625rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Order
          </div>
          <p className="mt-1.5 font-mono text-lg tracking-[0.12em]">{order.orderCode}</p>

          {state !== "rejected" && state !== "canceled" && whenLine && (
            <div className="mt-6">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                When
              </div>
              <p className="mt-1.5 text-sm tabular-nums">{whenLine}</p>
              {/* No icsHref on purpose. That route resolves through
                  getPublicEvent, which only answers for visibility=public AND
                  liveOnPretix — so a staff walk-in's ticket, or any ticket for
                  an event taken down after it ran, got a dead Apple-Calendar
                  button beside a working Google one. Without it the component
                  builds the .ics in the browser from the same data, which needs
                  no route and no visibility. */}
              {order.schedule && (
                <AddToCalendar
                  event={{
                    title: order.eventMapping.titleEn,
                    start: order.schedule.from,
                    end: order.schedule.to,
                    location: locationLine(order.eventMapping) || null,
                    description: null,
                  }}
                />
              )}
            </div>
          )}

          {state !== "rejected" && state !== "canceled" && hasLocation(order.eventMapping) && (
            <div className="mt-6">
              <div className="text-[0.625rem] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                Venue
              </div>
              {locationLine(order.eventMapping) && (
                <p className="mt-1.5 text-sm">{locationLine(order.eventMapping)}</p>
              )}
              {directionsUrl(order.eventMapping) && (
                <a
                  className="mt-1 inline-block text-primary-text underline underline-offset-4"
                  href={directionsUrl(order.eventMapping)!}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Get directions
                </a>
              )}
            </div>
          )}

          {state !== "rejected" &&
            state !== "canceled" &&
            order.eventMapping.whatsappChannelUrl && (
              <PressLink
                href={order.eventMapping.whatsappChannelUrl}
                target="_blank"
                rel="noopener noreferrer"
                /* `quiet` rather than the default `ink` plus an override: both
                   would emit a background utility of equal specificity, and
                   which one won would come down to their order in the generated
                   stylesheet rather than anything written here. Starting from a
                   variant that paints no background leaves nothing to race. */
                variant="quiet"
                /* WhatsApp's own green with white on it is 1.98:1 — brand
                   colour, not a text pair. The green stays (it is how the
                   button is recognised) and the label goes dark on it:
                   #111111 on #25D366 measures 9.52:1. */
                className="mt-7 w-full bg-[#25D366] text-[#111111] hover:opacity-90"
              >
                <MessageCircle className="h-5 w-5" />
                Join our WhatsApp channel
              </PressLink>
            )}
        </TicketStub>
      </Ticket>
    </main>
  );
}
