"use client";

import { useId, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { stepMotion } from "@/lib/motion";
import { Checkbox } from "@/components/ui/checkbox";
import { Programme } from "./programme";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToPrice } from "@/lib/pretix/mappers";
import { Stepper } from "./stepper";
import { PhoneCountryField } from "./phone-country-field";
import { SeatSelector } from "@/components/seats/seat-selector";
import { getFieldsForTicket, validateRequiredAnswers, fieldOptions, type FieldDef } from "@/lib/forms/fields";
import { registerAction } from "@/app/[locale]/(public)/events/[slug]/register/actions";
import { SubEventPicker, type SubEventItem, type SubEventSelection } from "./sub-event-picker";
import { gatedCategories, visibleSubEvents, pruneSelection } from "@/lib/registration/opt-in";

interface WizardTicket {
  id: number;
  title: string;
  description: string | null;
  priceCents: number;
}

/** Step labels — Sessions step is skipped when there are no sub-events. */
function buildSteps(hasSubEvents: boolean): string[] {
  return hasSubEvents
    ? ["Details", "Tickets", "Sessions", "Confirm"]
    : ["Details", "Tickets", "Confirm"];
}

/** Required marker: the asterisk is decorative, the word carries the meaning. */
function RequiredMark() {
  return (
    <>
      <span aria-hidden="true" className="text-destructive">
        *
      </span>
      <span className="sr-only">(required)</span>
    </>
  );
}

/** Editorial header per step. Keyed by step label so a 3-step event (no
 *  sub-events) numbers itself correctly without a second lookup table. */
const STEP_HEADLINES: Record<string, { eyebrow: string; title: string }> = {
  Details: { eyebrow: "Who's coming", title: "Your details" },
  Tickets: { eyebrow: "Admission", title: "Choose your ticket" },
  Sessions: { eyebrow: "The programme", title: "Build your schedule" },
  Confirm: { eyebrow: "Confirm", title: "Review and confirm" },
};

function StepHeader({ index, label }: { index: number; label: string }) {
  const h = STEP_HEADLINES[label] ?? { eyebrow: label, title: label };
  return (
    <header className="flex flex-col gap-1.5">
      <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase tabular-nums">
        {String(index + 1).padStart(2, "0")} — {h.eyebrow}
      </p>
      <h2 className="font-heading text-[28px] leading-[1.05] tracking-[-0.01em] md:text-[34px]">
        {h.title}
      </h2>
    </header>
  );
}

/** Section marker above a supporting block. */
function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
      {children}
    </p>
  );
}

const CONFIRM_STEP_NO_SUB = 2;
const CONFIRM_STEP_WITH_SUB = 3;
const SESSIONS_STEP = 2;

