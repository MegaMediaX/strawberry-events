import type { AttendeeApprovalStatus, AttendeeOrderStatus } from "@prisma/client";
import type { EventLocation } from "@/lib/events/location";

/**
 * The attendee-facing projection of an order — the ONLY shape that may cross
 * into a client component.
 *
 * `AttendeeStateView` is a `"use client"` component, so whatever object it
 * receives as a prop is serialized into the RSC payload and shipped in the page
 * HTML, whether or not it is rendered. Passing the Prisma row straight through
 * therefore published `pretixSecret` (a working entrance QR) and
 * `magicLinkToken` (the credential for `/t/[token]`) on the order-code-
 * addressed confirmation page, which needs nothing but a five-character,
 * enumerable code to open. Withholding the QR from the markup was not enough:
 * the secret travelled in the props regardless.
 *
 * A TypeScript interface cannot prevent this. Structural typing accepts a wider
 * object wherever a narrower one is declared, and excess-property checks only
 * apply to object literals — so `order={row}` type-checks cleanly while
 * carrying every column. The narrowing has to happen at RUNTIME, which is what
 * `toAttendeeView` is for.
 */
export interface AttendeeView {
  orderCode: string;
  status: AttendeeOrderStatus;
  approvalStatus: AttendeeApprovalStatus;
  /**
   * Only present when the surface is authorized to render the QR.
   *
   * `toAttendeeView` OMITS the key rather than setting it to null, so it is
   * absent from the serialized payload instead of present-and-empty. `null` is
   * still accepted in the type because the component already tolerated it and
   * its own tests exercise that case.
   */
  pretixSecret?: string | null;
  eventMapping: {
    titleEn: string;
    /** Optional, matching the shape the component already accepted. */
    whatsappChannelUrl?: string | null;
  } & EventLocation;
  /**
   * When the event runs, as ISO strings.
   *
   * Not read off the order row: the dates come from the sub-event schedule and
   * are passed in by the route. A ticket that does not say when the event is
   * fails at the one moment it is opened for.
   */
  schedule?: { from: string; to: string | null } | null;
}

/** The subset of an order row this projection reads. */
interface OrderRow {
  orderCode: string;
  status: AttendeeOrderStatus;
  approvalStatus: AttendeeApprovalStatus;
  pretixSecret: string | null;
  eventMapping: {
    titleEn: string;
    whatsappChannelUrl: string | null;
  } & EventLocation;
}

/**
 * Copy an order row into the client-safe shape, field by field.
 *
 * Deliberately written as explicit assignments rather than a spread or a
 * `delete`: a spread would carry any column added to the schema later, and this
 * function is the boundary that has to fail safe when that happens.
 *
 * `revealSecret` is the SAME decision as `canRevealTicket` on the component, so
 * the data and the display are gated together. A surface that may not show the
 * QR does not receive the secret at all, and cannot leak what it never had.
 */
export function toAttendeeView(
  order: OrderRow,
  {
    revealSecret,
    schedule = null,
  }: {
    revealSecret: boolean;
    /**
     * Event dates, resolved by the route. `from` may be null — an event with
     * no sessions has no schedule to show, and the view renders nothing rather
     * than inventing one.
     */
    schedule?: { from: Date | string | null; to: Date | string | null } | null;
  },
): AttendeeView {
  const view: AttendeeView = {
    orderCode: order.orderCode,
    status: order.status,
    approvalStatus: order.approvalStatus,
    eventMapping: {
      titleEn: order.eventMapping.titleEn,
      whatsappChannelUrl: order.eventMapping.whatsappChannelUrl,
      venueName: order.eventMapping.venueName,
      address: order.eventMapping.address,
      city: order.eventMapping.city,
      country: order.eventMapping.country,
      mapUrl: order.eventMapping.mapUrl,
      mapEmbedUrl: order.eventMapping.mapEmbedUrl,
      latitude: order.eventMapping.latitude,
      longitude: order.eventMapping.longitude,
    },
  };

  if (schedule?.from) {
    view.schedule = {
      from: new Date(schedule.from).toISOString(),
      to: schedule.to ? new Date(schedule.to).toISOString() : null,
    };
  }

  if (revealSecret && order.pretixSecret) {
    view.pretixSecret = order.pretixSecret;
  }

  return view;
}
