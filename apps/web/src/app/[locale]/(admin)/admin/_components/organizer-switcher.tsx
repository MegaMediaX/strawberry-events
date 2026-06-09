"use client";

import { useTransition } from "react";
import { switchOrgAction } from "../org-actions";

interface OrgOption {
  id: string;
  name: string;
}

export function OrganizerSwitcher({
  orgs,
  activeOrgId,
}: {
  orgs: OrgOption[];
  activeOrgId: string | null;
}) {
  const [pending, startTransition] = useTransition();

  return (
    <select
      aria-label="Active organization"
      defaultValue={activeOrgId ?? ""}
      disabled={pending}
      onChange={(e) =>
        startTransition(() => {
          void switchOrgAction(e.target.value);
        })
      }
      className="rounded-md border bg-background px-2 py-1 text-sm"
    >
      {orgs.map((o) => (
        <option key={o.id} value={o.id}>
          {o.name}
        </option>
      ))}
    </select>
  );
}
