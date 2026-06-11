import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixProducts from "@/lib/pretix/products";
import * as pretixOrders from "@/lib/pretix/orders";
import { PretixValidationError } from "@/lib/pretix/errors";
import { centsToPrice } from "@/lib/pretix/mappers";
import { selectProvider } from "@/lib/payments/provider";
import { signMagicLink } from "@/lib/tokens/magic-link";
import { verifyInvite, type InvitePayload } from "@/lib/tokens/invite";
import { sha256 } from "@/lib/crypto";
import { sendEmail } from "@/lib/email/service";
import {
  pendingEmail,
  confirmationEmail,
  pendingApprovalEmail,
} from "@/lib/email/templates";
import { requiresApproval } from "@/lib/approval/state";
import { tagForItem } from "@/lib/checkin/eligibility";
import { holdSeats, confirmSeats, releaseSeats } from "@/lib/seats/service";
import { emit } from "@/lib/webhooks/service";
import { getEventFields, getFieldsForTicket, validateRequiredAnswers } from "@/lib/admin/custom-fields";
import { registerInputSchema, type RegisterInput } from "./schema";
import { validateSelection } from "@/lib/events/conflicts";

/**
 * Pure, unit-testable guard: throws if invite-only items are selected without
 * a valid invite that covers them.
 */
export function assertInviteAllows(
  payload: InvitePayload | null,
  eventSlug: string,
  inviteOnlyItemIds: number[],
  selectedItemIds: number[],
): void {
  const inviteOnly = new Set(inviteOnlyItemIds);
  const selectedInviteOnly = selectedItemIds.filter((id) => inviteOnly.has(id));
  if (selectedInviteOnly.length === 0) return; // no invite-only items → no check needed

  if (!payload) {
    throw new Error("This ticket requires a valid invitation");
  }
  if (payload.ev !== eventSlug) {
    throw new Error("This ticket requires a valid invitation");
  }
  const allowed = new Set(payload.items);
  for (const id of selectedInviteOnly) {
    if (!allowed.has(id)) {
      throw new Error("This ticket requires a valid invitation");
    }
  }
}

/**
 * Pure guard: if the invite payload is email-bound, verify the registrant
 * email matches (case-insensitive). Throws on mismatch — testable without DB.
 */
export function assertEmailMatches(
  invitePayload: InvitePayload | null,
  attendeeEmail: string,
): void {
  if (!invitePayload?.email) return; // stateless link — no email check
  if (invitePayload.email.toLowerCase() !== attendeeEmail.toLowerCase()) {
    throw new Error("This invitation was issued to a different email address");
  }
}

export interface RegisterResult {
  orderCode: string;
  status: "pending" | "paid";
  approvalStatus: "not_required" | "pending";
  magicLinkToken: string;
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const data = registerInputSchema.parse(input);

  const event = await prisma.eventMapping.findFirst({
    // Require liveOnPretix to match the public storefront gate (getPublicEvent):
    // a direct call must not register against a public-but-not-yet-live event.
    where: { pretixEventSlug: data.eventSlug, visibility: "public", liveOnPretix: true },
  });
  if (!event) throw new Error("Event not found");
  const org = await prisma.organization.findUnique({
    where: { id: event.organizationId },
  });
  if (!org) throw new Error("Organization not found");
  const ctx = resolvePretixContext(org);

  // Sub-event caps + time-conflict validation (server-side, source of truth).
  const subEvents = await prisma.subEvent.findMany({
    where: { eventMappingId: event.id },
  });
  validateSelection(event, subEvents, data.tickets);

  // Invite-only enforcement: verify token covers every invite-only item selected.
  const invitePayload = data.inviteToken ? verifyInvite(data.inviteToken) : null;
  assertInviteAllows(
    invitePayload,
    event.pretixEventSlug,
    event.inviteOnlyItemIds,
    data.tickets.map((t) => t.itemId),
  );

  // Email-bound invite: validate email match + single-use DB record.
  assertEmailMatches(invitePayload, data.attendee.email);
  let inviteTokenHash: string | null = null;
  if (invitePayload?.email && data.inviteToken) {
    inviteTokenHash = sha256(data.inviteToken);
    const invite = await prisma.invite.findUnique({ where: { tokenHash: inviteTokenHash } });
    if (!invite) throw new Error("Invitation not found");
    if (invite.redeemedAt) throw new Error("This invitation has already been used");
    if (invite.expiresAt && invite.expiresAt < new Date()) {
      throw new Error("This invitation has expired");
    }
  }

