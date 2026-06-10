import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/types";
import { eventScope, orderScope, mergeWhere } from "./scope";

const ISSUED: Prisma.AttendeeOrderWhereInput = {
  status: "paid",
  approvalStatus: { in: ["not_required", "approved"] },
};
const PENDING_PAYMENT: Prisma.AttendeeOrderWhereInput = {
  status: "pending",
  approvalStatus: { in: ["not_required", "approved"] },
};

export type ViewerRole = "super_admin" | "organizer_admin" | "finance" | "checkin_staff";

/** The most privileged role the session holds, used to shape the dashboard view. */
export function primaryRole(session: SessionContext): ViewerRole {
  if (session.isSuperAdmin) return "super_admin";
  const roles = new Set(session.memberships.map((m) => m.role));
  if (roles.has("organizer_admin")) return "organizer_admin";
  if (roles.has("finance")) return "finance";
  return "checkin_staff";
}

export interface DashboardKpis {
  totalEvents: number;
  openEvents: number;
  upcomingEvents: number;
  totalRegistrations: number;
  issuedTickets: number;
  pendingApproval: number;
  pendingPayment: number;
  checkedIn: number;
  waitlist: number;
  codPendingCents: number;
  todayRegistrations: number;
}

export interface DashboardData {
  viewerRole: ViewerRole;
  kpis: DashboardKpis;
  upcomingEventsList: { id: string; titleEn: string; visibility: string; comingSoon: boolean; liveOnPretix: boolean }[];
  recentRegistrations: { id: string; orderCode: string; attendee: string; event: string; createdAt: Date }[];
  recentCheckins: { id: string; attendeeRef: string; event: string; createdAt: Date }[];
  recentAudit: { id: string; action: string; entityType: string; createdAt: Date }[];
  capacity: { eventId: string; titleEn: string; registrations: number; issued: number }[];
  /** Sections this role may see (drives UI; data is already scoped regardless). */
  sections: { financial: boolean; checkins: boolean; audit: boolean; waitlist: boolean };
}

