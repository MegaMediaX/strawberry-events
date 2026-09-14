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
    <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between border-t border-border bg-background/90 px-4 py-3 backdrop-blur lg:hidden">
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
