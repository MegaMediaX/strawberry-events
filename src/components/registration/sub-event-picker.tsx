"use client";

import { rangesOverlap } from "@/lib/events/conflicts";
import { ExpandableText } from "@/components/public/expandable-text";
import { dateStamp, timeRange } from "./programme";

export interface SubEventItem {
  id: string;
  titleEn: string;
  titleAr: string | null;
  category: string;
  /** Organiser-written detail (speakers, session breakdown). Often null. */
  descriptionEn: string | null;
  location: string | null;
  dateFrom: string;
  dateTo: string;
  priceCents: number;
  maxAttendees: number | null;
  ticketsPerUser: number;
  pretixItemId: number | null;
  /** Live remaining seats from pretix quota (null = unknown / unlimited). */
  remaining: number | null;
}

export interface SubEventSelection {
  itemId: number;
  quantity: number;
}

interface Props {
  locale: string;
  subEvents: SubEventItem[];
  /** Already-selected sub-event entries (controlled). */
  selected: SubEventSelection[];
  /** Max total tickets still available across all selection (ticketsPerUserTotal minus main). */
  totalAllowance: number;
  onChange: (next: SubEventSelection[]) => void;
}

function groupBy<T>(arr: T[], key: (v: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const item of arr) {
    const k = key(item);
    const group = map.get(k) ?? [];
    group.push(item);
    map.set(k, group);
  }
  return map;
}

