import Link from "next/link";
import { Button } from "@/components/ui/button";
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
      <Link href={`/${locale}/events/${slug}/register`}>
        <Button disabled={soldOut}>{soldOut ? "Sold out" : "Register"}</Button>
      </Link>
    </div>
  );
}
