"use client";

import { Input } from "@/components/ui/input";

const CODES = ["+961", "+971", "+966", "+20", "+1", "+44", "+33", "+49", "+90"];

export function PhoneCountryField({
  cc,
  phone,
  onCc,
  onPhone,
  id,
  required,
  describedBy,
}: {
  cc: string;
  phone: string;
  onCc: (v: string) => void;
  onPhone: (v: string) => void;
  id?: string;
  required?: boolean;
  describedBy?: string;
}) {
  return (
    <div className="flex gap-2">
      <select
        aria-label="Country code"
        value={cc}
        onChange={(e) => onCc(e.target.value)}
        /* h-10 keeps the code select the same height as the number field
           beside it; they read as one control only when they line up. */
        className="h-10 shrink-0 rounded-lg border border-input bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 outline-none"
      >
        {CODES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Input
        id={id}
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        required={required}
        aria-required={required || undefined}
        aria-describedby={describedBy}
        value={phone}
        onChange={(e) => onPhone(e.target.value)}
        placeholder="70 123 456"
      />
    </div>
  );
}
