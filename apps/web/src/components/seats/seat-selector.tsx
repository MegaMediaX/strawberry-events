"use client";

export interface SeatNode {
  id: string;
  label: string;
  state: string;
}
export interface RowNode { id: string; label: string; seats: SeatNode[] }
export interface SectionNode { id: string; name: string; rows: RowNode[] }

/**
 * Seat state carries three things, not one.
 *
 * Colour alone used to say whether a seat was free, held, taken or step-free,
 * explained by a sentence that listed three of the five states and omitted the
 * accessible one. Each state now also has a NAME (announced, and in the
 * legend) and a SHAPE cue (dashed edge, struck-through label), so the map is
 * readable without colour vision and by a screen reader.
 */
const SEAT_STATES: Record<
  string,
  { color: string; label: string; legend: string; selectable: boolean }
> = {
  available: {
    color: "var(--brand-success)",
    label: "available",
    legend: "Available",
    selectable: true,
  },
  accessible: {
    color: "var(--accent)",
    label: "step-free access, available",
    legend: "Step-free (dashed edge)",
    selectable: true,
  },
  temporarily_held: {
    color: "var(--brand-amber)",
    label: "held by someone else",
    legend: "Held by someone else",
    selectable: false,
  },
  sold_or_reserved: {
    color: "var(--muted)",
    label: "taken",
    legend: "Taken (struck through)",
    selectable: false,
  },
  blocked: {
    color: "var(--muted)",
    label: "not for sale",
    legend: "Not for sale (struck through)",
    selectable: false,
  },
};

const FALLBACK_STATE = {
  color: "var(--muted)",
  label: "unavailable",
  legend: "Unavailable",
  selectable: false,
};

function stateOf(state: string) {
  return SEAT_STATES[state] ?? FALLBACK_STATE;
}

/**
 * Client-side selectability, from the state string alone.
 *
 * Narrower than `canSelect` in lib/seats/state.ts, which can also release an
 * expired hold — that needs `heldUntil`, which the page's projection does not
 * send to the browser. The server remains the authority; this only decides
 * what the map offers.
 */
export function isSeatSelectable(state: string): boolean {
  return stateOf(state).selectable;
}

export function SeatSelector({
  sections,
  value,
  onChange,
  required = 0,
}: {
  sections: SectionNode[];
  /**
   * The seats currently chosen, owned by the caller.
   *
   * Controlled on purpose. A second copy lived here, and this component
   * unmounts whenever the wizard leaves the Tickets step — so coming Back from
   * Confirm rendered an empty map and a "0 chosen" count over a selection the
   * form still held and still validated against.
   */
  value: string[];
  onChange: (seatIds: string[]) => void;
  /**
   * How many seats this order needs — one per ticket. Zero means no ticket has
   * been chosen yet. Without it the map accepted any number of seats and the
   * mismatch only surfaced later, as "select a seat for each ticket (3/2)".
   */
  required?: number;
}) {
  const atCap = required > 0 && value.length >= required;

  function toggle(seat: SeatNode) {
    if (!isSeatSelectable(seat.state)) return;
    const isSelected = value.includes(seat.id);
    if (!isSelected && atCap) return;
    onChange(
      isSelected ? value.filter((id) => id !== seat.id) : [...value, seat.id],
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm font-medium" aria-live="polite">
        {required === 0
          ? "Choose your tickets first — then pick a seat for each one."
          : `Select ${required} ${required === 1 ? "seat" : "seats"} — ${value.length} chosen.`}
      </p>

      {sections.map((sec) => (
        <div key={sec.id}>
          <div className="mb-2 text-sm font-medium">{sec.name}</div>
          {/* The grid scrolls rather than shrinking its targets: a wide room
              used to be fitted by making every seat 24px square and touching
              its neighbours, which is under any usable target size. */}
          <div className="-mx-1 overflow-x-auto px-1 pb-1">
            <div className="flex w-max flex-col gap-1.5">
              {sec.rows.map((row) => (
                <div key={row.id} className="flex items-center gap-1.5">
                  <span className="w-6 shrink-0 text-xs text-muted-foreground">
                    {row.label}
                  </span>
                  {row.seats.map((seat) => {
                    const meta = stateOf(seat.state);
                    const isSel = value.includes(seat.id);
                    const blockedByCap = !isSel && atCap && meta.selectable;
                    const disabled = !meta.selectable || blockedByCap;
                    return (
                      <button
                        key={seat.id}
                        type="button"
                        onClick={() => toggle(seat)}
                        disabled={disabled}
                        aria-pressed={isSel}
                        // The only name this control had was a `title`, which
                        // most screen readers never announce — the map read as
                        // a run of unlabelled buttons.
                        aria-label={`Row ${row.label} seat ${seat.label}, ${
                          isSel ? "selected" : meta.label
                        }`}
                        className={[
                          "flex size-9 shrink-0 items-center justify-center rounded text-[11px] font-medium",
                          "outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                          "disabled:cursor-not-allowed",
                          seat.state === "accessible" && !isSel
                            ? "border-2 border-dashed border-foreground/50"
                            : "",
                          !meta.selectable ? "text-muted-foreground line-through" : "",
                          isSel ? "text-primary-foreground" : "",
                          blockedByCap ? "opacity-50" : "",
                        ]
                          .filter(Boolean)
                          .join(" ")}
                        style={{
                          background: isSel ? "var(--primary)" : meta.color,
                          // White on the light border grey failed contrast at
                          // every size; unavailable seats now take the muted
                          // pair, which is defined against it.
                          color: isSel
                            ? undefined
                            : meta.selectable
                              ? "#ffffff"
                              : undefined,
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
        </div>
      ))}

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {Object.entries(SEAT_STATES).map(([key, meta]) => (
          <li key={key} className="flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className={[
                "inline-block size-3 rounded-[3px]",
                key === "accessible" ? "border-2 border-dashed border-foreground/50" : "",
              ].join(" ")}
              style={{ background: meta.color }}
            />
            {meta.legend}
          </li>
        ))}
      </ul>
      <p className="text-xs text-muted-foreground">
        Selected seats are held for 10 minutes once you submit.
      </p>
    </div>
  );
}
