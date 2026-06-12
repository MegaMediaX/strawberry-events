import type { AttendeeTag } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import { register, type RegisterResult } from "@/lib/registration/service";

export interface WalkInInput {
  /** EventMapping id (local), as selected by staff. */
  eventId: string;
  /** pretix item id for the chosen ticket type. */
  itemId: number;
  roleTag: Extract<AttendeeTag, "media" | "partner" | "staff" | "speaker" | "visitor">;
  locale?: "en" | "ar";
  attendee: {
    firstName: string;
    lastName: string;
    /** Optional for walk-ins; a placeholder is synthesized when omitted. */
    email?: string;
    /** Optional for walk-ins. */
    phoneCC?: string;
    /** Optional for walk-ins. */
    phone?: string;
    company?: string | null;
  };
  /** Required only for seated events. */
  seatIds?: string[];
}

/**
 * Staff/admin may register walk-ins for events they can access. Enforced at the
 * SERVICE layer (server actions are directly invocable). Finance and
 * impersonating sessions are blocked; super_admin passes via hasAnyRole.
 */
export function assertCanRegisterWalkIn(session: SessionContext) {
  if (session.impersonating) {
    throw new ForbiddenError("Cannot register walk-ins while impersonating");
  }
  if (!hasAnyRole(session, ["checkin_staff", "organizer_admin"])) {
    throw new ForbiddenError("Requires check-in staff or organizer admin");
  }
}

/**
 * Register a walk-in attendee on behalf of staff. Reuses the public `register()`
 * path (pretix remains the source of truth: order creation, free/COD issuance,
 * approval, seat hold/confirm), adding staff authorization, an explicit role tag,
 * and an audit entry. No payment is captured (COD/free only).
 */
export async function createWalkIn(
  session: SessionContext,
  input: WalkInInput,
): Promise<RegisterResult> {
  assertCanRegisterWalkIn(session);

  const mapping = await prisma.eventMapping.findUnique({ where: { id: input.eventId } });
  if (!mapping || !canAccessEvent(session, mapping.organizationId, mapping.localEventId)) {
    throw new ForbiddenError("Event not found or access denied");
  }

  // pretix orders and our non-null email column need a value, so synthesize a
  // unique placeholder when a walk-in has no email. The `.invalid` TLD (RFC 2606)
  // guarantees it can never reach a real inbox.
  const email = input.attendee.email?.trim()
    ? input.attendee.email.trim()
    : `walkin-${crypto.randomUUID()}@walk-in.invalid`;

  // register() validates ticket availability, seating, and approval, and throws
  // on failure — we propagate that (and do NOT audit a failed attempt).
  const result = await register({
    eventSlug: mapping.pretixEventSlug,
    locale: input.locale ?? "en",
    attendee: {
      ...input.attendee,
      email,
      phoneCC: input.attendee.phoneCC ?? "",
      phone: input.attendee.phone ?? "",
    },
    tickets: [{ itemId: input.itemId, quantity: 1 }],
    seatIds: input.seatIds,
    roleTag: input.roleTag,
    // Staff walk-ins may omit phone (the public wizard still requires it).
    staffWalkIn: true,
    consentTerms: true,
    consentPrivacy: true,
    userId: null,
  });

  await prisma.auditLog.create({
    data: {
      organizationId: mapping.organizationId,
      actorUserId: session.userId,
      action: "attendee.walkin_created",
      entityType: "order",
      entityId: result.orderCode,
    },
  });

  return result;
}
