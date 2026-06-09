import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { scopeWhere, canAccessEvent } from "@/lib/auth/org-scope";

export const dynamic = "force-dynamic";

export default async function StaffHome({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const session = await getSessionContext();

  const all = session
    ? await prisma.eventMapping.findMany({ where: scopeWhere(session), orderBy: { createdAt: "desc" } })
    : [];
  const events = session
    ? all.filter((e) => canAccessEvent(session, e.organizationId, e.localEventId))
    : [];

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Your events</h1>
      {events.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No assigned events.</p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/${locale}/staff/checkin?event=${e.id}`}
                className="block rounded-[var(--radius-lg)] border border-border p-4 hover:bg-muted"
              >
                <div className="font-medium">{e.titleEn}</div>
                <div className="text-sm text-muted-foreground">{e.pretixEventSlug}</div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
