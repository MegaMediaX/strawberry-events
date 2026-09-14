import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { getEventForSession, listTickets } from "@/lib/events/service";
import { StaffEventPicker } from "../_components/event-picker";
import { WalkInForm } from "./walk-in-form";

export const dynamic = "force-dynamic";

export default async function StaffRegistrationsPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { locale } = await params;
  const { event } = await searchParams;
  setRequestLocale(locale);
  const session = await getSessionContext();
  if (!session) return null;

  // Event chosen → render the walk-in form for it (access-checked).
  if (event) {
    const mapping = await getEventForSession(session, event);
    if (!mapping) {
      return <p className="text-muted-foreground">Event not found or access denied.</p>;
    }
    let tickets: { id: number; title: string; priceCents: number }[] = [];
    try {
      const items = await listTickets(session, event);
      tickets = items
        .filter((i) => i.active)
        .map((i) => ({
          id: i.id,
          title: locale === "ar" && i.titleAr ? i.titleAr : i.titleEn,
          priceCents: i.priceCents,
        }));
    } catch {
      tickets = [];
    }
    return (
      <div className="mx-auto max-w-xl">
        <h1 className="text-2xl font-bold">Walk-in registration</h1>
        <p className="mt-1 text-sm text-muted-foreground">{mapping.titleEn}</p>
        <div className="mt-4">
          <WalkInForm locale={locale} eventId={mapping.id} tickets={tickets} />
        </div>
      </div>
    );
  }

  // No event → pick from accessible events.
  return (
    <StaffEventPicker
      session={session}
      locale={locale}
      basePath="staff/registrations"
      title="Walk-in registration"
      hint="Choose an event to register a walk-in attendee."
    />
  );
}
