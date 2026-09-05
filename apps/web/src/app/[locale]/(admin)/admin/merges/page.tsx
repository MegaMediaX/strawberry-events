import Link from "next/link";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { listMergeEvents } from "@/lib/merge/admin";
import { ReverseButton } from "./reverse-button";

export const dynamic = "force-dynamic";

export default async function MergesPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);

  const session = await getSessionContext();
  const events = session ? await listMergeEvents(session) : [];

  return (
    <div className="max-w-4xl">
      <h1 className="text-2xl font-bold">Account links</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Every time a registration was attached to an account, or taken off one. This is the record
        to check when somebody says a registration is not theirs.
      </p>

      {events.length === 0 ? (
        <p className="mt-8 text-sm text-muted-foreground">Nothing has been linked yet.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {events.map((e) => (
            <li key={e.id} className="rounded-md border border-border p-4 text-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <span className="font-medium">{e.accountEmail}</span>
                <span className="text-xs text-muted-foreground">
                  {e.at.toISOString().replace("T", " ").slice(0, 16)} UTC
                </span>
              </div>

              <p className="mt-1 text-muted-foreground">
                {e.actorType === "staff_override"
                  ? `By ${e.actorEmail ?? "an organiser"}`
                  : "Claimed by the attendee"}
                {" · "}
                {e.proofType}
                {e.matchRule ? ` · rule ${e.matchRule}` : ""}
                {e.reason ? ` — ${e.reason}` : ""}
              </p>

              <ul className="mt-2 flex flex-wrap gap-2">
                {e.orders.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/${locale}/admin/registrations/${o.id}`}
                      className="rounded border border-border px-2 py-0.5 font-mono text-xs hover:bg-muted"
                    >
                      {o.orderCode}
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="mt-3 flex items-center gap-3">
                {e.reversedAt ? (
                  <span className="text-xs text-muted-foreground">
                    Reversed {e.reversedAt.toISOString().slice(0, 10)}
                    {e.reversedReason ? ` — ${e.reversedReason}` : ""}
                  </span>
                ) : e.reversible ? (
                  <ReverseButton locale={locale} eventId={e.id} />
                ) : (
                  <span className="text-xs text-muted-foreground">
                    Past the 30-day window — unlink from the registration instead.
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
