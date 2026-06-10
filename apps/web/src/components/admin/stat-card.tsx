import type { LucideIcon } from "lucide-react";

export function StatCard({
  label,
  value,
  Icon,
  accent,
}: {
  label: string;
  value: string | number;
  Icon?: LucideIcon;
  accent?: "green" | "amber" | "blue" | "default";
}) {
  const accentCls = {
    green: "border-emerald-500/20 bg-emerald-500/5",
    amber: "border-amber-500/20 bg-amber-500/5",
    blue: "border-blue-500/20 bg-blue-500/5",
    default: "border-border bg-card",
  }[accent ?? "default"];

  const valueCls = {
    green: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    blue: "text-blue-600 dark:text-blue-400",
    default: "text-foreground",
  }[accent ?? "default"];

  return (
    <div className={`rounded-[var(--radius-lg)] border p-4 ${accentCls}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className={`text-2xl font-bold tabular-nums ${valueCls}`}>{value}</div>
          <div className="mt-0.5 text-xs text-muted-foreground">{label}</div>
        </div>
        {Icon && <Icon className="h-5 w-5 shrink-0 text-muted-foreground/40" />}
      </div>
    </div>
  );
}
