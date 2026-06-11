"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { inviteUserAction } from "./actions";

const ROLE_LABELS: Record<string, string> = {
  super_admin: "Super admin",
  organizer_admin: "Organizer admin",
  finance: "Finance",
  checkin_staff: "Check-in staff",
};

export function InviteUserForm({
  locale,
  orgs,
  roles,
}: {
  locale: string;
  orgs: { id: string; name: string }[];
  roles: string[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState({
    email: "",
    name: "",
    organizationId: orgs[0]?.id ?? "",
    role: roles[0] ?? "checkin_staff",
  });

  async function submit() {
    setBusy(true);
    setMsg(null);
    const res = await inviteUserAction(locale, {
      email: form.email,
      name: form.name || null,
      organizationId: form.organizationId,
      role: form.role as never,
    });
    setBusy(false);
    if (res.ok) {
      setMsg({ ok: !res.warning, text: res.warning ?? `Invite sent to ${form.email}.` });
      setForm({ ...form, email: "", name: "" });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error ?? "Failed" });
    }
  }

  const sel = "rounded-md border border-border bg-background px-2 py-1.5 text-sm";

  if (orgs.length === 0) return null;

  return (
    <div className="mt-4 rounded-[var(--radius-lg)] border border-border p-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Invite a user</h2>
        <Button type="button" variant="outline" onClick={() => setOpen((v) => !v)}>
          {open ? "Cancel" : "Invite user"}
        </Button>
      </div>

      {open && (
        <div className="mt-4 flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Label>Email</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
              />
            </div>
            <div>
              <Label>Name (optional)</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Organization</Label>
              <select
                className={`mt-1 w-full ${sel}`}
                value={form.organizationId}
                onChange={(e) => setForm({ ...form, organizationId: e.target.value })}
              >
                {orgs.map((o) => (
                  <option key={o.id} value={o.id}>{o.name}</option>
                ))}
              </select>
            </div>
            <div>
              <Label>Role</Label>
              <select
                className={`mt-1 w-full ${sel}`}
                value={form.role}
                onChange={(e) => setForm({ ...form, role: e.target.value })}
              >
                {roles.map((r) => (
                  <option key={r} value={r}>{ROLE_LABELS[r] ?? r}</option>
                ))}
              </select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            The user receives an email with a 7-day link to set their password and activate the account.
          </p>
          {msg && (
            <p className={`text-sm ${msg.ok ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"}`}>
              {msg.text}
            </p>
          )}
          <div>
            <Button type="button" onClick={submit} disabled={busy || !form.email || !form.organizationId}>
              {busy ? "Sending…" : "Send invite"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
