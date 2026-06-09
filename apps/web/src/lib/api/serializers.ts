// Safe API DTOs — never expose pretix tokens, secrets, pretixSecret, or magic links.

export function eventDTO(e: {
  id: string; pretixEventSlug: string; titleEn: string; titleAr: string | null;
  visibility: string; seatSelectionEnabled: boolean; waitlistEnabled: boolean; createdAt: Date;
}) {
  return {
    id: e.id,
    slug: e.pretixEventSlug,
    titleEn: e.titleEn,
    titleAr: e.titleAr,
    visibility: e.visibility,
    seatSelectionEnabled: e.seatSelectionEnabled,
    waitlistEnabled: e.waitlistEnabled,
    createdAt: e.createdAt,
  };
}

export function attendeeDTO(o: {
  id: string; orderCode: string; email: string; attendeeName: string | null;
  company: string | null; status: string; approvalStatus: string; roleTag: string; createdAt: Date;
}) {
  return {
    id: o.id,
    orderCode: o.orderCode,
    email: o.email,
    name: o.attendeeName,
    company: o.company,
    status: o.status,
    approvalStatus: o.approvalStatus,
    roleTag: o.roleTag,
    createdAt: o.createdAt,
  };
}

export function orderDTO(o: {
  id: string; orderCode: string; status: string; provider: string; totalCents: number; createdAt: Date;
}) {
  return {
    id: o.id,
    orderCode: o.orderCode,
    status: o.status,
    provider: o.provider,
    totalCents: o.totalCents,
    createdAt: o.createdAt,
  };
}

export function waitlistDTO(w: {
  id: string; email: string; itemId: number | null; position: number; status: string; createdAt: Date;
}) {
  return { id: w.id, email: w.email, itemId: w.itemId, position: w.position, status: w.status, createdAt: w.createdAt };
}

export function seatDTO(s: { id: string; label: string; state: string; rowId: string }) {
  return { id: s.id, label: s.label, state: s.state, rowId: s.rowId };
}

export function checkinDTO(c: {
  id: string; attendeeRef: string; printedByUserId: string | null; reprint: boolean; createdAt: Date;
}) {
  return {
    id: c.id,
    orderCode: c.attendeeRef,
    printedBy: c.printedByUserId,
    reprint: c.reprint,
    createdAt: c.createdAt,
  };
}
