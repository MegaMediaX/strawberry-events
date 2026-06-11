import { getPublicEvent } from "@/lib/events/public";
import { buildIcs } from "@/lib/calendar/ics";
import { locationLine } from "@/lib/events/location";

export const dynamic = "force-dynamic";

/**
 * Download an .ics for a PUBLIC, live event. getPublicEvent only resolves
 * visibility=public + liveOnPretix events, so hidden/private/draft events return
 * 404 here — no calendar leak. Dates come from pretix (source of truth).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const data = await getPublicEvent(slug);
  if (!data) return new Response("Not found", { status: 404 });

  const { event, dateFrom, dateTo } = data;
  const ics = buildIcs({
    title: event.titleEn,
    start: dateFrom ?? new Date().toISOString(),
    end: dateTo,
    location: locationLine(event) || null,
    description: event.descriptionEn,
  });

  return new Response(ics, {
    headers: {
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${slug}.ics"`,
    },
  });
}
