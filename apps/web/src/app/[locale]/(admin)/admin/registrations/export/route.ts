import { getSessionContext } from "@/lib/auth/session";
import { hasAnyRole } from "@/lib/auth/guards";
import { listRegistrations, buildCsv, type RegistrationFilters } from "@/lib/admin/registrations";

export const dynamic = "force-dynamic";

/**
 * CSV export of registrations. Route handlers are not wrapped by the admin
 * layout, so auth + role are enforced here. Output is scoped by the session via
 * listRegistrations (no cross-org leakage); never includes QR/secret material.
 */
export async function GET(request: Request) {
  const session = await getSessionContext();
  if (!session) return new Response("Unauthorized", { status: 401 });
  if (!hasAnyRole(session, ["super_admin", "organizer_admin", "finance"])) {
    return new Response("Forbidden", { status: 403 });
  }

  const sp = new URL(request.url).searchParams;
  const filters: RegistrationFilters = {
    eventId: sp.get("event") || undefined,
    roleTag: sp.get("roleTag") || undefined,
    approvalStatus: sp.get("approval") || undefined,
    paymentStatus: sp.get("payment") || undefined,
    issued: sp.get("issued") === "yes" ? true : sp.get("issued") === "no" ? false : undefined,
    checkedIn: sp.get("checkin") === "yes" ? true : sp.get("checkin") === "no" ? false : undefined,
    createdFrom: sp.get("from") ? new Date(sp.get("from") as string) : undefined,
    createdTo: sp.get("to") ? new Date(sp.get("to") as string) : undefined,
    q: sp.get("q") || undefined,
  };

  const rows = await listRegistrations(session, filters, { take: 5000 });
  const csv = buildCsv(rows);

  return new Response(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="registrations.csv"',
    },
  });
}
