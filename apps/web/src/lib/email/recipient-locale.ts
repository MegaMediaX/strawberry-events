import { prisma } from "@/lib/db/client";
import type { Locale } from "@/lib/email/templates";

/**
 * Resolve the locale to use for a transactional email to an attendee. Uses the
 * user's stored preferredLocale when the order belongs to a registered account;
 * falls back to English for guest (account-less) orders or when unset.
 */
export async function recipientLocale(userId: string | null | undefined): Promise<Locale> {
  if (!userId) return "en";
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
    select: { preferredLocale: true },
  });
  return profile?.preferredLocale === "ar" ? "ar" : "en";
}
