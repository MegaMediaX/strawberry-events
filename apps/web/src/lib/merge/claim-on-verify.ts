import { after } from "next/server";

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
/**
 * Most registrations one verification will take at once.
 *
 * The live table's busiest address has 4 and the 99th percentile is 2, so this
 * is far above anything real. It is here because registration accepts a typed
 * address, so orders can be stacked under someone else's mailbox before they
 * ever verify — without a cap that turns one verification into an arbitrarily
 * large locked transaction and a single email listing every one of them.
 *
 * Oldest first, so a flood of freshly-created rows cannot push a person's
 * genuine older registrations out of the window. Anything past the cap stays
 * unowned and is still claimable from its own ticket link.
 */
export const SWEEP_LIMIT = 50;

/**
 * Why a sweep linked nothing, kept distinct from how much it linked.
 *
 * These three used to collapse into `{ linked: 0 }`, so a sweep REFUSED because
 * a registration had been claimed by someone else in the meantime was
 * indistinguishable from an address that simply had none — invisible to the
 * person, and invisible in the logs to anyone asking why their history did not
 * appear. The count alone cannot answer that question.
 */
export type SweepResult = {
  linked: number;
  outcome: "linked" | "nothing_to_link" | "refused" | "failed";
  /** Server-side only; never shown to the caller. */
  reason?: string;
};

export async function claimOrdersForVerifiedEmail(params: {
  userId: string;
  email: string;
  ip?: string;
  locale?: Locale;
}): Promise<SweepResult> {
  const { userId, ip, locale = "en" } = params;
  const email = params.email.toLowerCase().trim();
  if (!email) return { linked: 0, outcome: "nothing_to_link" };

  try {
    /**
     * `userId: null` is the whole safety property — see above. Ordered so the
     * notice reads chronologically rather than by cuid.
     */
    const orders = await prisma.attendeeOrder.findMany({
      where: { email, userId: null },
      // Chronological for the notice, which people read. linkOrdersToUser
      // re-reads these under `ORDER BY id FOR UPDATE`, so the ledger entities
      // are in id order — the two lists intentionally do not match.
      orderBy: { createdAt: "asc" },
      take: SWEEP_LIMIT,
      select: {
        id: true,
        orderCode: true,
        eventMapping: { select: { titleEn: true } },
      },
    });
    if (orders.length === 0) return { linked: 0, outcome: "nothing_to_link" };

    /**
     * One call, so the whole sweep is ONE ledger event with one entity row per
     * registration. Reversing it then puts the address back exactly as it was,
     * which a per-order loop could not promise: a failure halfway would leave
     * some linked and some not, with no single record of the intent.
     *
     * linkOrdersToUser carries the guards that must hold under the lock:
     * suspended accounts, staff accounts, the row lock and compare-and-set, the
     * refusal to self-claim a registration with no address on it, and — added
     * for this path — the refusal to self-claim one somebody else already owns.
     *
     * That last one is why the `userId: null` filter above is not the safety
     * property it looks like. This read takes no lock, so an order claimed
     * between it and the transaction would otherwise be swept up anyway; the
     * filter narrows the candidates, the ledger enforces the rule.
     */
    const res = await linkOrdersToUser({
      orderIds: orders.map((o) => o.id),
      userId,
      actor: { type: "self_claim", ip },
      proofType: "email_code",
      matchRule: "verified_email",
    });
    if (!res.ok || res.linked === 0) {
      /**
       * The ledger refused. The likeliest cause by far is the guard that stops a
       * self-claim taking a registration someone else already owns — which on a
       * shared mailbox means the other person got there first. Logged with the
       * address so it can actually be answered when someone asks why their
       * history is missing; they can still claim each one from its ticket link.
       */
      console.warn(`[claim-on-verify] sweep refused for ${email}: ${res.error ?? "no rows moved"}`);
      return { linked: 0, outcome: "refused", reason: res.error };
    }

    /**
     * Handed to `after()` rather than left as a bare floating promise.
     *
     * Still off the response path — a link that succeeded must never be undone
     * or delayed because SMTP was slow. But a bare `void` promise has no one
     * keeping the runtime alive once the action's own promise resolves, so the
     * notice could be dropped mid-flight. With the merge notice being one of
     * only two things that surface an automatic link, silently losing it is not
     * an acceptable failure mode.
     *
     * `after()` throws outside a request scope, which is every unit test and
     * any future non-request caller, so the bare call remains the fallback.
     */
    const notify = () => notifyClaimed(email, orders, locale);
    try {
      after(notify);
    } catch {
      void notify();
    }

    return { linked: res.linked, outcome: "linked" };
  } catch (err) {
    /**
     * Swallowed on purpose, loudly. Verification itself has already succeeded
     * and committed by the time this runs; throwing here would tell someone
     * their correct code was wrong. The registrations stay unowned and remain
     * claimable by the ticket link, so the failure is recoverable.
     */
    console.error("[claim-on-verify] sweep failed:", (err as Error).message);
    return { linked: 0, outcome: "failed", reason: (err as Error).message };
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
          registrations: orders.map((o) => ({
            orderCode: o.orderCode,
            eventName: o.eventMapping.titleEn,
          })),
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
