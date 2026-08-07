import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getOrderByToken } from "@/lib/registration/access";
import { AttendeeStateView } from "@/components/public/attendee-state-view";

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

  // The only surface allowed to render the pretix secret QR: reaching here
  // required a valid HMAC over the order code, which cannot be produced without
  // MAGIC_LINK_SECRET. Order-code-addressed routes must not opt in.
  return <AttendeeStateView order={order} canRevealTicket />;
}
