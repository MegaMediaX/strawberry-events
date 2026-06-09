"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveSmtpAction, testSmtpAction } from "../actions";

export interface SmtpInitial {
  host: string; port: number; username: string | null; fromName: string;
  fromEmail: string; replyTo: string | null; encryption: "none" | "tls" | "ssl";
  passwordConfigured: boolean; lastTestedAt: string | null; lastError: string | null;
}

export function SmtpForm({
  locale, orgId, initial, canEdit,
}: {
  locale: string; orgId: string; initial: SmtpInitial | null; canEdit: boolean;
}) {
  const [f, setF] = useState({
    host: initial?.host ?? "", port: String(initial?.port ?? 587),
    username: initial?.username ?? "", password: "",
    fromName: initial?.fromName ?? "", fromEmail: initial?.fromEmail ?? "",
    replyTo: initial?.replyTo ?? "", encryption: initial?.encryption ?? "tls",
  });
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const set = (k: keyof typeof f, v: string) => setF({ ...f, [k]: v });

  if (!canEdit) {
    return <p className="text-sm text-muted-foreground">You can view status but not edit SMTP settings.</p>;
  }

  return (
    <div className="flex max-w-lg flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Host</Label><Input value={f.host} onChange={(e) => set("host", e.target.value)} /></div>
        <div><Label>Port</Label><Input value={f.port} onChange={(e) => set("port", e.target.value)} /></div>
      </div>
      <div><Label>Username</Label><Input value={f.username} onChange={(e) => set("username", e.target.value)} /></div>
      <div>
        <Label>Password {initial?.passwordConfigured ? "(set — leave blank to keep)" : ""}</Label>
        <Input type="password" value={f.password} onChange={(e) => set("password", e.target.value)} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><Label>From name</Label><Input value={f.fromName} onChange={(e) => set("fromName", e.target.value)} /></div>
        <div><Label>From email</Label><Input value={f.fromEmail} onChange={(e) => set("fromEmail", e.target.value)} /></div>
      </div>
      <div><Label>Reply-to</Label><Input value={f.replyTo} onChange={(e) => set("replyTo", e.target.value)} /></div>
      <div>
        <Label>Encryption</Label>
        <select className="block w-full rounded-md border border-border bg-background p-2"
          value={f.encryption} onChange={(e) => set("encryption", e.target.value)}>
          <option value="none">none</option><option value="tls">tls</option><option value="ssl">ssl</option>
        </select>
      </div>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => {
          setMsg(null);
          const res = await saveSmtpAction(locale, orgId, {
            host: f.host, port: Number(f.port) || 587, username: f.username || null,
            password: f.password || null, fromName: f.fromName, fromEmail: f.fromEmail,
            replyTo: f.replyTo || null, encryption: f.encryption as "none" | "tls" | "ssl",
          });
          setMsg(res.ok ? "Saved." : (res.error ?? "Failed"));
          if (res.ok) setF({ ...f, password: "" });
        })}>Save</Button>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const res = await testSmtpAction(orgId);
          setMsg(res.ok ? "Test email sent (dev-log in non-production)." : `Test failed: ${res.error}`);
        })}>Send test</Button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
      {initial?.lastError && <p className="text-xs text-destructive">Last error: {initial.lastError}</p>}
    </div>
  );
}
