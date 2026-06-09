/**
 * Pure chooser for the active organization id.
 * - org_admin (non-super): always their first membership org, cookie ignored.
 * - super_admin: the cookie org if it's a known org, else the first org.
 * Returns null when there are no candidate orgs.
 */
export function chooseActiveOrgId(
  membershipOrgIds: string[],
  isSuperAdmin: boolean,
  cookieOrgId: string | undefined,
  allOrgIds: string[],
): string | null {
  if (!isSuperAdmin) {
    return membershipOrgIds[0] ?? null;
  }
  if (cookieOrgId && allOrgIds.includes(cookieOrgId)) {
    return cookieOrgId;
  }
  return allOrgIds[0] ?? null;
}
