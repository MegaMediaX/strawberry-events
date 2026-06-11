import { prisma } from "@/lib/db/client";
import { resolvePretixContext } from "@/lib/pretix/context";
import * as pretixProducts from "@/lib/pretix/products";
import * as pretixOrders from "@/lib/pretix/orders";
import { PretixValidationError } from "@/lib/pretix/errors";
import { centsToPrice } from "@/lib/pretix/mappers";
import { selectProvider } from "@/lib/payments/provider";
import { signMagicLink } from "@/lib/tokens/magic-link";
import { verifyInvite, type InvitePayload } from "@/lib/tokens/invite";
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

export interface RegisterResult {
  orderCode: string;
  status: "pending" | "paid";
  approvalStatus: "not_required" | "pending";
  magicLinkToken: string;
}

export async function register(input: RegisterInput): Promise<RegisterResult> {
  const data = registerInputSchema.parse(input);

  const event = await prisma.eventMapping.findFirst({
    where: { pretixEventSlug: data.eventSlug, visibility: "public" },
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

  const order = await pretixOrders.createOrder(
    ctx.organizerSlug,
    event.pretixEventSlug,
    { email: data.attendee.email, locale: data.locale, positions },
    ctx.token,
  );

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
