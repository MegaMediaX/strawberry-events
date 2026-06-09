import { prisma } from "@/lib/db/client";
import { verifyMagicLink } from "@/lib/tokens/magic-link";

export async function getOrderByCode(orderCode: string) {
  return prisma.attendeeOrder.findFirst({
    where: { orderCode },
    include: { eventMapping: true },
  });
}

export async function getOrderByToken(token: string) {
  const code = verifyMagicLink(token);
  if (!code) return null;
  return getOrderByCode(code);
}