export function RegistrationWizard({
  locale,
  slug,
  tickets,
  seatSections,
  customFields = [],
  subEvents = [],
  ticketsPerUserMain = 1,
  ticketsPerUserTotal = 1,
  inviteToken,
  attendeeTypeEnabled = false,
  attendeeTypeRequired = false,
}: {
  locale: string;
  slug: string;
  tickets: WizardTicket[];
  seatSections?: import("@/components/seats/seat-selector").SectionNode[];
  customFields?: FieldDef[];
  subEvents?: SubEventItem[];
  ticketsPerUserMain?: number;
  ticketsPerUserTotal?: number;
  inviteToken?: string;
  attendeeTypeEnabled?: boolean;
  attendeeTypeRequired?: boolean;
}) {
  const hasSubEvents = subEvents.length > 0;
  const STEPS = buildSteps(hasSubEvents);
  const CONFIRM_STEP = hasSubEvents ? CONFIRM_STEP_WITH_SUB : CONFIRM_STEP_NO_SUB;

  const reduce = useReducedMotion();
  // Explicit ids: <Label> and <Input> were siblings with no htmlFor/id pair, so
  // nothing associated them and every field was announced unlabelled.
  const uid = useId();
  const fid = {
    firstName: `${uid}-first-name`,
    lastName: `${uid}-last-name`,
    email: `${uid}-email`,
    phone: `${uid}-phone`,
    attendeeType: `${uid}-attendee-type`,
    company: `${uid}-company`,
    error: `${uid}-error`,
  };
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seatIds, setSeatIds] = useState<string[]>([]);

  const [a, setA] = useState({
    firstName: "",
    lastName: "",
    email: "",
    phoneCC: "+961",
    phone: "",
    company: "",
    attendeeType: "",
  });
  const [qty, setQty] = useState<Record<number, number>>({});
  const [subEventSelection, setSubEventSelection] = useState<SubEventSelection[]>([]);
  // Categories the attendee opted into (e.g. "Workshops"). Gated categories stay
  // hidden in the Sessions step until ticked here, in the Tickets step.
  const [optedIn, setOptedIn] = useState<string[]>([]);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  // Custom fields that apply to the currently-selected tickets (deduped).
  const scopedFields = (() => {
    const byId = new Map<string, FieldDef>();
    for (const t of tickets) {
      if ((qty[t.id] ?? 0) > 0) {
        for (const f of getFieldsForTicket(customFields, t.id)) byId.set(f.id, f);
      }
    }
    return [...byId.values()];
  })();

  // Opt-in categories and the sessions currently visible for that choice. The
  // stepper shape is driven by the full list so it never changes mid-flow.
  const optInCategories = gatedCategories(subEvents);
  const shownSubEvents = visibleSubEvents(subEvents, optedIn);

  function toggleCategory(category: string) {
    const next = optedIn.includes(category)
      ? optedIn.filter((c) => c !== category)
      : [...optedIn, category];
    setOptedIn(next);
    // Un-ticking must not leave a now-hidden session in the order.
    setSubEventSelection((sel) => pruneSelection(sel, visibleSubEvents(subEvents, next)));
  }

  const subEventCents = subEventSelection.reduce((sum, s) => {
    const se = subEvents.find((x) => x.pretixItemId === s.itemId);
    return sum + (se ? se.priceCents * s.quantity : 0);
  }, 0);
  const totalCents =
    tickets.reduce((sum, t) => sum + (qty[t.id] ?? 0) * t.priceCents, 0) +
    subEventCents;
  const hasTickets = Object.values(qty).some((q) => q > 0);
  const totalQty = Object.values(qty).reduce((sum, q) => sum + (q ?? 0), 0);
  // Per-user ticket caps (admin-set on the event). Main tickets count toward
  // both the main cap and the overall total; sub-events count toward the total.
  const subQty = subEventSelection.reduce((sum, s) => sum + s.quantity, 0);
  const mainCapReached = totalQty >= ticketsPerUserMain;
  const totalCapReached = totalQty + subQty >= ticketsPerUserTotal;
  const canAddMainTicket = !mainCapReached && !totalCapReached;
  const seatsRequired = !!seatSections && seatSections.length > 0;
  const seatsSatisfied = !seatsRequired || seatIds.length === totalQty;

  function next() {
    setErr(null);
    if (step === 0) {
      if (!a.firstName || !a.lastName || !a.email || !a.phone) {
        setErr("Please complete all required fields.");
        return;
      }
      if (attendeeTypeEnabled) {
        if (attendeeTypeRequired && !a.attendeeType) {
          setErr("Please select an attendee type.");
          return;
        }
        if (a.attendeeType === "company" && !a.company.trim()) {
          setErr("Company name is required.");
          return;
        }
      }
    }
    if (step === 1) {
      if (!hasTickets) {
        setErr("Select at least one ticket.");
        return;
      }
      if (!seatsSatisfied) {
        setErr(`Please select a seat for each ticket (${seatIds.length}/${totalQty}).`);
        return;
      }
    }
    setStep((s) => Math.min(CONFIRM_STEP, s + 1));
  }

  async function submit() {
    setErr(null);
    if (!terms || !privacy) {
      setErr("You must accept the Terms and Privacy Policy.");
      return;
    }
    if (!seatsSatisfied) {
      setErr("Please select a seat for each ticket.");
      return;
    }
    const missing = validateRequiredAnswers(scopedFields, Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value })));
    if (missing.length) {
      setErr(`Please complete: ${missing.join(", ")}`);
      return;
    }
    setBusy(true);
    const scopedAnswers = scopedFields
      .map((f) => ({ fieldId: f.id, value: answers[f.id] ?? "" }))
      .filter((x) => x.value.trim());
    const mainTickets = tickets
      .filter((t) => (qty[t.id] ?? 0) > 0)
      .map((t) => ({ itemId: t.id, quantity: qty[t.id] }));
    const allTickets = [...mainTickets, ...subEventSelection.filter((s) => s.quantity > 0)];
    const res = await registerAction(locale, slug, {
      attendee: {
        firstName: a.firstName,
        lastName: a.lastName,
        email: a.email,
        phoneCC: a.phoneCC,
        phone: a.phone,
        attendeeType: a.attendeeType || null,
        // Company name is only meaningful for the "company" attendee type.
        company: a.attendeeType === "company" ? a.company.trim() || null : null,
      },
      tickets: allTickets,
      seatIds: seatSections ? seatIds : undefined,
      answers: scopedAnswers,
      inviteToken,
      consentTerms: terms,
      consentPrivacy: privacy,
    });
    setBusy(false);
    // On success the action redirects; only errors return.
    if (res?.error) setErr(res.error);
    if (res?.fieldErrors)
      setErr(Object.values(res.fieldErrors).flat().join(", "));
  }

  return (
    // A real <form> so Enter submits the step, browsers offer autofill across
    // the whole field group, and the primary action is a genuine submit button.
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        if (step < CONFIRM_STEP) next();
        else void submit();
      }}
      /* Width and horizontal padding come from <main> on the page; the sticky
         ribbon's -mx-4 relies on that padding existing exactly once.
         pb clears the 44px action bar + its safe-area inset, replacing the
         previous guessed pb-28. */
      className="pt-8"
      style={{ paddingBottom: "calc(100px + env(safe-area-inset-bottom))" }}
    >
      <Stepper steps={STEPS} current={step} />

      {/* Below lg this is a single column and the programme renders inline
          under each step. From lg the programme moves into a sticky rail so
          the itinerary stays visible while the form is filled, and the wide
          viewport stops being mostly empty. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10">
      <div className="mt-8 min-h-[200px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            {...stepMotion(!!reduce)}
          >
            {step === 0 && (
              <div className="flex flex-col gap-5">
                <StepHeader index={0} label={STEPS[0]} />
                <p className="text-xs text-muted-foreground">
                  Fields marked <RequiredMark /> are required.
                </p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={fid.firstName}>
                      First name <RequiredMark />
                    </Label>
                    <Input
                      className="well h-11"
                      id={fid.firstName}
                      required
                      aria-required="true"
                      autoComplete="given-name"
                      value={a.firstName}
                      onChange={(e) => setA({ ...a, firstName: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={fid.lastName}>
                      Last name <RequiredMark />
                    </Label>
                    <Input
                      className="well h-11"
                      id={fid.lastName}
                      required
                      aria-required="true"
                      autoComplete="family-name"
                      value={a.lastName}
                      onChange={(e) => setA({ ...a, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={fid.email}>
                    Email <RequiredMark />
                  </Label>
                  <Input
                    className="well h-11"
                    id={fid.email}
                    type="email"
                    required
                    aria-required="true"
                    autoComplete="email"
                    value={a.email}
                    onChange={(e) => setA({ ...a, email: e.target.value })}
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor={fid.phone}>
                    Phone <RequiredMark />
                  </Label>
                  <PhoneCountryField
                    id={fid.phone}
                    required
                    cc={a.phoneCC}
                    phone={a.phone}
                    onCc={(v) => setA({ ...a, phoneCC: v })}
                    onPhone={(v) => setA({ ...a, phone: v })}
                  />
                </div>
                {attendeeTypeEnabled && (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label htmlFor={fid.attendeeType}>
                        Attendee type
                        {attendeeTypeRequired ? <RequiredMark /> : null}
                      </Label>
                      <select
                        id={fid.attendeeType}
                        required={attendeeTypeRequired}
                        aria-required={attendeeTypeRequired || undefined}
                        className="well h-11 w-full rounded-lg border border-input px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={a.attendeeType}
                        onChange={(e) =>
                          setA({
                            ...a,
                            attendeeType: e.target.value,
                            // Clear a stale company name when leaving "Company".
                            company: e.target.value === "company" ? a.company : "",
                          })
                        }
                      >
                        <option value="">Select…</option>
                        <option value="student">Student</option>
                        <option value="company">Company</option>
                        <option value="freelancer">Freelancer</option>
                      </select>
                    </div>
                    {a.attendeeType === "company" && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={fid.company}>
                          Company name <RequiredMark />
                        </Label>
                        <Input
                          className="well h-11"
                          id={fid.company}
                          required
                          aria-required="true"
                          autoComplete="organization"
                          value={a.company}
                          onChange={(e) => setA({ ...a, company: e.target.value })}
                        />
                      </div>
                    )}
                  </div>
                )}

                {hasSubEvents && (
                  <section className="mt-8 flex flex-col gap-3 lg:hidden">
                    <Eyebrow>What you&rsquo;re joining</Eyebrow>
                    <Programme
                      subEvents={subEvents}
                      selected={subEventSelection}
                      variant="preview"
                    />
                  </section>
                )}
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-5">
                <StepHeader index={1} label={STEPS[1]} />
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-[var(--shadow-1)]"
                  >
                    <div className="min-w-0">
                      <div className="font-heading text-[22px] leading-[1.15] tracking-[-0.01em]">
                        {t.title}
                      </div>
                      {t.description && (
                        <div className="mt-0.5 text-sm text-muted-foreground">{t.description}</div>
                      )}
                      <div className="mt-0.5 text-[13px] font-medium tracking-[0.04em] text-muted-foreground uppercase">
                        {t.priceCents === 0 ? "Free" : `$${centsToPrice(t.priceCents)}`}
                      </div>
                    </div>
                    {ticketsPerUserMain === 1 ? (
                      <button
                        type="button"
                        role="switch"
                        aria-checked={(qty[t.id] ?? 0) > 0}
                        aria-label={t.title}
                        // The per-user cap still applies to a toggle: it may
                        // always be turned OFF, but only turned ON while there
                        // is allowance left (mirrors the "+" button below).
                        disabled={!canAddMainTicket && (qty[t.id] ?? 0) === 0}
                        onClick={() => {
                          const on = (qty[t.id] ?? 0) > 0;
                          if (!on && !canAddMainTicket) return;
                          setQty({ ...qty, [t.id]: on ? 0 : 1 });
                        }}
                        className={[
                          "flex size-11 shrink-0 items-center justify-center rounded-full border-2 text-lg transition-colors",
                          "outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
                          "disabled:pointer-events-none disabled:opacity-40",
                          (qty[t.id] ?? 0) > 0
                            ? "border-primary bg-primary text-primary-foreground"
                            : "border-border bg-background",
                        ].join(" ")}
                      >
                        <span aria-hidden="true">{(qty[t.id] ?? 0) > 0 ? "✓" : "+"}</span>
                      </button>
                    ) : (
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        className="size-11"
                        aria-label={`Remove one ${t.title} ticket`}
                        disabled={(qty[t.id] ?? 0) === 0}
                        onClick={() =>
                          setQty({ ...qty, [t.id]: Math.max(0, (qty[t.id] ?? 0) - 1) })
                        }
                      >
                        −
                      </Button>
                      {/* aria-live so the new count is announced after a tap;
                          the buttons themselves keep their static labels. */}
                      <span
                        className="w-8 text-center tabular-nums"
                        aria-live="polite"
                        aria-label={`${qty[t.id] ?? 0} ${t.title} tickets`}
                      >
                        {qty[t.id] ?? 0}
                      </span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon-lg"
                        className="size-11"
                        aria-label={`Add one ${t.title} ticket`}
                        disabled={!canAddMainTicket}
                        onClick={() => {
                          if (!canAddMainTicket) return;
                          setQty({ ...qty, [t.id]: (qty[t.id] ?? 0) + 1 });
                        }}
                      >
                        +
                      </Button>
                    </div>
                    )}
                  </div>
                ))}
                {(mainCapReached || totalCapReached) && (
                  <p className="text-sm text-muted-foreground">
                    {totalCapReached && !mainCapReached
                      ? `You can register for up to ${ticketsPerUserTotal} item(s) in total.`
                      : `You can register for up to ${ticketsPerUserMain} ticket(s) per person.`}
                  </p>
                )}
                {optInCategories.map((category) => {
                  const checked = optedIn.includes(category);
                  const count = subEvents.filter((se) => se.category === category).length;
                  return (
                    <label
                      key={category}
                      className="flex min-h-11 cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-[var(--shadow-1)]"
                    >
                      <div>
                        <div className="font-medium">{category}</div>
                        <div className="text-sm text-muted-foreground">
                          {checked
                            ? `Pick your sessions in the next step (${count} available)`
                            : `Tick to choose from ${count} session(s)`}
                        </div>
                      </div>
                      <input
                        type="checkbox"
                        className="size-5 shrink-0 accent-[var(--color-primary)]"
                        checked={checked}
                        onChange={() => toggleCategory(category)}
                      />
                    </label>
                  );
                })}
                {seatSections && seatSections.length > 0 && (
                  <div className="mt-2 rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-[var(--shadow-1)]">
                    <div className="mb-2 font-medium">Choose your seat(s)</div>
                    <SeatSelector sections={seatSections} onChange={setSeatIds} />
                  </div>
                )}

                {hasSubEvents && (
                  <section className="mt-8 flex flex-col gap-3 lg:hidden">
                    <Eyebrow>What you&rsquo;re joining</Eyebrow>
                    <Programme
                      subEvents={subEvents}
                      selected={subEventSelection}
                      variant="preview"
                    />
                  </section>
                )}
              </div>
            )}

            {hasSubEvents && step === SESSIONS_STEP && (
              <div className="flex flex-col gap-5">
                <StepHeader index={SESSIONS_STEP} label={STEPS[SESSIONS_STEP]} />
                {/* The stepper shape is fixed up-front, so when every session is
                    opt-in-gated and nothing is ticked this step would otherwise
                    dead-end on the picker's empty state. Point back instead. */}
                {shownSubEvents.length === 0 && optInCategories.length > 0 ? (
                  <p className="text-sm text-muted-foreground">
                    Tick {optInCategories.map((c) => `“${c}”`).join(", ")} in the
                    previous step to choose sessions, or continue without any.
                  </p>
                ) : (
                  <SubEventPicker
                    locale={locale}
                    subEvents={shownSubEvents}
                    selected={subEventSelection}
                    totalAllowance={Math.max(0, ticketsPerUserTotal - totalQty)}
                    onChange={setSubEventSelection}
                  />
                )}
              </div>
            )}

            {step === CONFIRM_STEP && (
              <div className="flex flex-col gap-5">
                <StepHeader index={CONFIRM_STEP} label={STEPS[CONFIRM_STEP]} />
                {hasSubEvents && (
                  <section className="flex flex-col gap-3">
                    <Eyebrow>Your schedule</Eyebrow>
                    <Programme
                      subEvents={subEvents}
                      selected={subEventSelection}
                      variant="receipt"
                    />
                  </section>
                )}
                <div className="rounded-[var(--radius-lg)] border border-border bg-card p-5 text-sm shadow-[var(--shadow-1)]">
                  <div className="font-medium">Order summary</div>
                  {tickets
                    .filter((t) => (qty[t.id] ?? 0) > 0)
                    .map((t) => (
                      <div key={t.id} className="mt-1 flex justify-between">
                        <span>
                          {t.title} × {qty[t.id]}
                        </span>
                        <span>${centsToPrice(t.priceCents * (qty[t.id] ?? 0))}</span>
                      </div>
                    ))}
                  {subEventSelection.filter((s) => s.quantity > 0).map((s) => {
                    const se = subEvents.find((x) => x.pretixItemId === s.itemId);
                    if (!se) return null;
                    const title = locale === "ar" && se.titleAr ? se.titleAr : se.titleEn;
                    return (
                      <div key={s.itemId} className="mt-1 flex justify-between">
                        <span>{title} × {s.quantity}</span>
                        <span>${centsToPrice(se.priceCents * s.quantity)}</span>
                      </div>
                    );
                  })}
                  <div className="mt-2 flex justify-between border-t border-border pt-2 font-semibold">
                    <span>Total</span>
                    <span>{totalCents === 0 ? "Free" : `$${centsToPrice(totalCents)}`}</span>
                  </div>
                </div>
                {scopedFields.length > 0 && (
                  <div className="flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border p-3">
                    <div className="font-medium">Additional details</div>
                    {scopedFields.map((f) => {
                      const label = locale === "ar" && f.labelAr ? f.labelAr : f.labelEn;
                      const ph = (locale === "ar" ? f.placeholderAr : f.placeholderEn) ?? "";
                      const help = locale === "ar" ? f.helpTextAr : f.helpTextEn;
                      const val = answers[f.id] ?? "";
                      const set = (v: string) => setAnswers((s) => ({ ...s, [f.id]: v }));
                      const cls = "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
                      return (
                        <div key={f.id}>
                          <Label>{label}{f.required ? " *" : ""}</Label>
                          {f.type === "textarea" ? (
                            <textarea className={cls} value={val} placeholder={ph} onChange={(e) => set(e.target.value)} />
                          ) : f.type === "select" || f.type === "multiselect" ? (
                            <select className={cls} value={val} onChange={(e) => set(e.target.value)}>
                              <option value="">—</option>
                              {fieldOptions(f.options).map((o) => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : f.type === "checkbox" ? (
                            <label className="mt-1 flex items-center gap-2 text-sm">
                              <input type="checkbox" checked={val === "true"} onChange={(e) => set(e.target.checked ? "true" : "")} /> Yes
                            </label>
                          ) : (
                            <Input
                              type={f.type === "email" ? "email" : f.type === "date" ? "date" : "text"}
                              value={val}
                              placeholder={ph}
                              onChange={(e) => set(e.target.value)}
                            />
                          )}
                          {help && <p className="mt-1 text-xs text-muted-foreground">{help}</p>}
                        </div>
                      );
                    })}
                  </div>
                )}
                <Checkbox checked={terms} onCheckedChange={setTerms}>
                  <span>
                    I agree to the{" "}
                    <a
                      href={`/${locale}/legal/terms`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Terms and Conditions
                    </a>
                  </span>
                </Checkbox>
                <Checkbox checked={privacy} onCheckedChange={setPrivacy}>
                  <span>
                    I agree to the{" "}
                    <a
                      href={`/${locale}/legal/privacy`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Privacy Policy
                    </a>
                  </span>
                </Checkbox>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {hasSubEvents && (
        <aside className="sticky top-24 hidden lg:block">
          <div className="rounded-[var(--radius-lg)] border border-border bg-card p-6 shadow-[var(--shadow-1)]">
            <Eyebrow>The programme</Eyebrow>
            <Programme
              className="mt-3"
              subEvents={subEvents}
              selected={subEventSelection}
              variant="preview"
            />
            <p className="mt-4 border-t border-border pt-3 text-[13px] font-medium tracking-[0.04em] text-muted-foreground tabular-nums">
              {totalCents === 0 ? "Total — Free" : `Total — $${centsToPrice(totalCents)}`}
            </p>
          </div>
        </aside>
      )}
      </div>

      {/* role="alert" so a validation failure is announced. The region is
          always present so screen readers pick up the change in place. */}
      <div role="alert" aria-live="assertive" id={fid.error}>
        {err && (
          <p className="mt-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">
            {err}
          </p>
        )}
      </div>

      {/* Sticky bottom action bar. pb uses the safe-area inset so the buttons
          clear the iOS home indicator instead of sitting under it. */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-background/90 px-4 py-3 backdrop-blur"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <Button
          type="button"
          variant="ghost"
          size="lg"
          className="h-11"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || busy}
        >
          Back
        </Button>
        {step < CONFIRM_STEP ? (
          <Button type="submit" size="lg" className="h-11 px-6">
            Next
          </Button>
        ) : (
          <Button type="submit" size="lg" className="h-11 px-6" disabled={busy}>
            {busy ? "Submitting…" : "Complete registration"}
          </Button>
        )}
      </div>
    </form>
  );
}
