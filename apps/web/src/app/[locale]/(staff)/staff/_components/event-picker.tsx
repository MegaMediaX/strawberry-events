import Link from "next/link";

import { prisma } from "@/lib/db/client";
import { scopeWhere, canAccessEvent } from "@/lib/auth/org-scope";
import type { SessionContext } from "@/lib/auth/types";

/**
 * The events this staff member can open.
 *
 * Two-stage on purpose: `scopeWhere` narrows to the organisations the session
 * can see, `canAccessEvent` then applies the per-event grants a check-in
 * account is usually limited by. One function, so the picker and the events
 * list cannot come to different answers about what "assigned to you" means.
 */
export async function listStaffEvents(session: SessionContext) {
  const all = await prisma.eventMapping.findMany({
    where: scopeWhere(session),
    orderBy: { createdAt: "desc" },
  });
  return all.filter((e) => canAccessEvent(session, e.organizationId, e.localEventId));
}

/**
 * The events this staff member can open, as a list of links into one tool.
 *
 * Extracted because the check-in route needed it and two copies of this query
 * already existed: a third would have been the point at which they started
 * disagreeing about what "assigned to you" means.
 */
export async function StaffEventPicker({
  session,
  locale,
  /** Where a chosen event leads, e.g. "staff/checkin". */
  basePath,
  title,
  hint,
}: {
  session: SessionContext;
  locale: string;
  basePath: string;
  title: string;
  hint: string;
}) {
  const events = await listStaffEvents(session);

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{hint}</p>
      {events.length === 0 ? (
        <p className="mt-4 text-muted-foreground">
          No assigned events. Ask an organiser to give this account access to the event
          you are working.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {events.map((e) => (
            <li key={e.id}>
              <Link
                href={`/${locale}/${basePath}?event=${e.id}`}
                // 44px+ target: this is pressed on a handheld, often in a hurry.
                className="block min-h-16 rounded-[var(--radius-lg)] border border-border p-4 hover:bg-muted"
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
