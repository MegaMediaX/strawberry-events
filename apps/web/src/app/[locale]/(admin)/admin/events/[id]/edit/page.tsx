import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getEventForEdit } from "@/lib/events/service";
import { coverImageUrl } from "@/lib/events/cover-image";
import { EventForm } from "../../event-form";
import { CoverUploader } from "./cover-uploader";

export default async function EditEventPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);

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
          live: event.liveOnPretix,
          waitlistEnabled: event.waitlistEnabled,
          seatSelectionEnabled: event.seatSelectionEnabled,
          badgeAutoPrint: event.badgeAutoPrint,
          payBeforeApproval: event.payBeforeApproval,
          venueName: event.venueName ?? undefined,
          address: event.address ?? undefined,
          city: event.city ?? undefined,
          country: event.country ?? undefined,
          mapUrl: event.mapUrl ?? undefined,
          mapEmbedUrl: event.mapEmbedUrl ?? undefined,
          latitude: event.latitude ?? undefined,
          longitude: event.longitude ?? undefined,
        }}
      />
      <CoverUploader
        locale={locale}
        eventId={event.id}
        initialUrl={event.coverImagePath ? coverImageUrl(event.coverImagePath) : null}
      />
    </div>
  );
}
