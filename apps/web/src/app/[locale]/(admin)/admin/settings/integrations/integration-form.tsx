"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { saveIntegrationAction, testIntegrationAction } from "./actions";

export interface FieldDef {
  key: string;
  label: string;
  secret?: boolean;
}

export function IntegrationForm({
  locale, orgId, provider, fields, initial, enabled, canEdit,
}: {
  locale: string;
  orgId: string;
  provider: string;
  fields: FieldDef[];
  initial: Record<string, unknown>; // redacted config (secrets → <key>Configured)
  enabled: boolean;
  canEdit: boolean;
}) {
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.filter((f) => !f.secret).map((f) => [f.key, String(initial[f.key] ?? "")])),
  );
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [on, setOn] = useState(enabled);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!canEdit) {
    return <p className="text-sm text-muted-foreground">You can view status but not edit this integration.</p>;
  }

  return (
    <div className="flex max-w-lg flex-col gap-3">
      {fields.map((f) =>
        f.secret ? (
          <div key={f.key}>
            <Label>
              {f.label} {initial[`${f.key}Configured`] ? "(set — leave blank to keep)" : ""}
            </Label>
            <Input type="password" value={secrets[f.key] ?? ""}
              onChange={(e) => setSecrets({ ...secrets, [f.key]: e.target.value })} />
          </div>
        ) : (
          <div key={f.key}>
            <Label>{f.label}</Label>
            <Input value={values[f.key] ?? ""}
              onChange={(e) => setValues({ ...values, [f.key]: e.target.value })} />
          </div>
        ),
      )}
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={on} onChange={(e) => setOn(e.target.checked)} /> Enabled
      </label>
      <div className="flex gap-2">
        <Button disabled={pending} onClick={() => start(async () => {
          setMsg(null);
          const usableSecrets = Object.fromEntries(Object.entries(secrets).filter(([, v]) => v));
          const res = await saveIntegrationAction(locale, orgId, provider, {
            enabled: on, config: values, secrets: usableSecrets,
          });
          setMsg(res.ok ? "Saved." : (res.error ?? "Failed"));
          if (res.ok) setSecrets({});
        })}>Save</Button>
        <Button variant="outline" disabled={pending} onClick={() => start(async () => {
          const res = await testIntegrationAction(orgId, provider);
          setMsg(res.ok ? "Test ok" : `Test: ${res.error}`);
        })}>Test connection</Button>
      </div>
      {msg && <p className="text-sm">{msg}</p>}
    </div>
  );
}
