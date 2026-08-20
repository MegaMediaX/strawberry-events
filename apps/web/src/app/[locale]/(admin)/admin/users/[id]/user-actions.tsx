"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MemberRole } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { setStatusAction, changeRoleAction } from "../actions";

export function UserActions({
  userId,
  suspended,
  isSuper,
  orgs,
  events,
  subEvents,
}: {
  userId: string;
  suspended: boolean;
  isSuper: boolean;
  orgs: { id: string; name: string }[];
  /** Events selectable when granting checkin_staff, grouped by org. */
  events: { id: string; label: string; organizationId: string }[];
  /** Sessions selectable when granting workshop_organiser, grouped by org. */
  subEvents: { id: string; label: string; organizationId: string }[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [orgId, setOrgId] = useState(orgs[0]?.id ?? "");
  const [role, setRole] = useState<MemberRole>("checkin_staff");

  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [eventIds, setEventIds] = useState<string[]>([]);

  const roles: MemberRole[] = isSuper
    ? ["super_admin", "organizer_admin", "finance", "checkin_staff", "workshop_organiser"]
    : ["organizer_admin", "finance", "checkin_staff", "workshop_organiser"];

  const orgEvents = events.filter((e) => e.organizationId === orgId);

  const orgSubEvents = subEvents.filter((se) => se.organizationId === orgId);

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
    // checkin_staff is narrowed to named events, so an empty list here produces
    // an account that signs in and cannot check anyone in. Refuse it here
    // rather than let someone find out at the door.
    if (role === "checkin_staff" && eventIds.length === 0) {
      setBusy(false);
      return setMsg("Pick at least one event — check-in staff can only work the events you assign.");
    }

    const res = await changeRoleAction(
      userId,
      orgId,
      role,
      role === "checkin_staff" ? eventIds : [],
      role === "workshop_organiser" ? sessionIds : [],
    );
    setBusy(false);
    if (!res.ok) return setMsg(res.error ?? "Failed");
    setMsg("Role updated.");
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
          <select
            className={sel}
            value={orgId}
            onChange={(e) => {
              setEventIds([]);
              // Clear the session picks: they belong to the previous org, are no
              // longer rendered, and would otherwise be submitted invisibly and
              // rejected with a message naming no particular checkbox.
              setOrgId(e.target.value);
              setSessionIds([]);
            }}
          >
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
        <Button type="button" onClick={applyRole} disabled={busy}>Set role</Button>
      </div>

      {role === "checkin_staff" && (
        <div className="rounded-[var(--radius-md)] border border-border bg-card p-3">
          <p className="text-sm font-medium">Events this person may check in</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Required. Check-in staff are narrowed to named events — with none
            assigned they can sign in and every scan is refused.
          </p>
          {orgEvents.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              This organization has no events to assign.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-1">
              {orgEvents.map((ev) => (
                <label key={ev.id} className="flex min-h-8 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={eventIds.includes(ev.id)}
                    onChange={(e) =>
                      setEventIds((prev) =>
                        e.target.checked ? [...prev, ev.id] : prev.filter((x) => x !== ev.id),
                      )
                    }
                  />
                  {ev.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {role === "workshop_organiser" && (
        <div className="rounded-[var(--radius-md)] border border-border bg-card p-3">
          <p className="text-sm font-medium">Sessions this organiser may see</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            They will see the registrations booked into these sessions and nothing
            else — no other attendees, no finance, no settings.
          </p>
          {orgSubEvents.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">
              This organization has no sessions to assign.
            </p>
          ) : (
            <div className="mt-2 flex flex-col gap-1">
              {orgSubEvents.map((se) => (
                <label key={se.id} className="flex min-h-8 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={sessionIds.includes(se.id)}
                    onChange={(e) =>
                      setSessionIds((prev) =>
                        e.target.checked ? [...prev, se.id] : prev.filter((x) => x !== se.id),
                      )
                    }
                  />
                  {se.label}
                </label>
              ))}
            </div>
          )}
        </div>
      )}

      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
    </div>
  );
}
