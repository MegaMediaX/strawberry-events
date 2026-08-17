/**
 * Re-send ticket emails that failed while the mailbox was rejecting logins.
 *
 * On 2026-08-15 the SMTP password for events@strawberryagency.com started
 * returning "535 Incorrect authentication data". Every ticket_issued email
 * from that point failed, so attendees who paid have no ticket and no QR.
 * Clicking Resend 70+ times in the admin is not a recovery plan.
 *
 * Deliberately conservative, because the likeliest cause of the outage is a
 * sending limit and a burst would re-trip it:
 *   - dry run by default; --commit to actually send
 *   - one email at a time, with a delay between them (--delay-ms)
 *   - --limit to send a small first batch and check it landed
 *   - one attempt per RECIPIENT, newest failure per address, so retries in the
 *     log do not turn into duplicate tickets
 *   - stops on the first auth rejection rather than burning through the rest
 *
 * Usage, from apps/web:
 *   npx tsx scripts/resend-failed-tickets.ts                    # dry run, shows who
 *   npx tsx scripts/resend-failed-tickets.ts --commit --limit 3 # prove it works
 *   npx tsx scripts/resend-failed-tickets.ts --commit           # the rest
 */
import { prisma } from "../src/lib/db/client";
import { sendEmail, emailMode } from "../src/lib/email/service";

const args = process.argv.slice(2);
const commit = args.includes("--commit");
const flag = (name: string, fallback: number) => {
  const i = args.indexOf(name);
  if (i === -1) return fallback;
  const v = Number(args[i + 1]);
  return Number.isFinite(v) ? v : fallback;
};
const limit = flag("--limit", Infinity);
const delayMs = flag("--delay-ms", 2000);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const mode = emailMode();
  console.log(`email mode: ${mode}`);
  if (mode === "disabled") {
    console.error("Outbound email is disabled in this environment. Nothing would send.");
    process.exit(1);
  }

  // Newest failed ticket email per recipient. A recipient who also has a later
  // SUCCESSFUL send is excluded — they already got their ticket, whether from a
  // manual resend or a registration that went through before the outage.
  const failed = await prisma.emailLog.findMany({
    where: { status: "failed", templateType: "ticket_issued" },
    orderBy: { createdAt: "desc" },
  });
  const sentTo = new Set(
    (
      await prisma.emailLog.findMany({
        where: { status: "sent", templateType: "ticket_issued" },
        select: { recipient: true },
      })
    ).map((r) => r.recipient.toLowerCase()),
  );

  const seen = new Set<string>();
  const queue = failed.filter((log) => {
    const key = log.recipient.toLowerCase();
    if (sentTo.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  console.log(
    `${failed.length} failed rows -> ${queue.length} distinct recipients still without a ticket` +
      (Number.isFinite(limit) ? ` (sending at most ${limit})` : ""),
  );

  if (!commit) {
    for (const log of queue.slice(0, Number.isFinite(limit) ? limit : undefined)) {
      console.log(`  would send: ${log.recipient}  order=${log.attendeeRef ?? "-"}  "${log.subject}"`);
    }
    console.log("\nDry run. Re-run with --commit to send.");
    return;
  }

  let ok = 0;
  let failures = 0;
  for (const [i, log] of queue.entries()) {
    if (i >= limit) break;
    const sent = await sendEmail(
      { to: log.recipient, subject: log.subject, text: log.bodyText },
      {
        templateType: log.templateType ?? undefined,
        organizationId: log.organizationId,
        eventMappingId: log.eventMappingId,
        attendeeRef: log.attendeeRef,
      },
    );
    if (sent) {
      ok++;
      console.log(`  sent  ${log.recipient}`);
    } else {
      failures++;
      console.error(`  FAIL  ${log.recipient}`);
      // Two consecutive failures means the transport is broken again (bad
      // password, limit re-tripped). Stop rather than logging 70 more failures.
      if (failures >= 2) {
        console.error("\nStopping after 2 consecutive failures — check the mailbox before retrying.");
        break;
      }
    }
    if (i < queue.length - 1) await sleep(delayMs);
  }
  console.log(`\nsent ${ok}, failed ${failures}, remaining ${Math.max(0, queue.length - ok - failures)}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
