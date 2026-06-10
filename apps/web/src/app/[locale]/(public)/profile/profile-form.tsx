"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { updateProfileAction } from "./actions";
import type { MyProfile } from "@/lib/portal/account";

export function ProfileForm({ initial }: { initial: MyProfile }) {
  const router = useRouter();
  const [p, setP] = useState({
    phoneCC: initial.phoneCC ?? "+961",
    phone: initial.phone ?? "",
    preferredLocale: initial.preferredLocale === "ar" ? "ar" : "en",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await updateProfileAction({
      phone: p.phone || null,
      phoneCC: p.phoneCC || null,
      preferredLocale: p.preferredLocale,
    });
    setBusy(false);
    setMsg(res.ok ? "Profile saved." : res.error ?? "Failed");
    if (res.ok) router.refresh();
  }

  const sel = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-[100px_1fr] gap-3">
        <div>
          <Label>Code</Label>
          <Input value={p.phoneCC} onChange={(e) => setP({ ...p, phoneCC: e.target.value })} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input value={p.phone} onChange={(e) => setP({ ...p, phone: e.target.value })} />
        </div>
      </div>
      <div>
        <Label>Preferred language</Label>
        <select className={sel} value={p.preferredLocale} onChange={(e) => setP({ ...p, preferredLocale: e.target.value })}>
          <option value="en">English</option>
          <option value="ar">العربية</option>
        </select>
      </div>
      {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
      <div>
        <Button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
      </div>
    </div>
  );
}
