import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getOrderByToken } from "@/lib/registration/access";
import { toAttendeeView } from "@/lib/registration/attendee-view";
import { getSessionContext } from "@/lib/auth/session";
import { AttendeeStateView } from "@/components/public/attendee-state-view";
import { ClaimBanner } from "./claim-banner";

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

  /**
   * Reading the session must not CREATE one. This page is reached by opening a
   * link from an inbox, and it stays a guest surface: `getSessionContext` only
   * reads an existing cookie, so a signed-out visitor sees exactly what they
   * saw before — the ticket, and a sentence about accounts.
   */
  const session = await getSessionContext();

  // The only surface allowed to render the pretix secret QR: reaching here
  // required a valid HMAC over the order code, which cannot be produced without
  // MAGIC_LINK_SECRET. Order-code-addressed routes must not opt in.
  // Authorized to show the QR, so the projection carries the secret — but
  // still a projection: magicLinkToken and the rest of the row stay server-side.
  return (
    <>
      <ClaimBanner
        locale={locale}
        token={token}
        signedIn={Boolean(session)}
        alreadyMine={Boolean(session && order.userId === session.userId)}
      />
      <AttendeeStateView
        order={toAttendeeView(order, { revealSecret: true })}
        canRevealTicket
      />
    </>
  );
}
