import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { listEventsForSession } from "@/lib/events/service";
import { Button } from "@/components/ui/button";
import { EventList } from "./event-list";

export default async function EventsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  const session = await getSessionContext();
  const events = session ? await listEventsForSession(session) : [];

  const rows = events.map((e) => ({
    id: e.id,
    titleEn: e.titleEn,
    titleAr: e.titleAr,
    slug: e.pretixEventSlug,
    visibility: e.visibility,
    comingSoon: e.comingSoon,
  }));

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold">Events</h1>
        <Link href={`/${locale}/admin/events/new`}>
          <Button>+ New event</Button>
        </Link>
      </div>
      <EventList events={rows} locale={locale} />
    </div>
  );
}
