import { setRequestLocale } from "next-intl/server";
import { EventForm } from "../event-form";

export default async function NewEventPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">New event</h1>
      <EventForm locale={locale} />
    </div>
  );
}
