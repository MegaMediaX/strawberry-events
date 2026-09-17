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
    <main aria-busy="true">
      <p className="sr-only" role="status">
        Loading…
      </p>
      <div className="animate-pulse motion-reduce:animate-none">
        {/* The house frame, read from the same token the hero and the index
            plate read (--aspect-cinema). These used to disagree — 16/9 rising
            to 21/9 against a hero at 16/6 — so the page visibly jumped the
            moment the real content arrived, on every force-dynamic
            navigation. A skeleton that is the wrong shape is worse than none:
            it promises a layout it does not deliver. Sharing the token means
            it cannot drift back. */}
        {/* Full-bleed and unrounded, because the hero is: the band it stands
            in for now runs edge to edge, and the title card stands ON it
            rather than below it. A skeleton that is the wrong shape is worse
            than none — it promises a layout it does not deliver. */}
        <div className="aspect-[var(--aspect-cinema)] min-h-60 w-full bg-muted" />
        <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_320px]">
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
