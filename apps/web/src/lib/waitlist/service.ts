import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { sendEmail } from "@/lib/email/service";
import { emit } from "@/lib/webhooks/service";
import { record } from "@/lib/audit/service";
import { waitlistPromotedEmail, type Locale } from "@/lib/email/templates";

/** Join the waitlist for an event (optionally a specific ticket). Idempotent per email. */
export async function joinWaitlist(
  eventMappingId: string,
  email: string,
  itemId: number | null,
) {
  const existing = await prisma.waitlistEntry.findFirst({
    where: { eventMappingId, email, itemId, status: "waiting" },
  });
  if (existing) return existing;

  const last = await prisma.waitlistEntry.findFirst({
    where: { eventMappingId, itemId },
    orderBy: { position: "desc" },
  });
  const position = (last?.position ?? 0) + 1;

  const entry = await prisma.waitlistEntry.create({
    data: { eventMappingId, email, itemId, position, status: "waiting" },
  });
  // Webhook emit is best-effort and must never break the join.
  try {
    const mapping = await prisma.eventMapping.findUnique({
      where: { id: eventMappingId },
      select: { organizationId: true },
    });
    if (mapping) {
      void emit(mapping.organizationId, "waitlist.joined", { email, position }, eventMappingId);
      void record({
        organizationId: mapping.organizationId, eventMappingId,
        action: "waitlist.joined", entityType: "waitlist", entityId: entry.id,
      });
    }
  } catch {
    // ignore
  }
  return entry;
}

/** List waitlist entries for an event the session can access. */
export async function listWaitlist(session: SessionContext, eventMappingId: string) {
  const entries = await prisma.waitlistEntry.findMany({
    where: { eventMappingId },
    include: { eventMapping: true },
    orderBy: { position: "asc" },
  });
  const first = entries[0];
  if (
    first &&
    !canAccessEvent(session, first.eventMapping.organizationId, first.eventMapping.localEventId)
  ) {
    return [];
  }
  return entries;
}

/** Promote a waitlisted entry (organizer/super admin only). Emails + audits. */
export async function promote(session: SessionContext, entryId: string) {
  if (session.impersonating) {
    throw new ForbiddenError("Cannot promote while impersonating");
  }
  if (!hasAnyRole(session, ["organizer_admin"])) {
    throw new ForbiddenError("Requires organizer admin or super admin");
  }
  const entry = await prisma.waitlistEntry.findFirst({
    where: { id: entryId },
    include: { eventMapping: true },
  });
  if (
    !entry ||
    !canAccessEvent(session, entry.eventMapping.organizationId, entry.eventMapping.localEventId)
  ) {
    throw new ForbiddenError("Waitlist entry not found or access denied");
  }

  const updated = await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: "promoted", promotedAt: new Date() },
  });

  const locale: Locale = "en";
  const registerUrl = `${process.env.APP_URL ?? ""}/${locale}/events/${entry.eventMapping.pretixEventSlug ?? ""}/register`;
  try {
    await sendEmail({
      to: entry.email,
      ...waitlistPromotedEmail(locale, entry.eventMapping.titleEn, registerUrl),
    });
  } catch {
    // best-effort
  }

  await prisma.auditLog.create({
    data: {
      organizationId: entry.eventMapping.organizationId,
      actorUserId: session.userId,
      action: "waitlist.promoted",
      entityType: "waitlist",
      entityId: entry.id,
    },
  });

  void emit(
    entry.eventMapping.organizationId,
    "waitlist.promoted",
    { email: entry.email, entryId: entry.id },
    entry.eventMappingId,
  );

  return updated;
}
