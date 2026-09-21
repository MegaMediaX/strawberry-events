import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";

/**
 * The action, printed.
 *
 * A native <button>. Not a headless wrapper and not a styled shadcn Button:
 * the whole point of this layer is that the shape is ours. What a native
 * element gives for free is exactly the part that must not be reinvented —
 * Space/Enter activation, the disabled semantics, form submission, and the
 * accessible name from its own content — so the custom work is confined to
 * paint.
 *
 * Focus is handled in CSS (.paper-press:focus-visible in app/globals.css) with
 * an OUTSET outline rather than a ring inside the block, because the block has
 * no radius to soften a ring against and an inset ring on a filled control is
 * the first thing to disappear against its own fill.
 */

export type PressVariant = "ink" | "ruled" | "quiet";
export type PressSize = "base" | "lg" | "icon";

const VARIANT: Record<PressVariant, string> = {
  /* The red is a FILL here, with white on it — 6.56:1 in light, and the dark
     theme's --primary is tuned for the same job. Never --primary-text, which
     is the tint reserved for red-on-page TEXT. */
  ink: "bg-primary text-primary-foreground hover:bg-primary/90",
  ruled:
    "border-[color:var(--paper-rule)] text-[color:var(--paper-ink)] hover:bg-[color:var(--paper-ink)]/5",
  quiet: "text-[color:var(--paper-ink)] hover:bg-[color:var(--paper-ink)]/5",
};

const SIZE: Record<PressSize, string> = {
  base: "px-4 py-2.5 text-sm",
  lg: "px-6 py-3.5 text-base",
  /* Square, and 44px rather than the 32px the primitive this replaces used for
     its icon sizes. These are the quantity steppers on a phone, and WCAG 2.5.5
     asks for 44x44 — a stepper is exactly the control people miss and mis-tap. */
  icon: "h-11 w-11 p-0",
};

function pressClass(variant: PressVariant, size: PressSize, className: string): string {
  return [
    "paper-press",
    VARIANT[variant],
    SIZE[size],
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
    className,
  ]
    .filter(Boolean)
    .join(" ");
}

export function Press({
  children,
  variant = "ink",
  size = "base",
  className = "",
  type = "button",
  ...rest
}: {
  children: ReactNode;
  variant?: PressVariant;
  size?: PressSize;
  className?: string;
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    // type defaults to "button", not the platform's "submit". A button inside a
    // form that submits it by accident is a bug that only shows up in the one
    // flow that matters here, which is registration.
    <button type={type} className={pressClass(variant, size, className)} {...rest}>
      {children}
    </button>
  );
}

/**
 * The same block as a link.
 *
 * Separate from Press rather than a polymorphic `as` prop: an anchor and a
 * button differ in more than paint (activation keys, context menu, what a
 * screen reader announces, whether `disabled` means anything at all), and a
 * component that blurs the two invites a link that cannot be middle-clicked or
 * a button that cannot be pressed with Space.
 */
export function PressLink({
  children,
  variant = "ink",
  size = "base",
  className = "",
  ...rest
}: {
  children: ReactNode;
  variant?: PressVariant;
  size?: PressSize;
  className?: string;
} & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a className={pressClass(variant, size, className)} {...rest}>
      {children}
    </a>
  );
}
