"use client";

import { useId, type InputHTMLAttributes, type ReactNode } from "react";
import { Check } from "lucide-react";

/**
 * The form, as something filled in by hand.
 *
 * Fields are ruled lines rather than boxes — see the paper form section of
 * app/globals.css. What is NOT reinvented here is any of the behaviour that
 * makes a form usable without a mouse or without sight: every control is a
 * native element, the label is associated by id rather than by proximity, and
 * the error is wired to the control through aria-describedby.
 *
 * That last part is load-bearing in this codebase specifically. The wizard's
 * fields once rendered <Label> and <Input> as siblings with no htmlFor/id pair
 * and every one of them was announced unlabelled; the ids exist because of
 * that, and this layer keeps taking them rather than generating its own.
 */

export function Ink({
  className = "",
  ref,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  ref?: React.Ref<HTMLInputElement>;
}) {
  return (
    // ref is named explicitly for legibility, not because the spread would
    // drop it: on React 19 `ref` is an ordinary prop, so {...props} carries it
    // either way. The primitive this replaces warned that forwarding worked
    // only incidentally through the spread, which was a forwardRef-era hazard
    // that no longer applies — verified by mutation, where removing this
    // destructure changes nothing. What IS still possible is destructuring ref
    // out and then forgetting to pass it, which produces a null ref with no
    // type or runtime error; the wizard focuses the offending field on a
    // validation failure, so that would strand the person on an error they
    // cannot find. That is the mutation the test pins.
    <input ref={ref} className={`paper-ink ${className}`} {...props} />
  );
}

/**
 * A caption, its control, and the message when it is wrong.
 *
 * `error` is rendered into an element whose id the caller points the control's
 * aria-describedby at; the component does not invent that wiring, because the
 * wizard owns which field an error belongs to and moves focus to it.
 */
export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
  className = "",
}: {
  label: ReactNode;
  htmlFor: string;
  required?: boolean;
  hint?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <label className="paper-caption" htmlFor={htmlFor}>
        {label}
        {/* The asterisk is decoration; aria-required on the control is what
            actually announces the field as required, and the wizard sets it. */}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

/**
 * A punched box.
 *
 * The real <input type="checkbox"> stays in the DOM, visually hidden, and the
 * painted square is aria-hidden — the same construction the primitive this
 * replaces used, and for the same reason: swapping in a div with
 * role="checkbox" would mean reimplementing space-to-toggle and form participation
 * to gain nothing but a different tag name.
 *
 * The 48px hit row is kept. It is a consent control on a phone.
 */
export function Tick({
  checked,
  onCheckedChange,
  children,
  id,
  className = "",
}: {
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
  children: ReactNode;
  id?: string;
  className?: string;
}) {
  const generated = useId();
  const inputId = id ?? generated;

  return (
    <div className={`flex min-h-12 items-center ${className}`}>
      <input
        id={inputId}
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheckedChange(e.target.checked)}
        className="peer sr-only"
      />
      {/* The focus styles hang off the label rather than the box, because
          peer-* compiles to a sibling combinator and only the label is a
          sibling of the input; the child selector then reaches the box. */}
      <label
        htmlFor={inputId}
        className="flex cursor-pointer items-center gap-3 text-sm leading-snug select-none peer-focus-visible:[&>span:first-child]:outline peer-focus-visible:[&>span:first-child]:outline-2 peer-focus-visible:[&>span:first-child]:outline-offset-2 peer-focus-visible:[&>span:first-child]:outline-[color:var(--ring)]"
      >
        <span className="paper-tick-box" data-checked={checked ? "" : undefined} aria-hidden="true">
          {checked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        <span>{children}</span>
      </label>
    </div>
  );
}

/**
 * A field's caption, for callers that lay out the label and control
 * themselves. Field() uses the same styling; this exists so an existing form
 * can adopt the look without having its structure rearranged underneath it —
 * and, more to the point, without disturbing the htmlFor/id pairs it already
 * gets right.
 */
export function Caption({
  children,
  htmlFor,
  className = "",
}: {
  children: ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label className={`paper-caption ${className}`} htmlFor={htmlFor}>
      {children}
    </label>
  );
}
