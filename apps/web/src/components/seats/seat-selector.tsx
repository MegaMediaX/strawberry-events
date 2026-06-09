"use client";

import { useState } from "react";

export interface SeatNode {
  id: string;
  label: string;
  state: string;
}
export interface RowNode { id: string; label: string; seats: SeatNode[] }
export interface SectionNode { id: string; name: string; rows: RowNode[] }

const COLOR: Record<string, string> = {
  available: "var(--brand-success)",
  accessible: "var(--accent)",
  temporarily_held: "var(--brand-amber)",
  sold_or_reserved: "var(--muted-foreground)",
  blocked: "var(--border)",
};

function selectable(state: string) {
  return state === "available" || state === "accessible";
}

export function SeatSelector({
  sections,
  onChange,
}: {
  sections: SectionNode[];
  onChange: (seatIds: string[]) => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);

  function toggle(seat: SeatNode) {
    if (!selectable(seat.state)) return;
    const next = selected.includes(seat.id)
      ? selected.filter((id) => id !== seat.id)
      : [...selected, seat.id];
    setSelected(next);
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4">
      {sections.map((sec) => (
        <div key={sec.id}>
          <div className="mb-2 text-sm font-medium">{sec.name}</div>
          <div className="flex flex-col gap-1">
            {sec.rows.map((row) => (
              <div key={row.id} className="flex items-center gap-1">
                <span className="w-6 text-xs text-muted-foreground">{row.label}</span>
                {row.seats.map((seat) => {
                  const isSel = selected.includes(seat.id);
                  return (
                    <button
                      key={seat.id}
                      type="button"
                      onClick={() => toggle(seat)}
                      disabled={!selectable(seat.state)}
                      aria-pressed={isSel}
                      title={`${row.label}${seat.label} · ${seat.state}`}
                      className="size-6 rounded text-[10px] disabled:cursor-not-allowed"
                      style={{
                        background: isSel ? "var(--primary)" : COLOR[seat.state],
                        color: "#fff",
                        opacity: selectable(seat.state) || isSel ? 1 : 0.5,
                      }}
                    >
                      {seat.label}
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      ))}
      <p className="text-xs text-muted-foreground">
        Selected seats are held for 10 minutes once you submit. Green = available, amber =
        held, grey = taken.
      </p>
    </div>
  );
}
