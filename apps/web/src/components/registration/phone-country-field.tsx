"use client";

import { Ink } from "@/components/paper/field";

const CODES = ["+961", "+971", "+966", "+20", "+1", "+44", "+33", "+49", "+90"];

export function PhoneCountryField({
  cc,
  phone,
  onCc,
  onPhone,
  id,
  required,
  describedBy,
  invalid,
}: {
  cc: string;
  phone: string;
  onCc: (v: string) => void;
  onPhone: (v: string) => void;
  id?: string;
  required?: boolean;
  describedBy?: string;
  /** The number is what the current validation error is about. */
  invalid?: boolean;
}) {
  return (
    <div className="flex gap-2">
      <select
        aria-label="Country code"
        value={cc}
        onChange={(e) => onCc(e.target.value)}
        /* Same ruled grammar as every other field, and sized by the same
           padding, so the code and the number read as one control. */
        /* w-auto, because .paper-ink sets width:100% for a field that owns its
           row — and a 100%-wide shrink-0 select eats the whole flex row and
           squeezes the number field to nothing. The utility wins here only
           because the paper layer is inside @layer components; unlayered, this
           line would have done nothing. */
        className="paper-ink w-auto shrink-0 px-2 text-sm"
      >
        {CODES.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <Ink
        className=""
        id={id}
        type="tel"
        autoComplete="tel"
        inputMode="tel"
        required={required}
        aria-required={required || undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={phone}
        onChange={(e) => onPhone(e.target.value)}
        placeholder="70 123 456"
      />
    </div>
  );
}
