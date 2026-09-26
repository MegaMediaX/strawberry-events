import type { ReactNode } from "react";

/**
 * The status, pressed onto the ticket.
 *
 * Replaces the coloured pill-and-icon badge. A stamp carries state the way a
 * physical document does, and it is the one element on the plate allowed to sit
 * off-square — the tilt is what makes it read as struck rather than placed.
 *
 * Colour is NOT the signal. Every stamp carries its word, and the icon is
 * supplementary, so the state survives greyscale and colour blindness
 * (WCAG 1.4.1). It is printed in the ink, never the red — red is kept for
 * things you can press — and clears 4.5:1 on the stock; see --paper-stamp.
 */
export function Stamp({
  children,
  icon,
  tone = "ink",
  className = "",
}: {
  children: ReactNode;
  icon?: ReactNode;
  /** `ink` prints in the stamp ink; `faded` is for states that are over and done. */
  tone?: "ink" | "faded";
  className?: string;
}) {
  // No `!` prefixes. Those existed only to out-rank .paper-stamp back when
  // this layer was unlayered css and therefore beat every Tailwind utility;
  // now that it sits in @layer components, a utility at the call site wins on
  // its own and the escape hatch would only mislead the next reader.
  const toneCls =
    tone === "faded"
      ? "border-[color:var(--muted-foreground)] text-[color:var(--muted-foreground)]"
      : "";
  return (
    <span className={`paper-stamp ${toneCls} ${className}`}>
      {icon}
      {children}
    </span>
  );
}
