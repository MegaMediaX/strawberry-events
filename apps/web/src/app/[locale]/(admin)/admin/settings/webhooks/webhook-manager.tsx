"use client";

import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { WEBHOOK_EVENTS } from "@/lib/webhooks/events";
import {
  createWebhookAction,
  setEnabledAction,
  rotateSecretAction,
  testWebhookAction,
} from "./actions";

export interface WebhookRow {
  id: string;
  url: string;
  events: string[];
  active: boolean;
}

export function WebhookManager({
  locale,
  organizationId,
  webhooks,
  canManage,
}: {
  locale: string;
  organizationId: string;
  webhooks: WebhookRow[];
  canManage: boolean;
}) {
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>([]);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);

  function toggle(e: string) {
    setEvents((cur) => (cur.includes(e) ? cur.filter((x) => x !== e) : [...cur, e]));
  }

  return (
    <div className="flex flex-col gap-6">
      {canManage && (
        <section className="rounded-[var(--radius-lg)] border border-border p-4">
          <div className="font-medium">Add webhook endpoint</div>
          <div className="mt-3 flex flex-col gap-3">
            <Input placeholder="https://example.com/webhook" value={url} onChange={(e) => setUrl(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {WEBHOOK_EVENTS.map((e) => (
                <label key={e} className="flex items-center gap-1 text-xs">
                  <input type="checkbox" checked={events.includes(e)} onChange={() => toggle(e)} />
                  {e}
                </label>
              ))}
            </div>
            <Button
              disabled={pending || !url || events.length === 0}
              onClick={() =>
                start(async () => {
                  setMsg(null); setSecret(null);
                  const res = await createWebhookAction(locale, organizationId, url, events);
                  if (res.ok) { setSecret(res.secret ?? null); setUrl(""); setEvents([]); }
                  else setMsg(res.error ?? "Failed");
                })
              }
            >
              Add endpoint
            </Button>
            {msg && <p className="text-sm text-destructive">{msg}</p>}
            {secret && (
              <div className="rounded-md bg-muted p-3 text-sm">
                <p className="font-medium">Signing secret (store securely):</p>
                <code className="mt-1 block break-all">{secret}</code>
              </div>
            )}
          </div>
        </section>
      )}

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-left text-muted-foreground">
            <th className="py-2">URL</th><th>Events</th><th>Status</th><th></th>
          </tr>
        </thead>
        <tbody>
          {webhooks.map((w) => (
            <tr key={w.id} className="border-b align-top">
              <td className="py-2 max-w-[16rem] break-all">{w.url}</td>
              <td className="max-w-[16rem] text-xs">{w.events.join(", ")}</td>
              <td>{w.active ? "enabled" : "disabled"}</td>
              <td className="text-end">
                {canManage && (
                  <span className="inline-flex gap-2">
                    <Button size="sm" variant="outline" disabled={pending}
                      onClick={() => start(async () => { await setEnabledAction(locale, w.id, !w.active); })}>
                      {w.active ? "Disable" : "Enable"}
                    </Button>
                    <Button size="sm" variant="outline" disabled={pending}
                      onClick={() => start(async () => { const r = await rotateSecretAction(locale, w.id); if (r.ok) setSecret(r.secret ?? null); })}>
                      Rotate
                    </Button>
                    <Button size="sm" variant="outline" disabled={pending}
                      onClick={() => start(async () => { const r = await testWebhookAction(w.id); setMsg(r.ok ? "Test delivered" : `Test failed: ${r.error ?? "no 2xx"}`); })}>
                      Test
                    </Button>
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
