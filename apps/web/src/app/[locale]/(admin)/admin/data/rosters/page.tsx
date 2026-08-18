import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { rosters } from "@/lib/admin/data";
import { VENUE_TIME_ZONE } from "@/lib/datetime/uk";
import { resolveEventId } from "../_event";

export const dynamic = "force-dynamic";

/**
 * Sub-event times are naive venue wall-clock, handed back labelled UTC, so
 * formatting in VENUE_TIME_ZONE prints the digits the organiser typed. Never
 * format these in the viewer's zone.
 */
function whenLabel(d: Date | null): string {
  if (!d) return "";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
    timeZone: VENUE_TIME_ZONE,
  }).format(d);
}

export default async function RostersPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ event?: string; item?: string; load?: string }>;
}) {
  const { locale } = await params;
  const sp = await searchParams;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();
  if (!session) return null;

  const eventId = await resolveEventId(session, sp.event);
  if (!eventId) return <p className="text-sm text-muted-foreground">No event configured.</p>;

  // The sweep is ~16 sequential pretix calls. During the event pretix is the
  // critical path for every door scan, so this must never run just because
  // someone opened or refreshed a tab — the adapter's own doc says as much and
  // an earlier version of this page ignored it. Explicit load only.
  if (!sp.load) {
    return (
      <div>
        <Link className="text-sm underline" href={`/${locale}/admin/data`}>← Data</Link>
        <h1 className="mt-2 text-2xl font-bold">Rosters</h1>
        <p className="mt-2 max-w-[70ch] text-sm text-muted-foreground">
          Building this reads every order from pretix — roughly 16 sequential API
          calls. That is fine now and a bad idea on event days, when pretix is
          answering the door scanner, so it only runs when you ask.
        </p>
        <Link
          className="mt-4 inline-flex min-h-11 items-center rounded-[var(--radius-md)] border border-primary bg-primary px-4 text-sm font-medium text-primary-foreground"
          href={`/${locale}/admin/data/rosters?event=${eventId}&load=1`}
        >
          Load rosters from pretix
        </Link>
      </div>
    );
  }

  let all;
  try {
    all = await rosters(session, eventId);
  } catch (err) {
    console.error("[data] rosters failed:", (err as Error).message);
    return (
      <div>
        <Link className="text-sm underline" href={`/${locale}/admin/data`}>← Data</Link>
        <h1 className="mt-2 text-2xl font-bold">Rosters</h1>
        <p className="mt-3 rounded-[var(--radius-md)] border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          Could not read from pretix. The details are in the server log.
        </p>
      </div>
    );
  }

  const selected = sp.item ? all.find((r) => String(r.itemId) === sp.item) : all[0];
  const base = `/${locale}/admin/data/rosters?event=${eventId}&load=1`;
  const th = "px-3 py-2 text-left text-xs font-semibold tracking-[0.04em] uppercase text-muted-foreground";
  const td = "px-3 py-2";

  return (
    <div>
      <div className="print:hidden">
        <Link className="text-sm underline" href={`/${locale}/admin/data`}>← Data</Link>
        <h1 className="mt-2 text-2xl font-bold">Rosters</h1>
        <p className="mt-1 max-w-[70ch] text-sm text-muted-foreground">
          Who is booked into each session. Listed by pretix product rather than by our
          sessions table, deliberately — anything sold appears here even when no session
          references it, which is the only way an orphaned product becomes visible.
        </p>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 print:hidden">
        {all.map((r) => {
          const active = selected?.itemId === r.itemId;
          return (
            <Link
              key={r.itemId}
              href={`${base}&item=${r.itemId}`}
              aria-current={active ? "true" : undefined}
              className={`inline-flex min-h-11 items-center rounded-[var(--radius-md)] border px-3 text-sm font-medium ${
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card hover:bg-accent"
              }`}
            >
              {r.subEventTitle ?? r.itemName}
              <span className={`ml-2 text-xs ${active ? "opacity-80" : "text-muted-foreground"}`}>
                {r.headcount}
              </span>
              {!r.subEventTitle && (
                <span className="ml-2 rounded bg-amber-500/20 px-1 text-[11px] text-amber-700">
                  unmapped
                </span>
              )}
            </Link>
          );
        })}
      </div>

      {!selected ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing booked yet.</p>
      ) : (
        <>
          <div className="mt-6 flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <h2 className="text-lg font-semibold">
                {selected.subEventTitle ?? selected.itemName}
              </h2>
              <p className="text-sm text-muted-foreground">
                {selected.headcount} booked
                {selected.headcount !== selected.entries.length &&
                  ` across ${selected.entries.length} orders`}
                {selected.dateFrom && ` · ${whenLabel(selected.dateFrom)}`}
                {selected.category && ` · ${selected.category}`}
                {!selected.subEventTitle &&
                  " · not linked to any session — nobody has staffed a room for these people"}
              </p>
            </div>
            <a
              className="text-sm font-medium underline print:hidden"
              href={`/${locale}/admin/data/rosters/export?event=${eventId}&item=${selected.itemId}`}
            >
              Download CSV
            </a>
          </div>

          <div className="mt-3 overflow-x-auto rounded-[var(--radius-md)] border border-border">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th className={th}>#</th>
                  <th className={th}>Name</th>
                  <th className={th}>Company</th>
                  <th className={th}>Email</th>
                  <th className={th}>Phone</th>
                  <th className={th}>Order</th>
                </tr>
              </thead>
              <tbody>
                {selected.entries.map((e, i) => (
                  <tr key={e.orderCode} className="border-t border-border">
                    <td className={`${td} text-muted-foreground`}>{i + 1}</td>
                    <td className={td}>
                      {e.name || <span className="text-muted-foreground">— no name —</span>}
                      {!e.inAppDb && (
                        <span className="ml-2 rounded bg-destructive/15 px-1 text-[11px] text-destructive">
                          not in app DB
                        </span>
                      )}
                    </td>
                    <td className={td}>
                      {e.company}
                      {e.seats > 1 && (
                        <span className="ml-2 rounded bg-muted px-1 text-[11px] text-muted-foreground">
                          {e.seats} seats
                        </span>
                      )}
                    </td>
                    <td className={td}>{e.email}</td>
                    <td className={`${td} whitespace-nowrap`}>{e.phone}</td>
                    <td className={`${td} font-mono text-xs`}>{e.orderCode}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
