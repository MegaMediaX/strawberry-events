import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { resolvePretixContext } from "@/lib/pretix/context";
import { listCheckinLists, checkinCounters } from "@/lib/pretix/checkin";
import { CheckinPanel } from "./checkin-panel";

export const dynamic = "force-dynamic";

export default async function CheckinPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string; list?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  const session = await getSessionContext();
  if (!session || !sp.event) notFound();

  const mapping = await prisma.eventMapping.findUnique({ where: { id: sp.event } });
  if (!mapping || !canAccessEvent(session, mapping.organizationId, mapping.localEventId)) {
    notFound();
  }
  const org = await prisma.organization.findUniqueOrThrow({ where: { id: mapping.organizationId } });
  const ctx = resolvePretixContext(org);

  let lists: { id: number; name: string }[] = [];
  let counters = { total: 0, checkedIn: 0 };
  try {
    lists = await listCheckinLists(ctx.organizerSlug, mapping.pretixEventSlug, ctx.token);
  } catch {
    lists = [];
  }
  const listId = sp.list ? Number(sp.list) : (lists[0]?.id ?? 0);
  if (listId) {
    try {
      counters = await checkinCounters(ctx.organizerSlug, mapping.pretixEventSlug, listId, ctx.token);
    } catch {
      // counters best-effort
    }
  }

  return (
    <div>
      <h1 className="text-2xl font-bold">{mapping.titleEn} — Check-in</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Checked in {counters.checkedIn} / {counters.total}
        {listId ? "" : " · no check-in list configured in pretix"}
      </p>
      <div className="mt-4">
        <CheckinPanel eventId={mapping.id} listId={listId} />
      </div>
    </div>
  );
}