  // Single-use enforcement is an ATOMIC compare-and-set, not the read above —
  // the read only yields a fast, friendly error. Two concurrent registrations
  // using the same invite would both pass the read; only one wins this claim.
  // We stamp redeemedAt now (reserving the invite) and set redeemedOrderCode
  // once the order exists; on any failure before that we release the claim.
  if (inviteTokenHash) {
    const claimed = await prisma.invite.updateMany({
      where: { tokenHash: inviteTokenHash, redeemedAt: null },
      data: { redeemedAt: new Date() },
    });
    if (claimed.count !== 1) {
      throw new Error("This invitation has already been used");
    }
  }
  const releaseInviteClaim = async () => {
    if (!inviteTokenHash) return;
    // Only release a claim that hasn't been finalized to an order.
    await prisma.invite
      .updateMany({
        where: { tokenHash: inviteTokenHash, redeemedOrderCode: null },
        data: { redeemedAt: null },
      })
      .catch(() => {});
  };

  // Recompute prices from pretix (never trust client prices).
  const items = await pretixProducts.listItems(
    ctx.organizerSlug,
    event.pretixEventSlug,
    ctx.token,
  );
  const priceById = new Map(items.map((i) => [i.id, i.priceCents]));

  const positions: { item: number; price: string }[] = [];
  let totalCents = 0;
  for (const sel of data.tickets) {
    const price = priceById.get(sel.itemId) ?? 0;
    for (let n = 0; n < sel.quantity; n++) {
      positions.push({ item: sel.itemId, price: centsToPrice(price) });
      totalCents += price;
    }
  }

  const provider = selectProvider(totalCents);
  const needsApproval = requiresApproval(
    event.approvalMode,
    data.tickets.map((t) => t.itemId),
    event.autoApproveItemIds,
  );

  // Seated events require a seat selection.
  if (event.seatSelectionEnabled && (!data.seatIds || data.seatIds.length === 0)) {
    throw new Error("Seat selection is required for this event");
  }

  // Modular custom fields: validate required answers for the selected tickets
  // BEFORE any pretix/DB side effects (fail fast). Answers are persisted after
  // the order is created.
  const allFields = await getEventFields(event.id);
  const scopedFields = (() => {
    const byId = new Map<string, (typeof allFields)[number]>();
    for (const sel of data.tickets) {
      for (const f of getFieldsForTicket(allFields, sel.itemId)) byId.set(f.id, f);
    }
    return [...byId.values()];
  })();
  const missingFields = validateRequiredAnswers(scopedFields, data.answers ?? []);
  if (missingFields.length) {
    throw new Error(`Missing required field(s): ${missingFields.join(", ")}`);
  }

  let order;
  try {
    order = await pretixOrders.createOrder(
      ctx.organizerSlug,
      event.pretixEventSlug,
      { email: data.attendee.email, locale: data.locale, positions },
      ctx.token,
    );
  } catch (err) {
    // Order never got off the ground — free the invite for a genuine retry.
    await releaseInviteClaim();
    throw err;
  }

  // Reserve selected seats for seated events (hold then confirm against the order).
  // On any seat failure, release seats and cancel the just-created pretix order so
  // we never leave an orphan order or a half-reserved seat map.
  if (data.seatIds && data.seatIds.length > 0) {
    try {
      await holdSeats(event.id, data.seatIds, order.code);
      await confirmSeats(data.seatIds, order.code);
    } catch (seatErr) {
      await releaseSeats(order.code).catch(() => {});
      try {
        await pretixOrders.cancelOrder(ctx.organizerSlug, event.pretixEventSlug, order.code, ctx.token);
      } catch {
        // best-effort rollback
      }
      // The order is being cancelled, so the invite must not stay consumed.
      await releaseInviteClaim();
      throw seatErr;
    }
    void emit(event.organizationId, "seat.held", { orderCode: order.code, seatIds: data.seatIds }, event.id);
    void emit(event.organizationId, "seat.confirmed", { orderCode: order.code, seatIds: data.seatIds }, event.id);
  }

