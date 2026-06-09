export function EventHero({
  title,
  dateLabel,
  locationLabel,
  statusLabel,
}: {
  title: string;
  dateLabel: string | null;
  locationLabel: string | null;
  statusLabel: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-xl)] p-6 sm:p-10"
      style={{ backgroundImage: "var(--gradient-hero-strong)" }}
    >
      <span className="absolute end-4 top-4 rounded-full bg-white/20 px-3 py-1 text-xs font-medium text-white backdrop-blur">
        {statusLabel}
      </span>
      <h1 className="max-w-2xl text-3xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl">
        {title}
      </h1>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-white/90">
        {dateLabel && <span>🗓 {dateLabel}</span>}
        {locationLabel && <span>📍 {locationLabel}</span>}
      </div>
    </div>
  );
}
