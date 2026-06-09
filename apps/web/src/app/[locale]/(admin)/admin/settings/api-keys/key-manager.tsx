"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { SCOPES } from "@/lib/api/scopes";
import { createKeyAction, revokeKeyAction } from "./actions";

export interface KeyRow {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  lastUsedAt: string | null;
  createdByUserId: string | null;
  expiresAt: string | null;
  revokedAt: string | null;
}

export function KeyManager({
  locale,
  organizationId,
  keys,
  canManage,
}: {
  locale: string;
  organizationId: string;
  keys: KeyRow[];
  canManage: boolean;
}) {
  const [name, setName] = useState("");
  const [scopes, setScopes] = useState<string[]>(["events:read"]);
  const [pending, start] = useTransition();
  const [raw, setRaw] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function toggle(s: string) {
    setScopes((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <section className="rounded-[var(--radius-lg)] border border-border p-4">
          <div className="font-medium">Create API key</div>
          <div className="mt-3 flex flex-col gap-3">
            <Input placeholder="Key name" value={name} onChange={(e) => setName(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={scopes.includes(s)} onChange={() => toggle(s)} />
                  {s}
                </label>
              ))}
            </div>
            <Button
              disabled={pending || !name}
              onClick={() =>
                start(async () => {
                  setError(null);
                  setRaw(null);
                  const res = await createKeyAction(locale, organizationId, name, scopes);
                  if (res.ok) {
                    setRaw(res.raw ?? null);
                    setName("");
                  } else setError(res.error ?? "Failed");
                })
              }
            >
              Create key
            </Button>
            {error && <p className="text-sm text-destructive">{error}</p>}
            {raw && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">Copy your key now — it won&apos;t be shown again:</p>
                <code className="mt-1 block break-all">{raw}</code>
              </div>
            )}
          </div>
        </section>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">Name</th><th>Prefix</th><th>Scopes</th>
            <th>Last used</th><th>Expires</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {keys.map((k) => (
            <tr key={k.id} className="border-b align-top">
              <td className="py-2">{k.name}</td>
              <td><code>{k.prefix}…</code></td>
              <td className="max-w-[16rem] text-xs">{k.scopes.join(", ")}</td>
              <td>{k.lastUsedAt ? new Date(k.lastUsedAt).toLocaleDateString() : "—"}</td>
              <td>{k.expiresAt ? new Date(k.expiresAt).toLocaleDateString() : "—"}</td>
              <td>{k.revokedAt ? "revoked" : "active"}</td>
              <td className="text-end">
                {canManage && !k.revokedAt && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={pending}
                    onClick={() => start(async () => { await revokeKeyAction(locale, k.id); })}
                  >
                    Revoke
                  </Button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