export function SubEventPicker({ subEvents, selected, totalAllowance, onChange }: Props) {
  function qtyFor(itemId: number): number {
    return selected.find((s) => s.itemId === itemId)?.quantity ?? 0;
  }

  function setQty(itemId: number, qty: number) {
    const without = selected.filter((s) => s.itemId !== itemId);
    if (qty <= 0) {
      onChange(without);
    } else {
      onChange([...without, { itemId, quantity: qty }]);
    }
  }

  /** Sub-events currently chosen (for conflict detection). */
  const selectedItems = subEvents.filter(
    (se) => se.pretixItemId !== null && qtyFor(se.pretixItemId) > 0,
  );

  const totalSelected = selected.reduce((sum, s) => sum + s.quantity, 0);
  const grouped = groupBy(subEvents, (se) => se.category);

  if (subEvents.length === 0) {
    return <p className="text-sm text-muted-foreground">No sessions available.</p>;
  }

  return (
    <div className="flex flex-col gap-8">
      <p
        className="text-[13px] font-medium tracking-[0.04em] text-muted-foreground tabular-nums"
        aria-live="polite"
      >
        {totalSelected} of {totalAllowance} selected
      </p>

      {[...grouped.entries()].map(([category, items]) => (
        <section key={category}>
          {/* The count comes from the group itself, so "AI FOR HR · 3 PARTS"
              is derived rather than hardcoded for this one event. */}
          <h3 className="flex items-baseline gap-2 border-b border-border pb-2 text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            <span>{category}</span>
            <span aria-hidden="true">·</span>
            <span>
              {items.length} {items.length === 1 ? "part" : "parts"}
            </span>
          </h3>

          <ul>
            {items.map((se) => {
              if (se.pretixItemId === null) return null;
              const itemId = se.pretixItemId;
              const qty = qtyFor(itemId);
              const on = qty > 0;
              const { day, month } = dateStamp(se.dateFrom);

              // Conflict: does this session overlap any currently selected one?
              const othersSelected = selectedItems.filter((s) => s.id !== se.id);
              const conflicts = othersSelected.filter((other) => rangesOverlap(se, other));
              const hasConflict = qty === 0 && conflicts.length > 0;
              const conflictTitle = conflicts[0]?.titleEn;

              const atPerItemCap = qty >= se.ticketsPerUser;
              const atTotalCap = totalSelected >= totalAllowance && qty === 0;
              const soldOut = se.remaining !== null && se.remaining <= 0;
              const disabled = hasConflict || soldOut || atTotalCap;
              // A per-item cap of 1 is a yes/no choice — a stepper that can only
              // ever read 0 or 1 misrepresents the interaction.
              const isToggle = se.ticketsPerUser === 1;

              return (
                <li
                  key={se.id}
                  className={[
                    "relative grid grid-cols-[56px_1fr_auto] items-start gap-3 border-b border-border px-4 py-5 last:border-b-0",
                    "transition-[background-color,box-shadow] duration-200",
                    on ? "bg-card shadow-[var(--shadow-1)]" : "",
                    disabled ? "opacity-45" : "",
                  ]
                    .join(" ")
                    .trim()}
                >
                  <span
                    aria-hidden="true"
                    className="absolute inset-y-0 start-0 w-[3px] origin-top bg-primary transition-transform duration-300 ease-out motion-reduce:transition-none"
                    style={{ transform: on ? "scaleY(1)" : "scaleY(0)" }}
                  />

                  {/* Date stamp bleeds into the gutter so the numeral reads as a
                      stamp on the page rather than a cell in a table. */}
                  <span className="-ms-3 flex flex-col items-start">
                    <span
                      className={[
                        "font-heading text-[36px] leading-[0.85] tracking-[-0.03em] tabular-nums transition-colors duration-200",
                        on ? "text-foreground" : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {day}
                    </span>
                    <span className="text-[10px] font-semibold tracking-[0.12em] text-muted-foreground">
                      {month}
                    </span>
                  </span>

                  <span className="min-w-0">
                    <span className="block font-heading text-[22px] leading-[1.15] tracking-[-0.01em]">
                      {se.titleEn}
                    </span>
                    <span className="mt-1 block text-[13px] font-medium tracking-[0.04em] text-muted-foreground tabular-nums">
                      {timeRange(se.dateFrom, se.dateTo)}
                      {se.location && (
                        <>
                          <span aria-hidden="true"> · </span>
                          <span className="uppercase">{se.location}</span>
                        </>
                      )}
                    </span>
                    {se.descriptionEn && (
                      <ExpandableText
                        className="mt-2"
                        text={se.descriptionEn}
                        lines={2}
                        textClassName="text-[13px] leading-[1.5] text-muted-foreground"
                      />
                    )}
                    {soldOut && (
                      <span className="mt-1 block text-xs text-destructive">Sold out</span>
                    )}
                    {hasConflict && (
                      <span className="mt-1 block text-xs text-destructive">
                        {`Overlaps with "${conflictTitle}"`}
                      </span>
                    )}
                    {atTotalCap && !hasConflict && !soldOut && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        Selection limit reached
                      </span>
                    )}
                  </span>

                  {/* 44px targets. These were raw 28px buttons with no
                      accessible name and no live count. */}
                  {isToggle ? (
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${se.titleEn}, ${timeRange(se.dateFrom, se.dateTo)}`}
                      disabled={disabled && !on}
                      onClick={() => setQty(itemId, on ? 0 : 1)}
                      className={[
                        "flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-lg transition-colors",
                        "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                        "disabled:pointer-events-none disabled:opacity-40",
                        on
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background",
                      ].join(" ")}
                    >
                      <span aria-hidden="true">{on ? "✓" : "+"}</span>
                    </button>
                  ) : (
                    <span className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-label={`Remove one ${se.titleEn}`}
                        disabled={qty === 0}
                        onClick={() => setQty(itemId, qty - 1)}
                        className="flex size-11 items-center justify-center rounded-lg border border-border outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
                      >
                        <span aria-hidden="true">−</span>
                      </button>
                      <span
                        className="w-6 text-center text-sm tabular-nums"
                        aria-live="polite"
                        aria-label={`${qty} × ${se.titleEn}`}
                      >
                        {qty}
                      </span>
                      <button
                        type="button"
                        aria-label={`Add one ${se.titleEn}`}
                        disabled={disabled || atPerItemCap}
                        onClick={() => setQty(itemId, qty + 1)}
                        className="flex size-11 items-center justify-center rounded-lg border border-border outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
                      >
                        <span aria-hidden="true">+</span>
                      </button>
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
