import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/service";
import { registrationsClaimedEmail, type Locale } from "@/lib/email/templates";
import { linkOrdersToUser } from "./ledger";

/**
 * Attach the registrations already sitting under an address, the moment that
 * address is proved.
 *
 * This is the half of the original design that was specified and never built:
 * verification proved the address and then linked nothing, so past
 * registrations could only be claimed one emailed ticket link at a time. The
 * proof is the same six-digit code the rest of the flow uses, which is why this
 * records `email_code` — the proof type has existed since the ledger shipped.
 *
 * WHAT IT DELIBERATELY WILL NOT TAKE: a registration already owned by an
 * account. Matching on an address is only evidence about the MAILBOX, and 33
 * addresses in this table hold registrations for more than one person. Sweeping
 * owned rows would let whoever verifies second take what the first already
 * claimed, silently. Unowned rows are the ones nobody has spoken for; those are
 * fair to link and reversible from the ledger if wrong.
 *
 * The shared-mailbox consequence that REMAINS is accepted and recorded in
 * CLAUDE.md: where two people share a mailbox and neither has claimed, whoever
 * verifies first takes both. The ledger row and the notice are what surface it.
 */
export async function claimOrdersForVerifiedEmail(params: {
  userId: string;
  email: string;
  ip?: string;
  locale?: Locale;
}): Promise<{ linked: number }> {
  const { userId, ip, locale = "en" } = params;
  const email = params.email.toLowerCase().trim();
  if (!email) return { linked: 0 };

  try {
    /**
     * `userId: null` is the whole safety property — see above. Ordered so the
     * notice reads chronologically rather than by cuid.
     */
    const orders = await prisma.attendeeOrder.findMany({
      where: { email, userId: null },
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        orderCode: true,
        eventMapping: { select: { titleEn: true } },
      },
    });
    if (orders.length === 0) return { linked: 0 };

    /**
     * One call, so the whole sweep is ONE ledger event with one entity row per
     * registration. Reversing it then puts the address back exactly as it was,
     * which a per-order loop could not promise: a failure halfway would leave
     * some linked and some not, with no single record of the intent.
     *
     * Every guard this needs already lives in linkOrdersToUser — suspended
     * accounts, staff accounts, the row lock and compare-and-set, and the
     * refusal to self-claim a registration with no address on it.
     */
    const res = await linkOrdersToUser({
      orderIds: orders.map((o) => o.id),
      userId,
      actor: { type: "self_claim", ip },
      proofType: "email_code",
      matchRule: "verified_email",
    });
    if (!res.ok || res.linked === 0) return { linked: 0 };

    // Best-effort, and NOT awaited: a link that succeeded must never be undone
    // or delayed because SMTP was slow. The ledger is the durable record.
    void notifyClaimed(email, orders, locale);

    return { linked: res.linked };
  } catch (err) {
    /**
     * Swallowed on purpose, loudly. Verification itself has already succeeded
     * and committed by the time this runs; throwing here would tell someone
     * their correct code was wrong. The registrations stay unowned and remain
     * claimable by the ticket link, so the failure is recoverable.
     */
    console.error("[claim-on-verify] sweep failed:", (err as Error).message);
    return { linked: 0 };
  }
}

async function notifyClaimed(
  email: string,
  orders: { orderCode: string; eventMapping: { titleEn: string } }[],
  locale: Locale,
): Promise<void> {
  try {
    await sendEmail(
      {
        to: email,
        ...registrationsClaimedEmail(locale, {
          orderCodes: orders.map((o) => o.orderCode),
          eventNames: orders.map((o) => o.eventMapping.titleEn),
        }),
      },
      {
        templateType: "registration_claimed",
        organizationId: null,
        attendeeRef: email,
      },
    );
  } catch (err) {
    console.error("[claim-on-verify] claim notice failed:", (err as Error).message);
  }
}
