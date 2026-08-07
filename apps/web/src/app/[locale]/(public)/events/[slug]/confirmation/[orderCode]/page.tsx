import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getOrderByCode } from "@/lib/registration/access";
import { allowOrderCodeLookup } from "@/lib/security/order-lookup";
import { AttendeeStateView } from "@/components/public/attendee-state-view";
import { TooManyRequests } from "@/components/public/too-many-requests";
import { ResendTicketLink } from "@/components/public/resend-ticket-link";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; orderCode: string }>;
}) {
  const { locale, slug, orderCode } = await params;
  setRequestLocale(locale);

  // Throttle before the lookup: this route is addressed by a guessable
  // five-character order code, so an unthrottled read is an enumeration oracle
  // for an event's live orders.
  if (!(await allowOrderCodeLookup(slug))) return <TooManyRequests />;

  const order = await getOrderByCode(orderCode, slug);
  if (!order) notFound();

  // No `canRevealTicket` — an order code must never yield a scannable ticket.
  // Issued orders get the "email me my link" recovery path instead; pending
  // approval and pending payment have no ticket to show either way, so those
  // states (and the links already in attendees' inboxes) are unaffected.
  return (
    <AttendeeStateView
      order={order}
      ticketRecovery={<ResendTicketLink slug={slug} orderCode={orderCode} />}
    />
  );
}
