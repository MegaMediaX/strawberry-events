import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { scopeWhere } from "@/lib/auth/org-scope";
import { prisma } from "@/lib/db/client";
import { registrationState } from "@/lib/approval/state";

export const dynamic = "force-dynamic";

const STATE_LABEL: Record<string, string> = {
  issued: "Issued",
  pending_payment: "Pending payment",
  pending_approval: "Pending approval",
  rejected: "Rejected",
  canceled: "Canceled",
};

export default async function RegistrationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();

  // Org-scoped: non-super sees only their org's events' registrations.
  const scope = session ? scopeWhere(session) : { organizationId: "__none__" };
  const where: Record<string, unknown> =
    session?.isSuperAdmin || !("organizationId" in scope)
      ? {}
      : { eventMapping: { organizationId: scope.organizationId } };

  const orders = session
    ? await prisma.attendeeOrder.findMany({
        where,
        include: { eventMapping: { select: { titleEn: true } } },
        orderBy: { createdAt: "desc" },
        take: 200,
      })
    : [];

  return (
    <div>
      <h1 className="text-2xl font-bold">Registrations</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        All attendee registrations across your events ({orders.length}). Use Approvals to
        decide pending ones and Finance to mark COD orders paid.
      </p>
      {orders.length === 0 ? (
        <p className="mt-6 text-muted-foreground">No registrations yet.</p>
      ) : (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-2">Event</th>
              <th>Attendee</th>
              <th>Order</th>
              <th>Method</th>
              <th>State</th>
              <th>Created</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o) => {
              const state = registrationState(o);
              return (
                <tr key={o.id} className="border-b">
                  <td className="py-2">{o.eventMapping.titleEn}</td>
                  <td>{o.attendeeName ?? o.email}</td>
                  <td className="font-mono text-xs">{o.orderCode}</td>
                  <td>{o.provider === "free" ? "Free" : "COD"}</td>
                  <td>{STATE_LABEL[state] ?? state}</td>
                  <td>{new Date(o.createdAt).toLocaleDateString()}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}
