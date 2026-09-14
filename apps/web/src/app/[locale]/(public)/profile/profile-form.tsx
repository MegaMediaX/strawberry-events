"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { locales } from "@/lib/i18n/dir";
import { updateProfileAction } from "./actions";

/** Display name per locale. Keyed by the routing list, so a retired locale
 *  disappears from the form instead of being offered and then 404ing. */
const LOCALE_NAMES: Record<string, string> = { en: "English", ar: "العربية" };
import type { MyProfile } from "@/lib/portal/account";

export function ProfileForm({ initial }: { initial: MyProfile }) {
  const router = useRouter();
  const [p, setP] = useState({
    phoneCC: initial.phoneCC ?? "+961",
    phone: initial.phone ?? "",
    preferredLocale: initial.preferredLocale === "ar" ? "ar" : "en",
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function save() {
    setBusy(true);
    setMsg(null);
    const res = await updateProfileAction({
      phone: p.phone || null,
      phoneCC: p.phoneCC || null,
      preferredLocale: p.preferredLocale,
    });
    setBusy(false);
    setMsg(
      res.ok
        ? { ok: true, text: "Profile saved." }
        : { ok: false, text: res.error ?? "We couldn't save your profile. Please try again." },
    );
    if (res.ok) router.refresh();
  }

  const sel = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";

  return (
    <div className="mt-6 flex flex-col gap-4">
      <div className="grid grid-cols-[100px_1fr] gap-3">
        <div>
          <Label htmlFor="profile-phone-cc">Country code</Label>
          <Input
            id="profile-phone-cc"
            autoComplete="tel-country-code"
            value={p.phoneCC}
            onChange={(e) => setP({ ...p, phoneCC: e.target.value })}
          />
        </div>
        <div>
          <Label htmlFor="profile-phone">Phone</Label>
          <Input
            id="profile-phone"
            type="tel"
            autoComplete="tel-national"
            value={p.phone}
            onChange={(e) => setP({ ...p, phone: e.target.value })}
          />
        </div>
      </div>
      {locales.length > 1 && (
        <div>
          <Label htmlFor="preferred-locale">Preferred language</Label>
          <select
            id="preferred-locale"
            className={sel}
            value={p.preferredLocale}
            onChange={(e) => setP({ ...p, preferredLocale: e.target.value })}
          >
            {locales.map((l) => (
              <option key={l} value={l}>
                {LOCALE_NAMES[l] ?? l}
              </option>
            ))}
          </select>
        </div>
      )}
      {msg && (
        <p
          role="status"
          className={`text-sm ${msg.ok ? "text-muted-foreground" : "font-medium text-destructive"}`}
        >
          {msg.text}
        </p>
      )}
      <div>
        <Button type="button" onClick={save} disabled={busy}>{busy ? "Saving…" : "Save profile"}</Button>
      </div>
    </div>
  );
}
