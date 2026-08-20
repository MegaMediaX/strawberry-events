"use client";

export type DoorResult =
  | { kind: "ok"; name: string; detail: string }
  | { kind: "warn"; name: string; detail: string }
  | { kind: "err"; name: string; detail: string }
  | { kind: "working" };

/**
 * The one thing a staff member actually looks at.
 *
 * At a door you are standing, holding a badge, with someone in front of you and
 * a queue behind. The previous UI reported outcomes in a 14px line of coloured
 * text, which is unreadable at arm's length and easy to miss entirely when the
 * next person is already stepping forward.
 *
 * So: full width, one colour per outcome, name in large type, and the reason
 * underneath. Colour is never the only signal — each state also carries a word
 * and a distinct glyph, so it survives a colour-blind operator and a washed-out
 * screen in daylight.
 */
export function ResultBanner({ result }: { result: DoorResult | null }) {
  return (
    // ONE live region, always mounted. Swapping between separate live-region
    // subtrees per state makes some screen readers miss announcements entirely,
    // which matters most when a queue is moving fast and results land in quick
    // succession.
    <div role="status" aria-live="assertive" aria-atomic="true">
      <BannerBody result={result} />
    </div>
  );
}

function BannerBody({ result }: { result: DoorResult | null }) {
  if (!result) {
    return (
      <div className="flex min-h-[104px] items-center justify-center rounded-xl border border-dashed border-border px-6">
        <p className="text-[15px] text-muted-foreground">
          Scan a badge or ticket, or search by name.
        </p>
      </div>
    );
  }

  if (result.kind === "working") {
    return (
      <div className="flex min-h-[104px] items-center gap-4 rounded-xl border border-border bg-muted/40 px-6">
        <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden />
        <p className="text-[19px] font-semibold">Checking in…</p>
      </div>
    );
  }

  const style = {
    ok: {
      box: "border-green-600/40 bg-green-600/12",
      word: "text-green-700 dark:text-green-400",
      glyph: "✓",
      label: "Checked in",
    },
    warn: {
      box: "border-amber-500/45 bg-amber-500/12",
      word: "text-amber-700 dark:text-amber-400",
      glyph: "!",
      label: "Already in",
    },
    err: {
      box: "border-destructive/45 bg-destructive/12",
      word: "text-destructive",
      glyph: "✕",
      label: "Not checked in",
    },
  }[result.kind];

  return (
    <div className={`flex min-h-[104px] items-center gap-4 rounded-xl border px-6 py-4 ${style.box}`}>
      <span
        aria-hidden
        className={`flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-[22px] font-bold ${style.word}`}
      >
        {style.glyph}
      </span>
      <div className="min-w-0">
        <p className={`text-[13px] font-bold tracking-[0.1em] uppercase ${style.word}`}>
          {style.label}
        </p>
        <p className="truncate text-[26px] leading-tight font-semibold text-foreground">
          {result.name}
        </p>
        <p className="mt-0.5 truncate text-[14px] text-muted-foreground">{result.detail}</p>
      </div>
    </div>
  );
}
