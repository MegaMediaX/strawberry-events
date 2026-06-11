import { prisma } from "@/lib/db/client";
import type { SessionContext } from "@/lib/auth/types";
import { registrationState, type RegistrationState } from "@/lib/approval/state";

export interface MyRegistrationRow {
  id: string;
  orderCode: string;
  event: string;
  state: RegistrationState;
  /** QR payload — present ONLY when the ticket is issued. */
  qrValue: string | null;
  magicLinkToken: string;
  createdAt: Date;
}

/**
 * The signed-in user's own registrations — strictly scoped to userId (never by
 * email, never cross-user). Guest (userId-null) orders are intentionally NOT
 * surfaced here; they remain accessible only via their magic link. QR is exposed
 * only when the registration is issued.
 */
export async function listMyRegistrations(session: SessionContext): Promise<MyRegistrationRow[]> {
  const orders = await prisma.attendeeOrder.findMany({
    where: { userId: session.userId },
    include: { eventMapping: { select: { titleEn: true } } },
    orderBy: { createdAt: "desc" },
  });
  return orders.map((o) => {
    const state = registrationState(o);
    return {
      id: o.id,
      orderCode: o.orderCode,
      event: o.eventMapping.titleEn,
      state,
      qrValue: state === "issued" ? (o.pretixSecret ?? o.orderCode) : null,
      magicLinkToken: o.magicLinkToken,
      createdAt: o.createdAt,
    };
  });
}

export interface MyProfile {
  phone: string | null;
  phoneCC: string | null;
  preferredLocale: string;
}

export async function getMyProfile(session: SessionContext): Promise<MyProfile> {
  const p = await prisma.userProfile.findUnique({ where: { userId: session.userId } });
  return {
    phone: p?.phone ?? null,
    phoneCC: p?.phoneCC ?? null,
    preferredLocale: p?.preferredLocale ?? "en",
  };
}

export interface ProfileInput {
  phone?: string | null;
  phoneCC?: string | null;
  preferredLocale?: string;
}

/**
 * Update the signed-in user's own profile. Always scoped to session.userId — the
 * caller can never target another user. Only phone/phoneCC/preferredLocale are
 * editable here (no role/email/status changes).
 */
export async function updateMyProfile(session: SessionContext, input: ProfileInput) {
  const data = {
    phone: input.phone?.trim() || null,
    phoneCC: input.phoneCC?.trim() || null,
    preferredLocale: input.preferredLocale === "ar" ? "ar" : "en",
  };
  return prisma.userProfile.upsert({
    where: { userId: session.userId },
    update: data,
    create: { userId: session.userId, ...data },
  });
}
