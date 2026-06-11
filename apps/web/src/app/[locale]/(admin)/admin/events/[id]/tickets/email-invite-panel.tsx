"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { createEmailInvitesAction, listInvitesAction } from "../../actions";
import type { Invite } from "@prisma/client";

type Tag = "media" | "partner" | "speaker" | "staff" | "visitor";
const TAGS: Tag[] = ["visitor", "media", "partner", "speaker", "staff"];

function inviteStatus(inv: Invite): string {
  if (inv.redeemedAt) return "redeemed";
  if (inv.expiresAt && inv.expiresAt < new Date()) return "expired";
  return "pending";
}

export function EmailInvitePanel({
  locale,
  eventId,
  inviteOnlyItemIds,
}: {
  locale: string;
  eventId: string;
  inviteOnlyItemIds: number[];
}) {
  const router = useRouter();
  const [emailText, setEmailText] = useState("");
  const [tag, setTag] = useState<Tag>("visitor");
  const [expiresAt, setExpiresAt] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ sent: number; skipped: string[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [invites, setInvites] = useState<Invite[] | null>(null);

  async function send() {
    setErr(null);
    setResult(null);
    setBusy(true);

    const emails = emailText
      .split(/[\n,;]+/)
      .map((e) => e.trim())
      .filter(Boolean);

    const res = await createEmailInvitesAction(locale, eventId, {
      emails,
      itemIds: inviteOnlyItemIds,
      tag,
      expiresAt: expiresAt || null,
    });
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setResult({ sent: res.sent ?? 0, skipped: res.skipped ?? [] });
    setEmailText("");
    router.refresh();
  }

  async function loadInvites() {
    setBusy(true);
    const res = await listInvitesAction(eventId);
    setBusy(false);
    if (res.error) { setErr(res.error); return; }
    setInvites(res.invites ?? []);
  }

  if (!inviteOnlyItemIds.length) {
    return (
      <p className="mt-4 text-sm text-muted-foreground">
        Enable invite-only on at least one ticket to send email invites.
      </p>
    );
  }

  return (
    <div className="mt-6 rounded border p-4">
      <h3 className="mb-3 font-semibold">Send email invites</h3>

      <textarea
        className="mb-2 w-full rounded border px-2 py-1 text-sm font-mono"
        rows={4}
        placeholder="one@example.com, two@example.com&#10;(comma or newline separated)"
        value={emailText}
        onChange={(e) => setEmailText(e.target.value)}
      />

      <div className="mb-3 flex flex-wrap gap-2">
        <label className="flex items-center gap-1 text-sm">
          Tag:
          <select
            className="rounded border px-2 py-1 text-sm"
            value={tag}
            onChange={(e) => setTag(e.target.value as Tag)}
          >
            {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label className="flex items-center gap-1 text-sm">
          Expires:
          <input
            type="datetime-local"
            className="rounded border px-2 py-1 text-sm"
            value={expiresAt}
            onChange={(e) => setExpiresAt(e.target.value)}
          />
        </label>

        <Button size="sm" onClick={send} disabled={busy || !emailText.trim()}>
          {busy ? "Sending…" : "Send invites"}
        </Button>
      </div>

      {err && <p className="mb-2 text-sm text-destructive">{err}</p>}

      {result && (
        <p className="mb-2 text-sm text-green-700">
          Sent: {result.sent}.{" "}
          {result.skipped.length > 0 && (
            <span className="text-muted-foreground">
              Skipped (already invited): {result.skipped.join(", ")}
            </span>
          )}
        </p>
      )}

      <Button size="sm" variant="outline" onClick={loadInvites} disabled={busy}>
        Show recent invites
      </Button>

      {invites !== null && (
        <table className="mt-3 w-full text-xs">
          <thead>
            <tr className="border-b text-left text-muted-foreground">
              <th className="py-1">Email</th>
              <th>Status</th>
              <th>Expires</th>
              <th>Redeemed order</th>
            </tr>
          </thead>
          <tbody>
            {invites.length === 0 && (
              <tr><td colSpan={4} className="py-2 text-muted-foreground">No invites yet.</td></tr>
            )}
            {invites.map((inv) => (
              <tr key={inv.id} className="border-b">
                <td className="py-1">{inv.email}</td>
                <td>{inviteStatus(inv)}</td>
                <td>{inv.expiresAt ? new Date(inv.expiresAt).toLocaleString() : "—"}</td>
                <td>{inv.redeemedOrderCode ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
