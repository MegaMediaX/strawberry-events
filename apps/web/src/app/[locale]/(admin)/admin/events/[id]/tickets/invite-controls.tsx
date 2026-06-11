"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  setTicketInviteOnlyAction,
  generateInviteLinkAction,
} from "../../actions";

type Tag = "media" | "partner" | "speaker" | "staff" | "visitor";
const TAGS: Tag[] = ["visitor", "media", "partner", "speaker", "staff"];
const EXPIRY_OPTIONS: { label: string; seconds: number | undefined }[] = [
  { label: "No expiry", seconds: undefined },
  { label: "24 hours", seconds: 86_400 },
  { label: "7 days", seconds: 604_800 },
  { label: "30 days", seconds: 2_592_000 },
];

export function InviteControls({
  locale,
  eventId,
  itemId,
  isInviteOnly,
}: {
  locale: string;
  eventId: string;
  itemId: number;
  isInviteOnly: boolean;
}) {
  const router = useRouter();
  const [inviteOnly, setInviteOnly] = useState(isInviteOnly);
  const [busy, setBusy] = useState(false);
  const [tag, setTag] = useState<Tag>("visitor");
  const [expiryIdx, setExpiryIdx] = useState(0);
  const [generatedUrl, setGeneratedUrl] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function toggleInviteOnly() {
    setErr(null);
    setBusy(true);
    const next = !inviteOnly;
    const res = await setTicketInviteOnlyAction(locale, eventId, itemId, next);
    setBusy(false);
    if (res?.error) { setErr(res.error); return; }
    setInviteOnly(next);
    router.refresh();
  }

  async function genLink() {
    setErr(null);
    setGeneratedUrl(null);
    setBusy(true);
    const expiry = EXPIRY_OPTIONS[expiryIdx]?.seconds;
    const res = await generateInviteLinkAction(locale, eventId, itemId, tag, expiry);
    setBusy(false);
    if (res?.error) { setErr(res.error); return; }
    if (res?.url) setGeneratedUrl(res.url);
  }

  return (
    <div className="flex flex-col gap-2 py-1">
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={inviteOnly ? "default" : "outline"}
          onClick={toggleInviteOnly}
          disabled={busy}
        >
          {inviteOnly ? "Invite only: ON" : "Invite only: OFF"}
        </Button>

        <select
          className="rounded border px-2 py-1 text-sm"
          value={tag}
          onChange={(e) => setTag(e.target.value as Tag)}
        >
          {TAGS.map((t) => (
            <option key={t} value={t}>{t}</option>
          ))}
        </select>

        <select
          className="rounded border px-2 py-1 text-sm"
          value={expiryIdx}
          onChange={(e) => setExpiryIdx(Number(e.target.value))}
        >
          {EXPIRY_OPTIONS.map((o, i) => (
            <option key={i} value={i}>{o.label}</option>
          ))}
        </select>

        <Button size="sm" variant="outline" onClick={genLink} disabled={busy}>
          Generate invite link
        </Button>
      </div>

      {err && <p className="text-sm text-destructive">{err}</p>}

      {generatedUrl && (
        <div className="flex items-center gap-2">
          <input
            readOnly
            className="flex-1 rounded border px-2 py-1 text-xs font-mono"
            value={generatedUrl}
            onFocus={(e) => e.target.select()}
          />
          <Button
            size="sm"
            variant="outline"
            onClick={() => navigator.clipboard.writeText(generatedUrl)}
          >
            Copy
          </Button>
        </div>
      )}
    </div>
  );
}
