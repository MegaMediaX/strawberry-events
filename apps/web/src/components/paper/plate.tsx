import type { CSSProperties, HTMLAttributes, ReactNode } from "react";

/**
 * A die-cut sheet.
 *
 * The public flow's replacement for the card. Square corners and a printed
 * hairline edge rather than a radius and a shadow — see the PAPER section of
 * app/globals.css for why none of this layer uses either.
 */
export function Plate({
  children,
  className = "",
  ...rest
}: { children: ReactNode; className?: string } & HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`paper-plate ${className}`} {...rest}>
      {children}
    </div>
  );
}

/**
 * A ticket: a body and a stub, torn apart along a perforation.
 *
 * The seam is formed by two plates meeting rather than a line ruled across one
 * plate at a measured offset, so it lands wherever the body's content actually
 * ends — which varies, because an issued ticket carries a QR and a pending one
 * does not. `notchRadius` overrides --perf-r for the pair; both halves read it,
 * so they are set together here and cannot drift apart.
 */
export function Ticket({
  children,
  className = "",
  notchRadius,
  style,
}: {
  children: ReactNode;
  className?: string;
  notchRadius?: string;
  style?: CSSProperties;
}) {
  const vars = notchRadius ? ({ "--perf-r": notchRadius } as Record<string, string>) : {};
  return (
    <div className={className} style={{ ...vars, ...style } as CSSProperties}>
      {children}
    </div>
  );
}

/** The part kept: what the event is, and the code that gets scanned. */
export function TicketBody({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Plate className={`paper-cut-bottom ${className}`}>{children}</Plate>;
}

/**
 * The part torn off: the details worth keeping after the door.
 *
 * Carries the dashed tear line at its own top edge (a ::before, see globals),
 * so the seam has exactly one owner and the two halves cannot disagree about
 * where the ticket tears.
 */
export function TicketStub({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <Plate className={`paper-cut-top ${className}`}>{children}</Plate>;
}
