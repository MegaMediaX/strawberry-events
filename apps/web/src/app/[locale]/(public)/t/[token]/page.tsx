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

  return <AttendeeStateView order={order} />;
}
