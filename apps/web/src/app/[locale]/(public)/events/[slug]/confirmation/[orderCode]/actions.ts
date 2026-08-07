"use server";

import { getOrderByCode } from "@/lib/registration/access";
import { registrationState } from "@/lib/approval/state";
import { sendEmail } from "@/lib/email/service";
import { confirmationEmail } from "@/lib/email/templates";
import { recipientLocale } from "@/lib/email/recipient-locale";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/order-lookup";

/**
 * Deliberately identical for "no such order", "not issued yet", "sent" and
 * "send failed". The caller only ever holds an order code, so any difference
 * here would turn this action into the enumeration oracle the confirmation page
 * itself no longer is.
 */
const NEUTRAL =
  "If that order has a ticket, we've emailed the link to the address on the registration.";

const THROTTLED = "Too many requests. Please wait a few minutes and try again.";

export interface ResendTicketLinkResult {
  message: string;
}

/**
 * Recovery path for someone holding only an order code: mail the signed
 * magic-link to the address already on the order. The ticket secret moves to a
 * channel the requester must already control instead of being rendered to
 * whoever typed the URL.
 */
export async function resendTicketLinkAction(
  slug: string,
  orderCode: string,
): Promise<ResendTicketLinkResult> {
  const ip = await clientIp();
  if (!rateLimit(`resend-ticket-ip:${ip}`, 3, 600_000).allowed) {
    return { message: THROTTLED };
  }
  // Per-order cap on top of the per-IP one: without it, an attacker who does
  // know a code could mailbomb that attendee from a rotating IP pool.
  if (!rateLimit(`resend-ticket-order:${slug}:${orderCode}`, 3, 3_600_000).allowed) {
    return { message: NEUTRAL };
  }

  const order = await getOrderByCode(orderCode, slug);
  if (!order || registrationState(order) !== "issued") return { message: NEUTRAL };

  try {
    const appUrl = process.env.APP_URL ?? "";
    const locale = await recipientLocale(order.userId);
    const ticketUrl = `${appUrl}/${locale}/t/${order.magicLinkToken}`;
    const msg = confirmationEmail(
      locale,
      order.eventMapping.titleEn,
      order.orderCode,
      ticketUrl,
    );
    await sendEmail(
      { to: order.email, ...msg },
      {
        templateType: "ticket_link_resend",
        organizationId: order.eventMapping.organizationId,
        eventMappingId: order.eventMappingId,
        attendeeRef: order.orderCode,
      },
    );
  } catch {
    // swallow — a mail-transport failure must not become a signal about
    // whether the order exists.
  }

  return { message: NEUTRAL };
}
