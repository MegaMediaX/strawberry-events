import { prisma } from "@/lib/db/client";
import { emailMode } from "@/lib/email/service";

export const dynamic = "force-dynamic";

/**
 * Machine-readable data health, for a cron to poll.
 *
 * Postgres only — no pretix call — so it stays fast and cannot contend with the
 * door scanner during the event. Returns 503 when a CRITICAL check fails, so a
 * `curl -f` in crontab is a complete alert without any alerting subsystem.
 *
 * The check that earns its place: email going quiet WHILE registrations arrive.
 * A failure rate says nothing once sending stops altogether — zero attempts is
 * zero failures — which is how a two-day outage went unnoticed.
 */
const OUTAGE_MINUTES = 60;

export async function GET() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);

  const [lastSent, failed24h, issuedNoTicket, noQr] = await Promise.all([
    prisma.emailLog.findFirst({
      where: { status: "sent" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true },
    }),
    prisma.emailLog.count({ where: { status: "failed", createdAt: { gte: since } } }),
    prisma.attendeeOrder.count({
      where: {
        status: "paid",
        approvalStatus: { in: ["not_required", "approved"] },
        orderCode: {
          notIn: (
            await prisma.emailLog.findMany({
              where: { templateType: "ticket_issued", status: "sent" },
              select: { attendeeRef: true },
            })
          )
            .map((r) => r.attendeeRef)
            .filter((v): v is string => Boolean(v)),
        },
      },
    }),
    prisma.attendeeOrder.count({
      where: {
        status: "paid",
        approvalStatus: { in: ["not_required", "approved"] },
        pretixSecret: null,
      },
    }),
  ]);

  const minutes = lastSent
    ? Math.floor((Date.now() - lastSent.createdAt.getTime()) / 60000)
    : null;
  const registrationsSince = lastSent
    ? await prisma.attendeeOrder.count({ where: { createdAt: { gt: lastSent.createdAt } } })
    : await prisma.attendeeOrder.count();

  const emailSilent =
    (minutes === null || minutes >= OUTAGE_MINUTES) && registrationsSince > 0;

  const checks = [
    {
      name: "email_not_silent",
      critical: true,
      ok: !emailSilent,
      detail: emailSilent
        ? `no successful send for ${minutes ?? "∞"} min while ${registrationsSince} registrations arrived`
        : `last send ${minutes ?? "never"} min ago`,
    },
    {
      name: "email_mode",
      critical: true,
      ok: emailMode() !== "disabled",
      detail: `mode=${emailMode()}`,
    },
    {
      name: "attendees_without_qr",
      critical: true,
      ok: noQr === 0,
      detail: `${noQr} issued orders have no QR secret and cannot be checked in`,
    },
    {
      name: "issued_without_ticket_email",
      critical: false,
      ok: issuedNoTicket === 0,
      detail: `${issuedNoTicket} paid attendees never received a ticket`,
    },
    {
      name: "email_failures_24h",
      critical: false,
      ok: failed24h === 0,
      detail: `${failed24h} failures in 24h`,
    },
  ];

  const failedCritical = checks.filter((c) => c.critical && !c.ok);
  return Response.json(
    { ok: failedCritical.length === 0, checks },
    { status: failedCritical.length === 0 ? 200 : 503 },
  );
}
