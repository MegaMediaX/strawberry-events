import { setRequestLocale } from "next-intl/server";
import { requireRole } from "@/lib/auth/session";
import { EventForm } from "../event-form";

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">New event</h1>
      <EventForm locale={locale} />
    </div>
  );
}
