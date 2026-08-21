"use client";

import { useState } from "react";

import { buildVCard, vCardFilename, type VCardInput } from "@/lib/checkin/vcard";

/**
 * Downloads the attendee as a .vcf the phone can import.
 *
 * Built and downloaded entirely client-side from props already rendered on the
 * page — no request, so it works on a venue wifi that has given up, which is
 * the condition it will most often be used in.
 */
export function SaveContactButton({ contact }: { contact: VCardInput }) {
  const [saved, setSaved] = useState(false);

  function save() {
    const blob = new Blob([buildVCard(contact)], { type: "text/vcard;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = vCardFilename(contact.fullName);
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Revoke on the next tick, not immediately: Safari has not finished
    // reading the blob when click() returns, and revoking early gives an
    // empty file.
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <button
      type="button"
      onClick={save}
      className="mt-6 inline-flex min-h-11 w-full items-center justify-center rounded-xl bg-primary px-5 text-[14px] font-semibold tracking-[0.02em] text-primary-foreground transition-opacity outline-none hover:opacity-90 focus-visible:ring-3 focus-visible:ring-ring/50"
    >
      {saved ? "Saved to your downloads" : "Save contact"}
    </button>
  );
}
