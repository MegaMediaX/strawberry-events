import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getOrderByCode } from "@/lib/registration/access";
import { AttendeeStateView } from "@/components/public/attendee-state-view";

export const dynamic = "force-dynamic";

export default async function ConfirmationPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string; orderCode: string }>;
}) {
  const { locale, slug, orderCode } = await params;
  setRequestLocale(locale);

  const order = await getOrderByCode(orderCode, slug);
  if (!order) notFound();

  return <AttendeeStateView order={order} />;
}
