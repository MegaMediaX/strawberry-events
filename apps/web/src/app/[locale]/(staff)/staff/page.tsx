import { redirect } from "next/navigation";
import { setRequestLocale } from "next-intl/server";

export const dynamic = "force-dynamic";

/**
 * The staff landing, which is the events list.
 *
 * This page used to run the same query as /staff/events, apply the same filter
 * and render the same list — the only difference an operator could perceive
 * being that one was the home screen and the other a nav item, and the two
 * offering different links out of identical rows. One list, one place: the nav
 * points at /staff/events, so that is where the wordmark leads too.
 */
export default async function StaffHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  redirect(`/${locale}/staff/events`);
}
