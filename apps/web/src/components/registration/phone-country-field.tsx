"use client";

import { Input } from "@/components/ui/input";

const CODES = ["+961", "+971", "+966", "+20", "+1", "+44", "+33", "+49", "+90"];

export function PhoneCountryField({
  cc,
  phone,
  onCc,
  onPhone,
}: {
  cc: string;
  phone: string;
  onCc: (v: string) => void;
  onPhone: (v: string) => void;
}) {
  return (
    <div className="flex gap-2">
      <select
        aria-label="Country code"
        value={cc}
        onChange={(e) => onCc(e.target.value)}
        className="rounded-md border border-input bg-background px-2 py-2 text-sm"
      >
        {CODES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Input
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        value={phone}
        onChange={(e) => onPhone(e.target.value)}
        placeholder="70 123 456"
      />
    </div>
  );
}
