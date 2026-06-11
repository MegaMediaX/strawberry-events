export function EventsHeroBanner({ locale }: { locale: string }) {
  return (
    <div
      className="relative overflow-hidden rounded-[var(--radius-xl)] px-6 py-12 sm:px-10 sm:py-16"
      style={{ backgroundImage: "var(--gradient-hero-strong)" }}
    >
      <div className="relative z-10 max-w-xl">
        <p className="text-sm font-medium uppercase tracking-widest text-white/70">
          {locale === "ar" ? "الفعاليات" : "Events"}
        </p>
        <h1 className="mt-2 text-4xl font-extrabold leading-[1.05] tracking-tight text-white sm:text-5xl">
          {locale === "ar" ? "اكتشف الفعاليات" : "Discover events"}
        </h1>
        <p className="mt-3 text-base text-white/80">
          {locale === "ar"
            ? "تصفح الفعاليات المتاحة وسجّل مكانك."
            : "Browse what's on and secure your spot."}
        </p>
      </div>
    </div>
  );
}
