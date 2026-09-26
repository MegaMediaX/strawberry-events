import { posterBox } from "@/components/public/poster";

/**
 * Pending UI for the public flow.
 *
 * Every page here is `force-dynamic`, so each navigation waits on a database
 * round-trip — and with no boundary the browser simply sat on the old page
 * with no sign it had accepted the tap. A skeleton in the shape of an event
 * page (poster, headline, meta, body) rather than a spinner, so the layout does
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
        {/* The poster box, from the SAME function the real header uses, at the
            16/9 shape an unsized poster gets. This skeleton used to read the
            full-bleed 16/6 frame's token; when the poster moved into the column
            at its own shape, a skeleton left on the old token would have shown
            one layout and handed over to another — a skeleton that is the
            wrong shape is worse than none. */}
        <div className="mx-auto max-w-5xl px-4 pt-6 sm:px-6 sm:pt-8">
          <div className="bg-muted" style={posterBox(16, 9)} />
          <div className="mt-6 flex flex-col gap-3 sm:mt-8">
            <div className="h-5 w-24 bg-muted" />
            <div className="h-12 w-3/4 bg-muted" />
            <div className="h-4 w-1/2 bg-muted" />
          </div>
        </div>
        <div className="mx-auto mt-10 grid max-w-5xl grid-cols-1 gap-8 px-4 sm:px-6 lg:grid-cols-[1fr_320px]">
          <div className="flex flex-col gap-3">
            <div className="h-4 w-full bg-muted" />
            <div className="h-4 w-11/12 bg-muted" />
            <div className="h-4 w-4/5 bg-muted" />
          </div>
          <div className="h-48 bg-muted" />
        </div>
      </div>
    </main>
  );
}
