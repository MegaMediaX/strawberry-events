import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { centsToPrice } from "@/lib/pretix/mappers";

export function MobileCtaBar({
  locale,
  slug,
  fromCents,
  soldOut,
}: {
  locale: string;
  slug: string;
  fromCents: number | null;
  soldOut: boolean;
}) {
  return (
    // The registration form's own fixed bar already pads for the home
    // indicator; this one did not, so on an iPhone the Register button sat
    // under the gesture bar — the single conversion control on the phone
    // layout, in the one place a thumb cannot reliably reach.
    <div
      className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden"
      style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
    >
      <div className="text-sm">
        {fromCents === null
          ? "—"
          : fromCents === 0
            ? "Free"
            : `From $${centsToPrice(fromCents)}`}
      </div>
      {/* No link when there is nothing to sell: a disabled button inside a
          <Link> leaves the anchor focusable and Enter still navigates, which
          walked sold-out attendees into the registration wizard. */}
      {soldOut ? (
        <Button disabled>Sold out</Button>
      ) : (
        <Link
          href={`/${locale}/events/${slug}/register`}
          className={cn(buttonVariants())}
        >
          Register
        </Link>
      )}
    </div>
  );
}
