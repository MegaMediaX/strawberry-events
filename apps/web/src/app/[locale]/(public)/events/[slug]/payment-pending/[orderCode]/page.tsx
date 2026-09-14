import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getOrderByCode } from "@/lib/registration/access";
import { toAttendeeView } from "@/lib/registration/attendee-view";
import { getEventDateRange } from "@/lib/events/date-range";
import { allowOrderCodeLookup } from "@/lib/security/order-lookup";
import { AttendeeStateView } from "@/components/public/attendee-state-view";
import { TooManyRequests } from "@/components/public/too-many-requests";

export const dynamic = "force-dynamic";

/**
 * The payment-pending landing, rendered by the same component as every other
 * order state.
 *
 * It used to be a page of its own with its own heading, its own wording and no
 * venue block, while `AttendeeStateView` carried a second pending_payment state
 * with a different icon and different copy. Which one an attendee saw depended
 * on the URL they arrived through, and the two drifted apart with nothing to
 * hold them together. One state, one screen.
 *
 * No `canRevealTicket`: this route is addressed by a guessable order code, and
 * a pending payment has no issued ticket to show in any case.
 */
export default async function PaymentPendingPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; orderCode: string }>;
}) {
  const { locale, slug, orderCode } = await params;
  setRequestLocale(locale);

  // Same enumeration exposure as the confirmation page: the URL is nothing but
  // a guessable order code, so throttle before touching the database.
  if (!(await allowOrderCodeLookup(slug))) return <TooManyRequests />;

  const order = await getOrderByCode(orderCode, slug);
  if (!order) notFound();

  const schedule = await getEventDateRange(order.eventMappingId);

  return (
    <AttendeeStateView
      locale={locale}
      eventSlug={slug}
      order={toAttendeeView(order, { revealSecret: false, schedule })}
    />
  );
}
