import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { getEventForEdit } from "@/lib/events/service";
import { EventForm } from "../../event-form";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);

  const session = await getSessionContext();
  const detail = session ? await getEventForEdit(session, id) : null;
  if (!detail) notFound();
  const { mapping: event, dateFrom, dateTo } = detail;

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">Edit event</h1>
      <EventForm
        locale={locale}
        eventId={event.id}
        initial={{
          titleEn: event.titleEn,
          titleAr: event.titleAr ?? undefined,
          slug: event.pretixEventSlug,
          descriptionEn: event.descriptionEn ?? undefined,
          descriptionAr: event.descriptionAr ?? undefined,
          dateFrom: dateFrom ?? undefined,
          dateTo: dateTo ?? undefined,
          visibility: event.visibility,
          accountMode: event.accountMode,
          approvalMode: event.approvalMode,
          comingSoon: event.comingSoon,
        }}
      />
    </div>
  );
}
