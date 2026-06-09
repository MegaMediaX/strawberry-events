import { setRequestLocale } from "next-intl/server";
import { getSessionContext, requireRole } from "@/lib/auth/session";
import { prisma } from "@/lib/db/client";
import { listApiKeys } from "@/lib/api/admin-service";
import { KeyManager, type KeyRow } from "./key-manager";

export const dynamic = "force-dynamic";

async function resolveOrgId(session: NonNullable<Awaited<ReturnType<typeof getSessionContext>>>) {
  const membership = session.memberships.find((m) => m.role === "organizer_admin");
  if (membership) return membership.organizationId;
  if (session.isSuperAdmin) {
    const org = await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } });
    return org?.id ?? null;
  }
  return null;
}

export default async function ApiKeysPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  await requireRole(["super_admin", "organizer_admin"], `/${locale}/admin`);
  const session = await getSessionContext();
  const orgId = session ? await resolveOrgId(session) : null;

  const keys = orgId && session ? await listApiKeys(session, orgId) : [];
  const rows: KeyRow[] = keys.map((k) => ({
    id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes,
    lastUsedAt: k.lastUsedAt?.toISOString() ?? null,
    createdByUserId: k.createdByUserId,
    expiresAt: k.expiresAt?.toISOString() ?? null,
    revokedAt: k.revokedAt?.toISOString() ?? null,
  }));

  return (
    <div>
      <h1 className="text-2xl font-bold">API keys</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Keys authenticate the external API at <code>/api/v1</code>. The raw key is shown once.
      </p>
      <div className="mt-6">
        {orgId ? (
          <KeyManager
            locale={locale}
            organizationId={orgId}
            keys={rows}
            canManage={!session?.impersonating}
          />
        ) : (
          <p className="text-muted-foreground">No organization available.</p>
        )}
      </div>
    </div>
  );
}
