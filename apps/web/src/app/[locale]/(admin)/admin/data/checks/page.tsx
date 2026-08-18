import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { itemMap, doorRisk } from "@/lib/admin/data";
import { resolveEventId } from "../_event";

export const dynamic = "force-dynamic";

const REASON_TEXT: Record<string, string> = {
  no_qr: "No QR secret — the scanner cannot match them and the name-search path fails too.",
  no_ticket_email: "No ticket email was ever delivered — they arrive with nothing to show.",
  not_eligible: "Order state makes them ineligible for check-in.",
};

export default async function ChecksPage({
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
  if (!eventId) return <p className="text-sm text-muted-foreground">No event configured.</p>;

  const [map, risk] = await Promise.all([
    itemMap(session, eventId).catch((err) => {
      console.error("[data] itemMap failed:", (err as Error).message);
      return { error: true } as const;
    }),
    doorRisk(session, eventId),
  ]);

  const th = "px-3 py-2 text-left text-xs font-semibold tracking-[0.04em] uppercase text-muted-foreground";
  const td = "px-3 py-2 align-top";

  return (
    <div>
      <Link className="text-sm underline" href={`/${locale}/admin/data`}>← Data</Link>
      <h1 className="mt-2 text-2xl font-bold">Checks</h1>

      <h2 className="mt-6 text-lg font-semibold">Sessions vs pretix products</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
        Our sessions table and pretix&apos;s product list are edited independently and nothing
        compares them. A session can point at a product that no longer exists — unbookable,
        reading zero forever — and a product can carry real bookings that no session claims,
        putting those people in no list and no room.
      </p>

      {"error" in map ? (
        <p className="mt-3 rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Could not reach pretix. The details are in the server log.
        </p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-[var(--radius-md)] border border-border">
          <table className="w-full min-w-[52rem] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className={th}>Severity</th>
                <th className={th}>Session</th>
                <th className={th}>pretix item</th>
                <th className={th}>Finding</th>
              </tr>
            </thead>
            <tbody>
              {map.map((r, i) => (
                <tr key={`${r.subEventId ?? "item"}-${r.itemId ?? i}`} className="border-t border-border">
                  <td className={td}>
                    <span
                      className={
                        r.severity === "critical"
                          ? "font-semibold text-destructive"
                          : r.severity === "warn"
                            ? "font-semibold text-amber-600"
                            : "text-muted-foreground"
                      }
                    >
                      {r.severity}
                    </span>
                  </td>
                  <td className={td}>
                    {r.subEventTitle ?? <span className="text-muted-foreground">— none —</span>}
                    {r.category && <span className="ml-1 text-xs text-muted-foreground">({r.category})</span>}
                  </td>
                  <td className={td}>
                    {r.itemId == null ? (
                      <span className="text-muted-foreground">— none —</span>
                    ) : (
                      <>
                        <span className="font-mono text-xs">#{r.itemId}</span>{" "}
                        {r.itemName ?? <span className="text-destructive">missing</span>}
                      </>
                    )}
                  </td>
                  <td className={`${td} text-muted-foreground`}>{r.finding}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <h2 className="mt-8 text-lg font-semibold">Door risk — {risk.rows.length} people</h2>
      <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
        Covered here: {risk.checksRun.join("; ")}. Not covered without a pretix sweep:{" "}
        {risk.checksSkipped.join("; ")}. Print this before the doors open.
      </p>
      {risk.rows.length === 0 ? (
        <p className="mt-3 text-sm">Nobody is currently at risk.</p>
      ) : (
        <div className="mt-3 overflow-x-auto rounded-[var(--radius-md)] border border-border">
          <table className="w-full min-w-[44rem] text-sm">
            <thead className="bg-muted/40">
              <tr>
                <th className={th}>Order</th>
                <th className={th}>Name</th>
                <th className={th}>Email</th>
                <th className={th}>Why</th>
              </tr>
            </thead>
            <tbody>
              {risk.rows.map((r) => (
                <tr key={`${r.orderCode}-${r.reason}`} className="border-t border-border">
                  <td className={`${td} font-mono text-xs`}>{r.orderCode}</td>
                  <td className={td}>{r.attendeeName ?? "—"}</td>
                  <td className={td}>{r.email}</td>
                  <td className={`${td} text-muted-foreground`}>{REASON_TEXT[r.reason] ?? r.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
