import { notFound } from "next/navigation";
import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { getEventForSession } from "@/lib/events/service";
import { listWaitlist } from "@/lib/waitlist/service";
import { PromoteButton } from "./promote-button";

export const dynamic = "force-dynamic";

export default async function WaitlistPage({
  params,
}: {
  params: Promise<{ locale: string; id: string }>;
}) {
  const { locale, id } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();

  const event = session ? await getEventForSession(session, id) : null;
  if (!event) notFound();
  const entries = session ? await listWaitlist(session, id) : [];
  const impersonating = !!session?.impersonating;

  return (
    <div>
      <h1 className="text-2xl font-bold">Waitlist — {event.titleEn}</h1>
      {entries.length === 0 ? (
        <p className="mt-4 text-muted-foreground">No one on the waitlist.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">#</th>
              <th>Email</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {entries.map((e) => (
              <tr key={e.id} className="border-b">
                <td className="py-2">{e.position}</td>
                <td>{e.email}</td>
                <td>{e.status}</td>
                <td className="text-end">
                  {e.status === "waiting" && (
                    <PromoteButton
                      locale={locale}
                      eventId={id}
                      entryId={e.id}
                      disabled={impersonating}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
