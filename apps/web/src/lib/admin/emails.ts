import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { sendEmail } from "@/lib/email/service";

/** Org ids the session belongs to (null = super admin, unconstrained). */
function orgIds(session: SessionContext): string[] | null {
  if (session.isSuperAdmin) return null;
  return [...new Set(session.memberships.map((m) => m.organizationId))];
}

/** View access: super/organizer/finance. Check-in staff are blocked. */
function assertCanViewEmails(session: SessionContext) {
  if (!hasAnyRole(session, ["super_admin", "organizer_admin", "finance"])) {
    throw new ForbiddenError("Requires admin or finance");
  }
}

export interface EmailFilters {
  status?: string;
  templateType?: string;
  eventId?: string;
  q?: string;
  createdFrom?: Date;
  createdTo?: Date;
}

export async function listEmails(session: SessionContext, filters: EmailFilters = {}) {
  assertCanViewEmails(session);
  const orgs = orgIds(session);
  const and: Prisma.EmailLogWhereInput[] = [];
  if (orgs) and.push({ organizationId: { in: orgs } });
  if (filters.status) and.push({ status: filters.status as Prisma.EmailLogWhereInput["status"] });
  if (filters.templateType) and.push({ templateType: filters.templateType });
  if (filters.eventId) and.push({ eventMappingId: filters.eventId });
  if (filters.createdFrom || filters.createdTo) {
    and.push({ createdAt: { ...(filters.createdFrom ? { gte: filters.createdFrom } : {}), ...(filters.createdTo ? { lte: filters.createdTo } : {}) } });
  }
  if (filters.q && filters.q.trim()) {
    const q = filters.q.trim();
    and.push({ OR: [{ recipient: { contains: q, mode: "insensitive" } }, { subject: { contains: q, mode: "insensitive" } }] });
  }
  const where: Prisma.EmailLogWhereInput = and.length === 0 ? {} : and.length === 1 ? and[0] : { AND: and };

  const rows = await prisma.emailLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    // bodyText intentionally omitted from list payloads.
    select: {
      id: true, recipient: true, subject: true, templateType: true,
      organizationId: true, eventMappingId: true, attendeeRef: true,
      status: true, provider: true, lastError: true, createdAt: true,
    },
  });
  return rows;
}

export async function getEmailDetail(session: SessionContext, id: string) {
  assertCanViewEmails(session);
  const log = await prisma.emailLog.findUnique({
    where: { id },
    // body excluded — never surfaced in the UI.
    select: {
      id: true, recipient: true, subject: true, templateType: true,
      organizationId: true, eventMappingId: true, attendeeRef: true,
      status: true, provider: true, lastError: true, createdAt: true,
    },
  });
  if (!log) throw new ForbiddenError("Email not found");
  const orgs = orgIds(session);
  if (orgs && (!log.organizationId || !orgs.includes(log.organizationId))) {
    throw new ForbiddenError("Access denied");
  }
  return log;
}

export interface ResendResult {
  ok: boolean;
  sent: boolean;
}

/**
 * Resend a previously-logged email. Only super/organizer admins may resend
 * (finance + check-in blocked); never while impersonating. Re-sending respects
 * the live email mode (production-disabled stays disabled — no fake success) and
 * writes a fresh email-log row plus an audit entry.
 */
export async function resendEmail(session: SessionContext, id: string): Promise<ResendResult> {
  if (session.impersonating) throw new ForbiddenError("Cannot resend email while impersonating");
  if (!hasAnyRole(session, ["organizer_admin"])) {
    throw new ForbiddenError("Requires organizer admin or super admin");
  }
  const log = await prisma.emailLog.findUnique({ where: { id } });
  if (!log) throw new ForbiddenError("Email not found");
  const orgs = orgIds(session);
  if (orgs && (!log.organizationId || !orgs.includes(log.organizationId))) {
    throw new ForbiddenError("Access denied");
  }

  const sent = await sendEmail(
    { to: log.recipient, subject: log.subject, text: log.bodyText },
    {
      templateType: log.templateType ?? undefined,
      organizationId: log.organizationId,
      eventMappingId: log.eventMappingId,
      attendeeRef: log.attendeeRef,
    },
  );

  await prisma.auditLog.create({
    data: {
      organizationId: log.organizationId,
      actorUserId: session.userId,
      action: "email.resent",
      entityType: "email",
      entityId: log.id,
      success: sent,
    },
  });

  return { ok: true, sent };
}
