import { getSessionContext } from "@/lib/auth/session";
import { rosters, rosterCsv } from "@/lib/admin/data";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return new Response("Not authenticated", { status: 401 });

  const url = new URL(request.url);
  const eventId = url.searchParams.get("event");
  const item = url.searchParams.get("item");
  if (!eventId || !item) return new Response("event and item are required", { status: 400 });

  try {
    const all = await rosters(session, eventId);
    const roster = all.find((r) => String(r.itemId) === item);
    if (!roster) return new Response("No roster for that item", { status: 404 });

    const slug = (roster.subEventTitle ?? roster.itemName)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    return new Response(rosterCsv(roster), {
      headers: {
        "content-type": "text/csv; charset=utf-8",
        "content-disposition": `attachment; filename="roster-${slug || item}.csv"`,
      },
    });
  } catch (err) {
    return new Response((err as Error).message, { status: 403 });
  }
}
