import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import {
  doorRisk,
  emailHealth,
  configAssertions,
  webhookStatus,
} from "@/lib/admin/data";
import { resolveEventId } from "./_event";
import { RegisterWebhookButton } from "./register-webhook-button";

export const dynamic = "force-dynamic";

function Card({
  title,
  tone,
  children,
}: {
  title: string;
  tone: "ok" | "warn" | "critical";
  children: React.ReactNode;
}) {
  const border =
    tone === "critical"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "warn"
        ? "border-amber-500/40 bg-amber-500/5"
        : "border-border bg-card";
  return (
    <section className={`rounded-[var(--radius-md)] border p-4 ${border}`}>
      <h2 className="text-sm font-semibold tracking-[0.04em] uppercase">{title}</h2>
      <div className="mt-2 text-sm">{children}</div>
    </section>
  );
}

export default async function DataPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  const eventId = await resolveEventId(session, sp.event);
  if (!eventId) {
    return (
      <div>
        <h1 className="text-2xl font-bold">Data</h1>
        <p className="mt-2 text-sm text-muted-foreground">No event is configured yet.</p>
      </div>
    );
  }

  const [risk, mail, asserts, hooks] = await Promise.all([
    doorRisk(session, eventId),
    emailHealth(session, eventId),
    configAssertions(session, eventId),
    webhookStatus(session, eventId).catch((err) => {
      console.error("[data] webhookStatus failed:", (err as Error).message);
      return {
        registered: false,
        expectedUrl: "",
        hooks: [],
        missingActions: [],
        error: "unavailable",
      };
    }),
  ]);

  const base = `/${locale}/admin/data`;

  return (
    <div>
      <h1 className="text-2xl font-bold">Data</h1>
      <p className="mt-1 max-w-[68ch] text-sm text-muted-foreground">
        Checks and lists, not charts. Every number here is a count with the rows
        behind it — the failures that have actually bitten this event were
        absences, and an absence never appears in a log of what happened.
      </p>

      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <Card title="Door risk" tone={risk.blocked > 0 ? "critical" : risk.noTicket > 0 ? "warn" : "ok"}>
          <p className="text-3xl font-bold">
            {risk.blocked}
            <span className="ml-2 text-base font-normal text-muted-foreground">
              cannot be checked in
            </span>
          </p>
          <p className="mt-1 text-muted-foreground">
            {risk.noTicket} will arrive without a ticket in hand.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {risk.checksRun.length} of {risk.checksRun.length + risk.checksSkipped.length} checks
            run. Not covered without a pretix sweep: {risk.checksSkipped.join("; ")}.
          </p>
          {risk.rows.length > 0 && (
            <Link className="mt-2 inline-block text-sm font-medium underline" href={`${base}/checks?event=${eventId}`}>
              See the list →
            </Link>
          )}
        </Card>

        <Card title="Email" tone={mail.silentOutage ? "critical" : mail.failed24h > 0 ? "warn" : "ok"}>
          {mail.silentOutage ? (
            <p className="font-semibold text-destructive">
              Nothing has sent for {mail.minutesSinceLastSend ?? "∞"} minutes, while{" "}
              {mail.registrationsSinceLastSend} registrations arrived. Treat as an outage.
            </p>
          ) : (
            <p>
              Last successful send{" "}
              {mail.minutesSinceLastSend === null ? "never" : `${mail.minutesSinceLastSend} min ago`}.
            </p>
          )}
          <p className="mt-1 text-muted-foreground">
            24h — sent {mail.sent24h}, failed {mail.failed24h}
            {mail.disabled24h > 0 && `, logged-but-disabled ${mail.disabled24h}`} · mode {mail.mode}
          </p>
          {mail.lastError && (
            <p className="mt-1 font-mono text-xs text-destructive">{mail.lastError}</p>
          )}
        </Card>

        <Card title="pretix webhook" tone={hooks.registered ? "ok" : "critical"}>
          {hooks.error ? (
            <p className="text-destructive">
              Could not read webhook state from pretix. Details are in the server log.
            </p>
          ) : hooks.registered ? (
            <p>Registered and enabled for paid, canceled and check-in events.</p>
          ) : (
            <>
              <p className="font-semibold text-destructive">
                {hooks.hooks.length === 0
                  ? "No webhook registered."
                  : `Registered, but missing: ${hooks.missingActions.join(", ")}.`}
              </p>
              <p className="mt-1 text-muted-foreground">
                Until this exists, an order marked paid inside pretix, a cancellation, or a
                pretixSCAN check-in never reaches this database — and any reconciliation you do
                by hand starts drifting again immediately.
              </p>
              <RegisterWebhookButton locale={locale} eventId={eventId} />
            </>
          )}
        </Card>

        <Card title="Configuration" tone={asserts.some((a) => !a.ok) ? "warn" : "ok"}>
          <ul className="space-y-1">
            {asserts.map((a) => (
              <li key={a.name} className="flex gap-2">
                <span className={a.ok ? "text-muted-foreground" : "font-semibold text-destructive"}>
                  {a.ok ? "ok" : "!!"}
                </span>
                <span>
                  <span className="font-medium">{a.name}</span>{" "}
                  <span className="text-muted-foreground">— {a.detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <nav className="mt-6 flex flex-wrap gap-3">
        <Link className="text-sm font-medium underline" href={`${base}/rosters?event=${eventId}`}>
          Rosters — who is in each session
        </Link>
        <Link className="text-sm font-medium underline" href={`${base}/checks?event=${eventId}`}>
          Checks — sessions vs pretix products
        </Link>
      </nav>
    </div>
  );
}
