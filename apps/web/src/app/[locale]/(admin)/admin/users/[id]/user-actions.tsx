"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { setStatusAction, changeRoleAction } from "../actions";

interface Membership {
  organizationId: string;
  role: MemberRole;
  assignedEventIds: string[];
}

export function UserActions({
  userId,
  suspended,
  isSuper,
  orgs,
  events,
  memberships,
}: {
  userId: string;
  suspended: boolean;
  isSuper: boolean;
  orgs: { id: string; name: string }[];
  /**
   * Keyed by localEventId, NOT EventMapping.id — that is what
   * canAccessEvent() and lib/admin/scope.ts compare assignedEventIds against.
   */
  events: { localEventId: string; titleEn: string; organizationId: string }[];
  memberships: Membership[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [role, setRole] = useState<MemberRole>("checkin_staff");
  // Seeded from what the member already holds per org, so switching orgs shows
  // their real assignment and submitting an unrelated change never quietly drops
  // their door access. Held per-org rather than synced in an effect — a setState
  // inside useEffect would cascade a second render on every org switch.
  const [assignedByOrg, setAssignedByOrg] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(memberships.map((m) => [m.organizationId, m.assignedEventIds])),
  );
  const assigned = assignedByOrg[orgId] ?? [];

  const roles: MemberRole[] = isSuper
    ? ["super_admin", "organizer_admin", "finance", "checkin_staff"]
    : ["organizer_admin", "finance", "checkin_staff"];

  const orgEvents = events.filter((e) => e.organizationId === orgId);

  function toggleEvent(localEventId: string) {
    setAssignedByOrg((prev) => {
      const current = prev[orgId] ?? [];
      return {
        ...prev,
        [orgId]: current.includes(localEventId)
          ? current.filter((id) => id !== localEventId)
          : [...current, localEventId],
      };
    });
  }

  async function toggleSuspend() {
    setBusy(true); setMsg(null);
    const res = await setStatusAction(userId, !suspended);
    setBusy(false);
    if (!res.ok) return setMsg(res.error ?? "Failed");
    router.refresh();
  }

  async function applyRole() {
    if (!orgId) return setMsg("Select an organization.");
    setBusy(true); setMsg(null);
    // Only check-in staff are event-scoped. Every other role passes undefined so
    // changeRole() keeps whatever assignment is already stored.
    const res = await changeRoleAction(
      userId,
      orgId,
      role,
      role === "checkin_staff" ? assigned : undefined,
    );
    setBusy(false);
    if (!res.ok) return setMsg(res.error ?? "Failed");
    setMsg(
      role === "checkin_staff" && assigned.length === 0
        ? "Role updated. No events selected, so this member cannot check anyone in yet."
        : "Role updated.",
    );
    router.refresh();
  }

  const sel = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  return (
    <div className="mt-2 flex flex-col gap-4">
      <div className="flex items-center gap-3">
        <Button type="button" variant={suspended ? "default" : "outline"} onClick={toggleSuspend} disabled={busy}>
          {suspended ? "Reactivate user" : "Suspend user"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {suspended ? "Suspended users cannot sign in or access protected areas." : ""}
        </span>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label className="block text-xs text-muted-foreground">Organization</label>
          <select className={sel} value={orgId} onChange={(e) => setOrgId(e.target.value)}>
            {orgs.length === 0 && <option value="">No organizations</option>}
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground">Role</label>
          <select className={sel} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
            {roles.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
      </div>

      {role === "checkin_staff" && (
        <div className="flex flex-col gap-2 border-l-2 border-border pl-3">
          <div>
            <span className="block text-sm font-medium">Events this member can check in</span>
            <p className="text-xs text-muted-foreground">
              Check-in staff reach only the events selected here. With none selected they
              see an empty event list and cannot scan at the door.
            </p>
          </div>
          {orgEvents.length === 0 ? (
            <p className="text-sm text-muted-foreground">No events in this organization yet.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {orgEvents.map((e) => (
                <label key={e.localEventId} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={assigned.includes(e.localEventId)}
                    onChange={() => toggleEvent(e.localEventId)}
                  />
                  {e.titleEn}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      <div>
        <Button type="button" onClick={applyRole} disabled={busy}>Set role</Button>
      </div>

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
