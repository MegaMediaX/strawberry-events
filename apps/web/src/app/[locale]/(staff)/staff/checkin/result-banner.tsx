"use client";

export type DoorResult =
  // orderCode is what lets the banner offer "Fix" on the person it is naming.
  // The moment an operator notices a misspelling is the moment they read the
  // badge that just printed — when this banner is the only thing on screen
  // showing that person.
  | { kind: "ok"; name: string; detail: string; label?: string; orderCode?: string }
  | { kind: "warn"; name: string; detail: string; label?: string; orderCode?: string }
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
export function ResultBanner({
  result,
  idle,
}: {
  result: DoorResult | null;
  /**
   * What fills the banner's space when nothing has just happened.
   *
   * That area was a dashed box reading "Scan a badge or ticket" — the largest
   * element on the screen, empty precisely when the operator has a moment to
   * look at it, while the list of people they just checked in sat below the
   * fold where it was never seen.
   */
  idle?: React.ReactNode;
}) {
  // The idle content sits OUTSIDE the live region. Inside it, with
  // aria-atomic, every return to idle assertively re-announced the entire
  // recent list — once per attendee, interrupting whatever was being said.
  if (!result) {
    return (
      <div className="flex h-[104px] flex-col overflow-hidden rounded-xl border border-border px-5 py-3">
        {idle ?? (
          <p className="flex flex-1 items-center justify-center text-[15px] text-muted-foreground">
            Scan a badge or ticket, or search by name.
          </p>
        )}
      </div>
    );
  }

  return (
    // ONE live region, always mounted for as long as there IS a result.
    // Swapping between separate live-region subtrees per state makes some
    // screen readers miss announcements entirely, which matters most when a
    // queue is moving fast and results land in quick succession.
    <div role="status" aria-live="assertive" aria-atomic="true">
      <BannerBody result={result} />
    </div>
  );
}

function BannerBody({ result }: { result: DoorResult }) {
  if (result.kind === "working") {
    return (
      <div className="flex min-h-[104px] items-center gap-4 rounded-xl border border-border bg-muted/40 px-6">
        <span className="size-5 animate-spin rounded-full border-2 border-muted-foreground border-t-transparent" aria-hidden />
        <p className="text-[19px] font-semibold">Checking in…</p>
      </div>
    );
  }

  const style = {
    // Solid fills, not 12% tints. A tint that low is functionally white on an
    // uncalibrated laptop panel viewed off-axis under venue glare — the one
    // element meant to be read pre-attentively was the least visible thing on
    // the screen.
    //
    // The words no longer rhyme either. "Checked in" / "Already in" / "Not
    // checked in" all end in the same morpheme, and the only thing separating
    // the refusal from the admission was the word "Not" — set in the smallest
    // type on screen, letter-spaced, which is precisely what destroys word
    // shape for a tired second-language reader.
    ok: {
      box: "border-green-700 bg-green-700",
      word: "text-white",
      glyph: "✓",
      label: "ENTER",
    },
    warn: {
      box: "border-amber-500 bg-amber-400",
      word: "text-amber-950",
      glyph: "!",
      label: "ALREADY IN",
    },
    err: {
      box: "border-destructive bg-destructive",
      word: "text-white",
      glyph: "✕",
      label: "STOP",
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
        {/* A reprint must not read identically to a fresh admission: the
            headline band is what gets read at a glance, and "CHECKED IN" over a
            replacement badge misstates what just happened. */}
        <p className={`text-[20px] leading-none font-bold ${style.word}`}>
          {("label" in result && result.label) || style.label}
        </p>
        <p className={`truncate text-[26px] leading-tight font-semibold ${style.word}`}>
          {result.name}
        </p>
        <p className={`mt-0.5 truncate text-[15px] ${style.word} opacity-90`}>{result.detail}</p>
      </div>

    </div>
  );
}
