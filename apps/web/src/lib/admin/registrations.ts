import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { registrationState, type RegistrationState } from "@/lib/approval/state";
import { orderScope } from "./scope";

export interface RegistrationFilters {
  organizationId?: string;
  eventId?: string;
  roleTag?: string;
  approvalStatus?: string;
  paymentStatus?: string;
  issued?: boolean;
  checkedIn?: boolean;
  createdFrom?: Date;
  createdTo?: Date;
  q?: string;
}

const ISSUED: Prisma.AttendeeOrderWhereInput = {
  status: "paid",
  approvalStatus: { in: ["not_required", "approved"] },
};

/** Build the scoped + filtered AttendeeOrder where clause (no async filters here). */
function buildWhere(session: SessionContext, f: RegistrationFilters): Prisma.AttendeeOrderWhereInput {
  const and: Prisma.AttendeeOrderWhereInput[] = [orderScope(session)];
  if (f.organizationId) and.push({ eventMapping: { organizationId: f.organizationId } });
  if (f.eventId) and.push({ eventMappingId: f.eventId });
  if (f.roleTag) and.push({ roleTag: f.roleTag as Prisma.AttendeeOrderWhereInput["roleTag"] });
  if (f.approvalStatus) and.push({ approvalStatus: f.approvalStatus as Prisma.AttendeeOrderWhereInput["approvalStatus"] });
  if (f.paymentStatus) and.push({ status: f.paymentStatus as Prisma.AttendeeOrderWhereInput["status"] });
  if (f.issued === true) and.push(ISSUED);
  else if (f.issued === false) and.push({ NOT: ISSUED });
  if (f.createdFrom || f.createdTo) {
    and.push({ createdAt: { ...(f.createdFrom ? { gte: f.createdFrom } : {}), ...(f.createdTo ? { lte: f.createdTo } : {}) } });
  }
  if (f.q && f.q.trim()) {
    const q = f.q.trim();
    and.push({
      OR: [
        { attendeeName: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
        { phone: { contains: q, mode: "insensitive" } },
        { company: { contains: q, mode: "insensitive" } },
        { orderCode: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  return { AND: and };
}

export interface RegistrationRow {
  id: string;
  orderCode: string;
  event: string;
  eventId: string;
  attendee: string;
  email: string;
  phone: string | null;
  company: string | null;
  roleTag: string;
  method: "Free" | "COD";
  status: string;
  approvalStatus: string;
  state: RegistrationState;
  createdAt: Date;
}

/**
 * List registrations the session may view, scoped by {@link orderScope} and the
 * given filters. The `checkedIn` filter is applied via a scoped BadgePrintLog
 * lookup (there is no direct relation). Never returns QR/secret material.
 */
export async function listRegistrations(
  session: SessionContext,
  filters: RegistrationFilters = {},
  opts: { take?: number; skip?: number } = {},
): Promise<RegistrationRow[]> {
  const where = buildWhere(session, filters);

  if (filters.checkedIn !== undefined) {
    // Resolve checked-in order codes within the same scope, then constrain.
    const scopedCodes = await prisma.attendeeOrder.findMany({ where, select: { orderCode: true } });
    const logs = await prisma.badgePrintLog.findMany({
      where: { attendeeRef: { in: scopedCodes.map((o) => o.orderCode) } },
      select: { attendeeRef: true },
    });
    const checkedSet = new Set(logs.map((l) => l.attendeeRef));
    const wanted = scopedCodes
      .map((o) => o.orderCode)
      .filter((c) => (filters.checkedIn ? checkedSet.has(c) : !checkedSet.has(c)));
    where.AND = [...(where.AND as Prisma.AttendeeOrderWhereInput[]), { orderCode: { in: wanted } }];
  }

  const orders = await prisma.attendeeOrder.findMany({
    where,
    include: { eventMapping: { select: { titleEn: true } } },
    orderBy: { createdAt: "desc" },
    take: opts.take ?? 200,
    skip: opts.skip ?? 0,
  });

  return orders.map((o) => ({
    id: o.id,
    orderCode: o.orderCode,
    event: o.eventMapping.titleEn,
    eventId: o.eventMappingId,
    attendee: o.attendeeName ?? o.email,
    email: o.email,
    phone: o.phone,
    company: o.company,
    roleTag: o.roleTag,
    method: o.provider === "free" ? "Free" : "COD",
    status: o.status,
    approvalStatus: o.approvalStatus,
    state: registrationState(o),
    createdAt: o.createdAt,
  }));
}

/**
 * CSV escape + serialize. Scope is the caller's responsibility (pass scoped rows).
 * When `answersByOrder` is supplied, a "Custom fields" column is appended with the
 * order's modular answers (label=value; joined).
 */
export function buildCsv(rows: RegistrationRow[], answersByOrder?: Map<string, string>): string {
  const withCustom = !!answersByOrder;
  const headers = ["Event", "Order", "Attendee", "Email", "Phone", "Company", "Role", "Method", "State", "Created", ...(withCustom ? ["Custom fields"] : [])];
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) {
    const cells: unknown[] = [r.event, r.orderCode, r.attendee, r.email, r.phone, r.company, r.roleTag, r.method, r.state, r.createdAt.toISOString()];
    if (withCustom) cells.push(answersByOrder!.get(r.orderCode) ?? "");
    lines.push(cells.map(esc).join(","));
  }
  return lines.join("\n");
}

export interface RegistrationDetail {
  order: {
    id: string; orderCode: string; attendee: string; email: string;
    phone: string | null; phoneCC: string | null; company: string | null;
    roleTag: string; method: "Free" | "COD"; status: string; approvalStatus: string;
    state: RegistrationState; totalCents: number; createdAt: Date;
  };
  /** QR payload — present ONLY when the ticket is issued. */
  qrValue: string | null;
  modularAnswers: { label: string; value: string }[];
  seat: { id: string; label: string | null } | null;
  waitlist: { id: string; status: string; position: number; createdAt: Date }[];
  badgePrints: { id: string; reprint: boolean; createdAt: Date }[];
  audit: { id: string; action: string; createdAt: Date }[];
}

/**
 * Load the full registration detail for an order the session may access.
 * Throws ForbiddenError on cross-org/unauthorized access. QR is exposed only
 * when the registration state is `issued`.
 */
export async function getRegistrationDetail(
  session: SessionContext,
  id: string,
): Promise<RegistrationDetail> {
  const order = await prisma.attendeeOrder.findUnique({
    where: { id },
    include: { eventMapping: { select: { organizationId: true, localEventId: true } } },
  });
  if (!order || !canAccessEvent(session, order.eventMapping.organizationId, order.eventMapping.localEventId)) {
    throw new ForbiddenError("Registration not found or access denied");
  }

  const state = registrationState(order);
  const issued = state === "issued";

  const [answers, seat, waitlist, badgePrints, audit] = await Promise.all([
    prisma.customFormAnswer.findMany({
      where: { attendeeRef: order.orderCode },
      include: { field: { select: { labelEn: true } } },
    }),
    prisma.seatAssignment.findFirst({ where: { attendeeRef: order.orderCode } }),
    prisma.waitlistEntry.findMany({
      where: { eventMappingId: order.eventMappingId, email: order.email },
      orderBy: { createdAt: "desc" },
    }),
    prisma.badgePrintLog.findMany({
      where: { eventMappingId: order.eventMappingId, attendeeRef: order.orderCode },
      orderBy: { createdAt: "desc" },
    }),
    prisma.auditLog.findMany({
      where: { entityType: "order", OR: [{ entityId: order.id }, { entityId: order.orderCode }] },
      orderBy: { createdAt: "desc" },
      take: 50,
    }),
  ]);

  return {
    order: {
      id: order.id, orderCode: order.orderCode,
      attendee: order.attendeeName ?? order.email, email: order.email,
      phone: order.phone, phoneCC: order.phoneCC, company: order.company,
      roleTag: order.roleTag, method: order.provider === "free" ? "Free" : "COD",
      status: order.status, approvalStatus: order.approvalStatus, state,
      totalCents: order.totalCents, createdAt: order.createdAt,
    },
    qrValue: issued ? (order.pretixSecret ?? order.orderCode) : null,
    modularAnswers: answers.map((a) => ({ label: a.field.labelEn, value: a.value })),
    seat: seat ? { id: seat.id, label: seat.label } : null,
    waitlist: waitlist.map((w) => ({ id: w.id, status: w.status, position: w.position, createdAt: w.createdAt })),
    badgePrints: badgePrints.map((b) => ({ id: b.id, reprint: b.reprint, createdAt: b.createdAt })),
    audit: audit.map((a) => ({ id: a.id, action: a.action, createdAt: a.createdAt })),
  };
}
