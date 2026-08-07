/**
 * Shown when a public order-code page is throttled. Deliberately says nothing
 * about whether the requested order exists — it renders before the lookup, so a
 * scraper learns only that it is going too fast.
 */
export function TooManyRequests() {
  return (
    <main className="mx-auto max-w-md px-4 py-12 text-center">
      <h1 className="text-2xl font-bold">Too many requests</h1>
      <p className="mt-2 text-muted-foreground">
        You&apos;ve opened this page too many times in a short period. Please
        wait a minute and try again.
      </p>
    </main>
  );
}
