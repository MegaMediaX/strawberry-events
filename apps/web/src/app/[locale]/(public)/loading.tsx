/**
 * Pending UI for the public flow.
 *
 * Every page here is `force-dynamic`, so each navigation waits on a database
 * round-trip — and with no boundary the browser simply sat on the old page
 * with no sign it had accepted the tap. A skeleton in the shape of an event
 * page (band, headline, meta, body) rather than a spinner, so the layout does
 * not jump when the real content lands.
 *
 * `aria-busy` and the sr-only line give a screen reader the same information
 * the shimmer gives everyone else; the pulse is dropped under reduced motion.
 */
export default function PublicLoading() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-8" aria-busy="true">
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div className="animate-pulse motion-reduce:animate-none">
        {/* Same ratio as EventHero's cover band (aspect-[16/6]). These used to
            disagree — 16/9 rising to 21/9 against a hero at 16/6 — so the page
            visibly jumped the moment the real content arrived, on every
            force-dynamic navigation. A skeleton that is the wrong shape is
            worse than none: it promises a layout it does not deliver. */}
        <div className="aspect-[16/6] w-full rounded-[var(--radius-xl)] bg-muted" />
        <div className="mt-6 h-9 w-3/4 rounded-md bg-muted" />
        <div className="mt-3 h-4 w-1/3 rounded-md bg-muted" />
        <div className="mt-8 grid grid-cols-1 gap-8 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-3">
            <div className="h-4 w-full rounded-md bg-muted" />
            <div className="h-4 w-11/12 rounded-md bg-muted" />
            <div className="h-4 w-4/5 rounded-md bg-muted" />
          </div>
          <div className="h-48 rounded-[var(--radius-lg)] bg-muted" />
        </div>
      </div>
    </main>
  );
}
