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
   * Only present when the surface is authorized to render the QR. Omitted
   * entirely rather than nulled, so it is absent from the serialized payload
   * instead of merely empty.
   */
  pretixSecret?: string;
  eventMapping: {
    titleEn: string;
    whatsappChannelUrl: string | null;
  } & EventLocation;
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
  { revealSecret }: { revealSecret: boolean },
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

  if (revealSecret && order.pretixSecret) {
    view.pretixSecret = order.pretixSecret;
  }

  return view;
}