  // Issue immediately only when no approval is needed AND the order is free.
  let status: "pending" | "paid" = "pending";
  if (!needsApproval && provider === "free") {
    // pretix auto-marks zero-total orders as paid on creation; tolerate that.
    if (order.status !== "p") {
      try {
        await pretixOrders.markOrderPaid(
          ctx.organizerSlug,
          event.pretixEventSlug,
          order.code,
          ctx.token,
        );
      } catch (err) {
        if (!(err instanceof PretixValidationError)) throw err;
      }
    }
    status = "paid";
  }
  const approvalStatus = needsApproval ? "pending" : "not_required";

  const magicLinkToken = signMagicLink(order.code);

  await prisma.attendeeOrder.create({
    data: {
      eventMappingId: event.id,
      orderCode: order.code,
      email: data.attendee.email,
      attendeeName: `${data.attendee.firstName} ${data.attendee.lastName}`.trim(),
      company: data.attendee.company ?? null,
      phone: data.attendee.phone,
      phoneCC: data.attendee.phoneCC,
      // Server-side consent timestamp: the wizard hard-requires both consent
      // checkboxes, so reaching here means consent was given. Stamped on the
      // server so it cannot be spoofed by the client.
      consentAt: new Date(),
      userId: data.userId ?? null,
      status,
      approvalStatus,
      provider,
      totalCents,
      roleTag:
        invitePayload?.tag ??
        data.roleTag ??
        tagForItem(
          (event.itemTagMap ?? {}) as Record<string, unknown>,
          data.tickets[0]?.itemId ?? -1,
        ),
      pretixSecret: order.positions?.[0]?.secret ?? null,
      magicLinkToken,
    },
  });

  // Finalize the invite claim: the redeemedAt stamp was set atomically above;
  // now bind it to the committed order. Best-effort — the single-use guard is
  // already enforced by the reservation, so a failure here cannot double-redeem.
  if (inviteTokenHash) {
    try {
      await prisma.invite.update({
        where: { tokenHash: inviteTokenHash },
        data: { redeemedOrderCode: order.code },
      });
    } catch (err) {
      console.error("[register] invite redemption finalize failed:", (err as Error).message);
    }
  }

  // Keep the signed-in user's profile in sync with what they just entered.
  // Best-effort: a profile write must never roll back a committed registration.
  if (data.userId) {
    try {
      await prisma.userProfile.upsert({
        where: { userId: data.userId },
        update: {
          phone: data.attendee.phone,
          phoneCC: data.attendee.phoneCC,
          preferredLocale: data.locale,
        },
        create: {
          userId: data.userId,
          phone: data.attendee.phone,
          phoneCC: data.attendee.phoneCC,
          preferredLocale: data.locale,
        },
      });
    } catch {
      // swallow — order already persisted
    }
  }

  // Persist modular field answers (best-effort; required ones were validated above).
  if (data.answers?.length) {
    const scopedIds = new Set(scopedFields.map((f) => f.id));
    const rows = data.answers
      .filter((a) => scopedIds.has(a.fieldId) && a.value.trim())
      .map((a) => ({ fieldId: a.fieldId, attendeeRef: order.code, value: a.value }));
    if (rows.length) {
      try {
        await prisma.customFormAnswer.createMany({ data: rows });
      } catch (err) {
        console.error("[register] custom answers write failed:", (err as Error).message);
      }
    }
  }

  void emit(event.organizationId, "order.created", { orderCode: order.code, status }, event.id);
  if (status === "paid") {
    void emit(event.organizationId, "order.paid", { orderCode: order.code }, event.id);
    void emit(event.organizationId, "ticket.issued", { orderCode: order.code }, event.id);
  }

  // Email is best-effort: never fail the registration on send errors.
  try {
    const appUrl = process.env.APP_URL ?? "";
    const ticketUrl = `${appUrl}/${data.locale}/t/${magicLinkToken}`;
    const msg = needsApproval
      ? pendingApprovalEmail(data.locale, event.titleEn, order.code)
      : status === "paid"
        ? confirmationEmail(data.locale, event.titleEn, order.code, ticketUrl)
        : pendingEmail(data.locale, event.titleEn, order.code);
    const templateType = needsApproval
      ? "pending_approval"
      : status === "paid"
        ? "ticket_issued"
        : "payment_required";
    await sendEmail(
      { to: data.attendee.email, ...msg },
      { templateType, organizationId: event.organizationId, eventMappingId: event.id, attendeeRef: order.code },
    );
  } catch {
    // swallow
  }

  return { orderCode: order.code, status, approvalStatus, magicLinkToken };
}