function startOfToday(now: Date): Date {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Build the role-scoped admin dashboard. All counts and lists are constrained by
 * {@link eventScope}/{@link orderScope} so cross-org data never leaks. `sections`
 * narrows what finance and check-in staff are shown (financial-safe / check-in
 * summary), while super and organizer admins see everything in scope.
 */
export async function getDashboard(session: SessionContext, now: Date = new Date()): Promise<DashboardData> {
  const role = primaryRole(session);
  const ev = eventScope(session); // null = super (all)
  const evWhere: Prisma.EventMappingWhereInput = ev ?? {};
  const ord = orderScope(session); // {} = super
  const orgIds = [...new Set(session.memberships.map((m) => m.organizationId))];
  const auditWhere: Prisma.AuditLogWhereInput = session.isSuperAdmin ? {} : { organizationId: { in: orgIds } };

  // BadgePrintLog has no eventMapping relation, so scope it by event-id set.
  const eventIds = ev
    ? (await prisma.eventMapping.findMany({ where: ev, select: { id: true } })).map((e) => e.id)
    : null;
  const badgeWhere: Prisma.BadgePrintLogWhereInput = eventIds ? { eventMappingId: { in: eventIds } } : {};

  const [
    totalEvents,
    openEvents,
    upcomingEvents,
    totalRegistrations,
    issuedTickets,
    pendingApproval,
    pendingPayment,
    checkedIn,
    waitlist,
    codAgg,
    todayRegistrations,
  ] = await Promise.all([
    prisma.eventMapping.count({ where: evWhere }),
    prisma.eventMapping.count({ where: mergeWhere(ev, { visibility: "public", liveOnPretix: true, comingSoon: false }) }),
    prisma.eventMapping.count({ where: mergeWhere(ev, { comingSoon: true }) }),
    prisma.attendeeOrder.count({ where: ord }),
    prisma.attendeeOrder.count({ where: mergeWhere(Object.keys(ord).length ? ord : null, ISSUED) }),
    prisma.attendeeOrder.count({ where: mergeWhere(Object.keys(ord).length ? ord : null, { approvalStatus: "pending" }) }),
    prisma.attendeeOrder.count({ where: mergeWhere(Object.keys(ord).length ? ord : null, PENDING_PAYMENT) }),
    prisma.badgePrintLog.count({ where: { ...badgeWhere, reprint: false } }),
    prisma.waitlistEntry.count({ where: ev ? { eventMapping: ev, status: "waiting" } : { status: "waiting" } }),
    prisma.attendeeOrder.aggregate({
      _sum: { totalCents: true },
      where: mergeWhere(Object.keys(ord).length ? ord : null, { provider: "manual_cod", ...PENDING_PAYMENT }),
    }),
    prisma.attendeeOrder.count({ where: mergeWhere(Object.keys(ord).length ? ord : null, { createdAt: { gte: startOfToday(now) } }) }),
  ]);

  const [upcomingEventsList, recentRegistrations, recentCheckins, recentAudit, grouped] = await Promise.all([
    prisma.eventMapping.findMany({
      where: evWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
      select: { id: true, titleEn: true, visibility: true, comingSoon: true, liveOnPretix: true },
    }),
    prisma.attendeeOrder.findMany({
      where: ord,
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { eventMapping: { select: { titleEn: true } } },
    }),
    prisma.badgePrintLog.findMany({
      where: badgeWhere,
      orderBy: { createdAt: "desc" },
      take: 8,
    }),
    prisma.auditLog.findMany({ where: auditWhere, orderBy: { createdAt: "desc" }, take: 8 }),
    prisma.attendeeOrder.groupBy({ by: ["eventMappingId"], where: ord, _count: { _all: true } }),
  ]);

  // Capacity overview: registrations + issued per event (top by registrations).
  const topEventIds = grouped
    .sort((a, b) => b._count._all - a._count._all)
    .slice(0, 8)
    .map((g) => g.eventMappingId);
  const capEvents = topEventIds.length
    ? await prisma.eventMapping.findMany({ where: { id: { in: topEventIds } }, select: { id: true, titleEn: true } })
    : [];
  const issuedByEvent = topEventIds.length
    ? await prisma.attendeeOrder.groupBy({
        by: ["eventMappingId"],
        where: { AND: [ord, ISSUED, { eventMappingId: { in: topEventIds } }] },
        _count: { _all: true },
      })
    : [];
  const issuedMap = new Map(issuedByEvent.map((g) => [g.eventMappingId, g._count._all]));
  const regMap = new Map(grouped.map((g) => [g.eventMappingId, g._count._all]));
  const titleMap = new Map(capEvents.map((e) => [e.id, e.titleEn]));

  // Resolve event titles for recent check-ins (BadgePrintLog has no relation).
  const checkinEventIds = [...new Set(recentCheckins.map((b) => b.eventMappingId))];
  const checkinTitles = checkinEventIds.length
    ? new Map(
        (await prisma.eventMapping.findMany({ where: { id: { in: checkinEventIds } }, select: { id: true, titleEn: true } }))
          .map((e) => [e.id, e.titleEn]),
      )
    : new Map<string, string>();
  const capacity = topEventIds.map((id) => ({
    eventId: id,
    titleEn: titleMap.get(id) ?? "—",
    registrations: regMap.get(id) ?? 0,
    issued: issuedMap.get(id) ?? 0,
  }));

  return {
    viewerRole: role,
    kpis: {
      totalEvents,
      openEvents,
      upcomingEvents,
      totalRegistrations,
      issuedTickets,
      pendingApproval,
      pendingPayment,
      checkedIn,
      waitlist,
      codPendingCents: codAgg._sum.totalCents ?? 0,
      todayRegistrations,
    },
    upcomingEventsList,
    recentRegistrations: recentRegistrations.map((o) => ({
      id: o.id,
      orderCode: o.orderCode,
      attendee: o.attendeeName ?? o.email,
      event: o.eventMapping.titleEn,
      createdAt: o.createdAt,
    })),
    recentCheckins: recentCheckins.map((b) => ({
      id: b.id,
      attendeeRef: b.attendeeRef,
      event: checkinTitles.get(b.eventMappingId) ?? "—",
      createdAt: b.createdAt,
    })),
    recentAudit: recentAudit.map((a) => ({ id: a.id, action: a.action, entityType: a.entityType, createdAt: a.createdAt })),
    capacity,
    sections: {
      financial: role === "super_admin" || role === "organizer_admin" || role === "finance",
      checkins: role === "super_admin" || role === "organizer_admin" || role === "checkin_staff",
      audit: role === "super_admin" || role === "organizer_admin",
      waitlist: role === "super_admin" || role === "organizer_admin",
    },
  };
}
