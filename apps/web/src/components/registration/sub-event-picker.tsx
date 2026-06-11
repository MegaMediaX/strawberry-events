"use client";

import { rangesOverlap } from "@/lib/events/conflicts";

export interface SubEventItem {
  id: string;
  titleEn: string;
  titleAr: string | null;
  category: string;
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

function fmt(iso: string, locale: string): string {
  try {
    return new Date(iso).toLocaleString(locale === "ar" ? "ar-LB" : "en-GB", {
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
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

export function SubEventPicker({ locale, subEvents, selected, totalAllowance, onChange }: Props) {
  const isRtl = locale === "ar";

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

  return (
    <div className="flex flex-col gap-6" dir={isRtl ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between text-sm text-muted-foreground">
        <span>{isRtl ? "اختر الجلسات" : "Choose sessions"}</span>
        <span>
          {totalSelected}/{totalAllowance}{" "}
          {isRtl ? "تذاكر مختارة" : "tickets selected"}
        </span>
      </div>

      {[...grouped.entries()].map(([category, items]) => (
        <div key={category}>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {category}
          </h3>
          <div className="flex flex-col gap-2">
            {items.map((se) => {
              if (se.pretixItemId === null) return null;
              const itemId = se.pretixItemId;
              const qty = qtyFor(itemId);
              const title =
                isRtl && se.titleAr ? se.titleAr : se.titleEn;

              // Conflict: does this session overlap any currently selected one (excluding itself)?
              const othersSelected = selectedItems.filter((s) => s.id !== se.id);
              const conflicts = othersSelected.filter((other) => rangesOverlap(se, other));
              const hasConflict = qty === 0 && conflicts.length > 0;
              const conflictTitle =
                isRtl && conflicts[0]?.titleAr
                  ? conflicts[0].titleAr
                  : conflicts[0]?.titleEn;

              const atPerItemCap = qty >= se.ticketsPerUser;
              const atTotalCap = totalSelected >= totalAllowance && qty === 0;
              const soldOut = se.remaining !== null && se.remaining <= 0;
              const disabled = hasConflict || soldOut || atTotalCap;

              return (
                <div
                  key={se.id}
                  className={[
                    "flex items-start justify-between rounded-[var(--radius-lg)] border border-border p-3 gap-3",
                    disabled ? "opacity-50" : "",
                  ]
                    .join(" ")
                    .trim()}
                >
                  <div className="min-w-0 flex-1">
                    <div className="font-medium leading-snug">{title}</div>
                    {se.location && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {se.location}
                      </div>
                    )}
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {fmt(se.dateFrom, locale)} — {fmt(se.dateTo, locale)}
                    </div>
                    {se.remaining !== null && se.remaining > 0 && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {se.remaining}{" "}
                        {isRtl ? "مقعد متبقي" : "seats left"}
                      </div>
                    )}
                    {soldOut && (
                      <div className="mt-0.5 text-xs text-destructive">
                        {isRtl ? "نفذت التذاكر" : "Sold out"}
                      </div>
                    )}
                    {hasConflict && (
                      <div className="mt-0.5 text-xs text-destructive">
                        {isRtl
                          ? `تعارض مع "${conflictTitle}"`
                          : `Overlaps with "${conflictTitle}"`}
                      </div>
                    )}
                    {atTotalCap && !hasConflict && !soldOut && (
                      <div className="mt-0.5 text-xs text-muted-foreground">
                        {isRtl ? "وصلت للحد الأقصى" : "Selection limit reached"}
                      </div>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <div className="text-sm font-medium">
                      {se.priceCents === 0
                        ? isRtl ? "مجاني" : "Free"
                        : `$${(se.priceCents / 100).toFixed(2)}`}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={qty === 0}
                        onClick={() => setQty(itemId, qty - 1)}
                        className="flex size-7 items-center justify-center rounded-md border border-border text-sm disabled:opacity-40"
                      >
                        −
                      </button>
                      <span className="w-5 text-center text-sm">{qty}</span>
                      <button
                        type="button"
                        disabled={disabled || atPerItemCap}
                        onClick={() => setQty(itemId, qty + 1)}
                        className="flex size-7 items-center justify-center rounded-md border border-border text-sm disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      ))}

      {subEvents.length === 0 && (
        <p className="text-sm text-muted-foreground">
          {isRtl ? "لا توجد جلسات متاحة." : "No sessions available."}
        </p>
      )}
    </div>
  );
}
