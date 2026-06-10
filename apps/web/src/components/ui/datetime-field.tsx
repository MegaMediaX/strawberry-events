"use client";

import { Input } from "@/components/ui/input";
import { isoToLocalInput, localInputToIso, formatUk } from "@/lib/datetime/uk";

/**
 * Controlled date-time picker for the admin event form. Uses the native
 * datetime-local calendar (zero deps, accessible) and shows an explicit UK
 * echo (dd/mm/yyyy hh:mm) so the format is unambiguous regardless of OS locale.
 * Emits an ISO-8601 string (UTC marker) for pretix, or null when cleared.
 */
export function DateTimeField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (iso: string | null) => void;
}) {
  const local = isoToLocalInput(value);
  const uk = formatUk(value);

  return (
    <div className="flex flex-col gap-1">
      <Input
        type="datetime-local"
        value={local}
        onChange={(e) => onChange(localInputToIso(e.target.value))}
      />
      <p className="text-xs text-muted-foreground">
        {uk ? `Selected: ${uk}` : "Format: dd/mm/yyyy hh:mm (24-hour)"}
      </p>
    </div>
  );
}
