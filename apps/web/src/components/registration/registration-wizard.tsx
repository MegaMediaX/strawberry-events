"use client";

import { useEffect, useId, useRef, useState } from "react";
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
import { isValidEmail } from "@/lib/registration/email";
import {
  clearDraft,
  draftHasContent,
  draftKey,
  loadDraft,
  saveDraft,
  type RegistrationDraft,
} from "@/lib/registration/draft";
import { registerAction } from "@/app/[locale]/(public)/events/[slug]/register/actions";
import { SubEventPicker, type SubEventItem, type SubEventSelection } from "./sub-event-picker";
import {
  JOB_TITLE_OTHER,
  JOB_TITLE_PRESETS,
  JOB_TITLE_MAX,
  resolveVisibleJobTitle,
} from "@/lib/registration/job-title";
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

/** ~0.5s at 60fps: long enough for a step transition, short enough to give up. */
const FOCUS_RETRY_FRAMES = 30;

/**
 * Server-side field names that map back to a control on the Details step,
 * with the label the attendee saw above it.
 *
 * The label matters as much as the id: a rejection used to arrive as the bare
 * Zod message ("Required", "Enter a valid email address"), joined by commas,
 * with nothing saying which of eight fields it was about.
 */
const DETAIL_FIELDS: Record<
  string,
  { id: "firstName" | "lastName" | "email" | "phone" | "company" | "jobTitle"; label: string }
> = {
  firstName: { id: "firstName", label: "First name" },
  lastName: { id: "lastName", label: "Last name" },
  email: { id: "email", label: "Email" },
  phone: { id: "phone", label: "Phone" },
  phoneCC: { id: "phone", label: "Phone" },
  company: { id: "company", label: "Company name" },
  jobTitle: { id: "jobTitle", label: "Job title" },
};

/** "Email: Enter a valid email address" for every field the server rejected. */
export function describeFieldErrors(fieldErrors: Record<string, string[]>): string {
  return Object.entries(fieldErrors)
    .map(([key, messages]) => {
      const label = DETAIL_FIELDS[key]?.label;
      const text = messages.join(", ");
      return label ? `${label}: ${text}` : text;
    })
    .join(" · ");
}

/** "a, b and c" — used to name every consent still missing in one sentence. */
function listSentence(items: string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The blank attendee, named once.
 *
 * Three places reset to it — the initial state, "Start over", and arriving at
 * a different event — and a field present in one literal and missing from
 * another is how one registration's details leak into the next.
 */
interface Attendee {
  firstName: string;
  lastName: string;
  email: string;
  phoneCC: string;
  phone: string;
  company: string;
  attendeeType: string;
  /** The dropdown selection, which may be the "Other" sentinel. */
  jobTitle: string;
  /** The text typed behind "Other". Only the resolved value is submitted. */
  jobTitleOther: string;
}

const EMPTY_ATTENDEE: Attendee = {
  firstName: "",
  lastName: "",
  email: "",
  phoneCC: "+961",
  phone: "",
  company: "",
  attendeeType: "",
  jobTitle: "",
  jobTitleOther: "",
};

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
    jobTitle: `${uid}-job-title`,
    jobTitleOther: `${uid}-job-title-other`,
    error: `${uid}-error`,
  };
  const [step, setStep] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  // The id of the control the current error belongs to, or null when it belongs
  // to the step as a whole (no tickets chosen, a consent left unticked).
  const [errField, setErrField] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seatIds, setSeatIds] = useState<string[]>([]);
  const errorRef = useRef<HTMLDivElement>(null);

  /**
   * Report a validation failure and put it in front of the person.
   *
   * The message alone is not enough: it renders below a form that is taller
   * than a phone screen, so a step-one failure used to leave the attendee
   * looking at an unchanged screen and a Next button that appeared dead. Focus
   * moves to the field at fault — which scrolls it into view, names it to a
   * screen reader, and marks it invalid — or to the message itself when no
   * single field is to blame.
   */
  function fail(message: string, fieldId?: string) {
    setErr(message);
    setErrField(fieldId ?? null);
    // Retried across a few frames: when a server-side rejection sends the
    // attendee back to step one, the step transition animates out before the
    // field exists to focus, and a single rAF would find nothing and give up.
    let attempts = 0;
    const focusTarget = () => {
      const el = fieldId ? document.getElementById(fieldId) : errorRef.current;
      if (!el) {
        if (attempts++ < FOCUS_RETRY_FRAMES) requestAnimationFrame(focusTarget);
        return;
      }
      el.focus({ preventScroll: true });
      el.scrollIntoView({ block: "center", behavior: reduce ? "auto" : "smooth" });
    };
    requestAnimationFrame(focusTarget);
  }

  /** Marks the control the current error points at, and names the message. */
  function invalidProps(fieldId: string) {
    return errField === fieldId
      ? { "aria-invalid": true as const, "aria-describedby": fid.error }
      : {};
  }

  const [a, setA] = useState<Attendee>(() => ({ ...EMPTY_ATTENDEE }));
  const [qty, setQty] = useState<Record<number, number>>({});
  const [subEventSelection, setSubEventSelection] = useState<SubEventSelection[]>([]);
  // Categories the attendee opted into (e.g. "Workshops"). Gated categories stay
  // hidden in the Sessions step until ticked here, in the Tickets step.
  const [optedIn, setOptedIn] = useState<string[]>([]);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  // The organiser's data-protection consent, worded by them and shown verbatim.
  const [dataUse, setDataUse] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /**
   * Which event's draft the form state belongs to.
   *
   * Not a boolean: moving between two events' registration pages is a client
   * navigation that can reuse this component, and with a flag an event with no
   * saved draft kept the PREVIOUS event's name, email and phone on screen —
   * and the save effect then wrote them under the new event's key.
   */
  const [restoredFor, setRestoredFor] = useState<string | null>(null);
  const [restoredNotice, setRestoredNotice] = useState(false);

  useEffect(() => {
    const draft = loadDraft(slug);
    const restorable = draft && draftHasContent(draft) ? draft : null;
    {
      /* eslint-disable react-hooks/set-state-in-effect --
         The draft lives in sessionStorage, which does not exist during SSR.
         Seeding these with a lazy initializer would make the server render the
         empty form and the client render the restored one, which is a
         hydration mismatch; restoring after mount is the correct shape here.
         Same reasoning as the Toaster's subscribe-and-sync effect. */
      // Unconditional, including the no-draft case: arriving at a DIFFERENT
      // event must clear the previous one's details rather than inherit them.
      setA(restorable ? restorable.attendee : EMPTY_ATTENDEE);
      setQty(restorable?.quantities ?? {});
      setOptedIn(restorable?.optedIn ?? []);
      setSubEventSelection(restorable?.subEvents ?? []);
      setAnswers(restorable?.answers ?? {});
      setSeatIds([]);
      // Consents are never restored — see lib/registration/draft.ts — and are
      // cleared with everything else when the event changes: they are an act
      // performed for one event, not a setting that travels.
      setTerms(false);
      setPrivacy(false);
      setDataUse(false);
      setStep(0);
      // Said out loud: fields that fill themselves in with no explanation read
      // as someone else's session, not as your own work coming back.
      setRestoredNotice(Boolean(restorable));
      /* eslint-enable react-hooks/set-state-in-effect */
    }
    setRestoredFor(draftKey(slug));
  }, [slug]);

  useEffect(() => {
    // Skipped on the render where the event has changed but its restore has
    // not landed — the render whose state still belongs to the event before.
    if (restoredFor !== draftKey(slug)) return;
    const draft: RegistrationDraft = {
      attendee: a,
      quantities: qty,
      optedIn,
      subEvents: subEventSelection,
      answers,
    };
    if (draftHasContent(draft)) saveDraft(slug, draft);
  }, [restoredFor, slug, a, qty, optedIn, subEventSelection, answers]);

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

  function missingAnswers(): string[] {
    return validateRequiredAnswers(
      scopedFields,
      Object.entries(answers).map(([fieldId, value]) => ({ fieldId, value })),
    );
  }

  /** Organiser questions that were actually answered, for the review step. */
  const answeredFields = scopedFields
    .map((field) => ({
      field,
      label: locale === "ar" && field.labelAr ? field.labelAr : field.labelEn,
      value:
        field.type === "checkbox"
          ? answers[field.id] === "true"
            ? "Yes"
            : ""
          : (answers[field.id] ?? "").trim(),
    }))
    .filter((row) => row.value !== "");

  // The title as it will actually be submitted, so the review block shows the
  // stored value and never the "Other" sentinel standing in front of it.
  const reviewTitle = resolveVisibleJobTitle(
    a.attendeeType === "company",
    a.jobTitle,
    a.jobTitleOther,
  );
  const confirmedJobTitle = reviewTitle.ok ? reviewTitle.value : null;

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
  /** One main ticket per person: a choice among tiers, not a set of counters. */
  const singleChoice = ticketsPerUserMain === 1;
  /**
   * Whether a single choice can be made at all.
   *
   * Switching tier frees the one being replaced, so the per-person MAIN cap can
   * never block it — but the overall cap counts sessions too, and those are
   * chosen on a later step the attendee can come Back from. Dropping this when
   * the toggles became radios let a selection exceed ticketsPerUserTotal with
   * nothing on screen saying so until the server refused the order.
   */
  const singleChoiceBlocked = singleChoice && 1 + subQty > ticketsPerUserTotal;
  const seatsRequired = !!seatSections && seatSections.length > 0;
  const seatsSatisfied = !seatsRequired || seatIds.length === totalQty;

  function next() {
    setErr(null);
    setErrField(null);
    if (step === 0) {
      // One field at a time, each named: "complete all required fields" left
      // the attendee to work out which of eight it meant.
      if (!a.firstName.trim()) return fail("Enter your first name.", fid.firstName);
      if (!a.lastName.trim()) return fail("Enter your last name.", fid.lastName);
      if (!a.email.trim()) return fail("Enter your email address.", fid.email);
      // The ticket QR is only reachable through the link emailed to this
      // address, so a malformed one is caught here rather than three steps
      // later by the server — and said in those terms, because "invalid email"
      // does not convey what it costs.
      if (!isValidEmail(a.email)) {
        return fail(
          "That email address doesn't look right. Your ticket is sent there, so please check it.",
          fid.email,
        );
      }
      if (!a.phone.trim()) return fail("Enter your phone number.", fid.phone);
      if (attendeeTypeEnabled) {
        if (attendeeTypeRequired && !a.attendeeType) {
          return fail("Select an attendee type.", fid.attendeeType);
        }
        if (a.attendeeType === "company" && !a.company.trim()) {
          return fail("Enter your company name.", fid.company);
        }
        // Same expression that decides whether the fields render, so the
        // wizard can never demand a title while the control is hidden.
        const title = resolveVisibleJobTitle(
          a.attendeeType === "company",
          a.jobTitle,
          a.jobTitleOther,
        );
        if (!title.ok) {
          return fail(
            title.error,
            a.jobTitle === JOB_TITLE_OTHER ? fid.jobTitleOther : fid.jobTitle,
          );
        }
      }
    }
    if (step === 1) {
      if (!hasTickets) return fail("Select at least one ticket to continue.");
      if (!seatsSatisfied) {
        return fail(
          `Select a seat for each ticket (${seatIds.length} of ${totalQty} chosen).`,
        );
      }
      const missing = missingAnswers();
      if (missing.length) return fail(`Please complete: ${missing.join(", ")}`);
    }
    setStep((s) => Math.min(CONFIRM_STEP, s + 1));
  }

  async function submit() {
    setErr(null);
    setErrField(null);
    // Named individually: three checkboxes and one sentence covering all of
    // them left the attendee comparing the message against the page.
    const unaccepted = [
      !terms && "the Terms and Conditions",
      !privacy && "the Privacy Policy",
      !dataUse && "the data-use consent",
    ].filter((v): v is string => typeof v === "string");
    if (unaccepted.length) {
      return fail(`Please accept ${listSentence(unaccepted)} to complete your registration.`);
    }
    if (!seatsSatisfied) {
      return fail(`Select a seat for each ticket (${seatIds.length} of ${totalQty} chosen).`);
    }
    // Still checked here: the answers belong to a step the attendee can go
    // back to, and a required one can be emptied after it was first filled in.
    const missing = missingAnswers();
    if (missing.length) {
      return fail(`Please complete: ${missing.join(", ")}`);
    }
    setBusy(true);
    const scopedAnswers = scopedFields
      .map((f) => ({ fieldId: f.id, value: answers[f.id] ?? "" }))
      .filter((x) => x.value.trim());
    const mainTickets = tickets
      .filter((t) => (qty[t.id] ?? 0) > 0)
      .map((t) => ({ itemId: t.id, quantity: qty[t.id] }));
    const allTickets = [...mainTickets, ...subEventSelection.filter((s) => s.quantity > 0)];
    // The same resolved value the Confirm step showed, so the "Other" sentinel
    // can never leave the form and what was reviewed is what is submitted.
    // next() has already rejected the invalid cases; if resolution still fails,
    // `confirmedJobTitle` is null — a blank line beats a badge and a public
    // profile that both read "Other".
    const jobTitle = confirmedJobTitle;
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
        jobTitle,
      },
      tickets: allTickets,
      seatIds: seatSections ? seatIds : undefined,
      answers: scopedAnswers,
      inviteToken,
      consentTerms: terms,
      consentPrivacy: privacy,
      consentDataUse: dataUse,
    });
    setBusy(false);
    // On success the action redirects; only errors return. The draft exists to
    // survive a reload mid-form, not to outlive the registration itself.
    if (!res) clearDraft(slug);
    if (res?.error) fail(res.error);
    if (res?.fieldErrors) {
      // The server rejected a value the attendee typed on step one, so send
      // them back to it rather than leaving the message stranded on Confirm.
      const returnTo = Object.keys(res.fieldErrors).find((k) => k in DETAIL_FIELDS);
      const message = describeFieldErrors(res.fieldErrors);
      if (returnTo) {
        setStep(0);
        fail(message, fid[DETAIL_FIELDS[returnTo].id]);
      } else {
        fail(message);
      }
    }
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
                {restoredNotice && (
                  <p
                    role="status"
                    className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm"
                  >
                    We kept what you had already filled in. You&rsquo;ll still need to
                    accept the consents at the last step.{" "}
                    <button
                      type="button"
                      className="font-semibold text-primary underline-offset-4 hover:underline"
                      onClick={() => {
                        clearDraft(slug);
                        setA({ ...EMPTY_ATTENDEE });
                        setQty({});
                        setOptedIn([]);
                        setSubEventSelection([]);
                        setAnswers({});
                        setSeatIds([]);
                        setRestoredNotice(false);
                      }}
                    >
                      Start over
                    </button>
                  </p>
                )}
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
                      {...invalidProps(fid.firstName)}
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
                      {...invalidProps(fid.lastName)}
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
                    {...invalidProps(fid.email)}
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
                    invalid={errField === fid.phone}
                    describedBy={errField === fid.phone ? fid.error : undefined}
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
                        {...invalidProps(fid.attendeeType)}
                        className="well h-11 w-full rounded-lg border border-input px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                        value={a.attendeeType}
                        onChange={(e) =>
                          setA({
                            ...a,
                            attendeeType: e.target.value,
                            // Clear a stale company name when leaving "Company".
                            company: e.target.value === "company" ? a.company : "",
                            // Same for the title: it belongs to the company
                            // answer, and a hidden leftover would be submitted.
                            jobTitle: e.target.value === "company" ? a.jobTitle : "",
                            jobTitleOther: e.target.value === "company" ? a.jobTitleOther : "",
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
                          {...invalidProps(fid.company)}
                          value={a.company}
                          onChange={(e) => setA({ ...a, company: e.target.value })}
                        />
                      </div>
                    )}
                    {a.attendeeType === "company" && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={fid.jobTitle}>Job title (optional)</Label>
                        <select
                          id={fid.jobTitle}
                          {...invalidProps(fid.jobTitle)}
                          className="well h-11 w-full rounded-lg border border-input px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                          value={a.jobTitle}
                          onChange={(e) =>
                            setA({
                              ...a,
                              jobTitle: e.target.value,
                              // Drop text typed behind "Other" when the choice
                              // moves away, so a stale value cannot be revived
                              // by picking "Other" again later.
                              jobTitleOther: e.target.value === JOB_TITLE_OTHER ? a.jobTitleOther : "",
                            })
                          }
                        >
                          <option value="">Select…</option>
                          {JOB_TITLE_PRESETS.map((preset) => (
                            <option key={preset} value={preset}>
                              {preset}
                            </option>
                          ))}
                          <option value={JOB_TITLE_OTHER}>{JOB_TITLE_OTHER}</option>
                        </select>
                      </div>
                    )}
                    {a.attendeeType === "company" && a.jobTitle === JOB_TITLE_OTHER && (
                      <div className="flex flex-col gap-1.5">
                        <Label htmlFor={fid.jobTitleOther}>
                          Your job title <RequiredMark />
                        </Label>
                        <Input
                          className="well h-11"
                          id={fid.jobTitleOther}
                          required
                          aria-required="true"
                          maxLength={JOB_TITLE_MAX}
                          {...invalidProps(fid.jobTitleOther)}
                          autoComplete="organization-title"
                          value={a.jobTitleOther}
                          onChange={(e) => setA({ ...a, jobTitleOther: e.target.value })}
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
                <div
                  // With a per-person cap of one, this is a single choice among
                  // the tiers — picking one used to grey out every other, which
                  // reads as broken until you work out that un-ticking yours
                  // brings them back. Radio semantics say so outright, and a
                  // second tap moves the choice instead of being refused.
                  role={singleChoice ? "radiogroup" : undefined}
                  aria-label={singleChoice ? "Choose your ticket" : undefined}
                  className="flex flex-col gap-5"
                >
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
                    {singleChoice ? (
                      <button
                        type="button"
                        role="radio"
                        aria-checked={(qty[t.id] ?? 0) > 0}
                        aria-label={t.title}
                        // Only ever blocked by the TOTAL cap, and only for a
                        // tier that is not the current choice: giving one up
                        // always leaves room for another.
                        disabled={singleChoiceBlocked && (qty[t.id] ?? 0) === 0}
                        onClick={() => {
                          const on = (qty[t.id] ?? 0) > 0;
                          if (!on && singleChoiceBlocked) return;
                          // Choosing replaces whatever was chosen before.
                          setQty(on ? {} : { [t.id]: 1 });
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
                </div>
                {/* The radio version has its own condition rather than no
                    message at all: a tier that cannot be chosen needs the same
                    explanation as a "+" that cannot be pressed. */}
                {(singleChoice
                  ? singleChoiceBlocked
                  : mainCapReached || totalCapReached) && (
                  <p className="text-sm text-muted-foreground">
                    {singleChoice || (totalCapReached && !mainCapReached)
                      ? `You can register for up to ${ticketsPerUserTotal} item(s) in total — remove a session to change your ticket.`
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
                    {/* The map needs to know how many seats this order is for,
                        so it can say so up front and stop at that number
                        rather than letting the mismatch surface on Next. */}
                    <SeatSelector
                      sections={seatSections}
                      value={seatIds}
                      onChange={setSeatIds}
                      required={totalQty}
                    />
                  </div>
                )}

                {scopedFields.length > 0 && (
                  <div className="mt-2 flex flex-col gap-4 rounded-[var(--radius-lg)] border border-border bg-card p-5 shadow-[var(--shadow-1)]">
                    <div className="font-medium">Additional details</div>
                    {scopedFields.map((f) => {
                      const label = locale === "ar" && f.labelAr ? f.labelAr : f.labelEn;
                      const ph = (locale === "ar" ? f.placeholderAr : f.placeholderEn) ?? "";
                      const help = locale === "ar" ? f.helpTextAr : f.helpTextEn;
                      const val = answers[f.id] ?? "";
                      const set = (v: string) => setAnswers((s) => ({ ...s, [f.id]: v }));
                      // These were the one field group in the wizard with no
                      // htmlFor/id pair, so every organiser question was
                      // announced unlabelled.
                      const fieldId = `${uid}-field-${f.id}`;
                      const helpId = help ? `${fieldId}-help` : undefined;
                      const cls =
                        "well h-11 w-full rounded-lg border border-input px-3 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";
                      return (
                        <div key={f.id} className="flex flex-col gap-1.5">
                          <Label htmlFor={fieldId}>
                            {label} {f.required ? <RequiredMark /> : null}
                          </Label>
                          {f.type === "textarea" ? (
                            <textarea
                              id={fieldId}
                              className="well w-full rounded-lg border border-input px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                              rows={3}
                              required={f.required}
                              aria-required={f.required || undefined}
                              aria-describedby={helpId}
                              value={val}
                              placeholder={ph}
                              onChange={(e) => set(e.target.value)}
                            />
                          ) : f.type === "select" || f.type === "multiselect" ? (
                            <select
                              id={fieldId}
                              className={cls}
                              required={f.required}
                              aria-required={f.required || undefined}
                              aria-describedby={helpId}
                              value={val}
                              onChange={(e) => set(e.target.value)}
                            >
                              <option value="">Select…</option>
                              {fieldOptions(f.options).map((o) => (
                                <option key={o} value={o}>
                                  {o}
                                </option>
                              ))}
                            </select>
                          ) : f.type === "checkbox" ? (
                            <label className="flex min-h-11 items-center gap-2 text-sm">
                              <input
                                id={fieldId}
                                type="checkbox"
                                className="size-5 accent-[var(--color-primary)]"
                                aria-describedby={helpId}
                                checked={val === "true"}
                                onChange={(e) => set(e.target.checked ? "true" : "")}
                              />
                              Yes
                            </label>
                          ) : (
                            <Input
                              id={fieldId}
                              className="well h-11"
                              type={f.type === "email" ? "email" : f.type === "date" ? "date" : "text"}
                              required={f.required}
                              aria-required={f.required || undefined}
                              aria-describedby={helpId}
                              value={val}
                              placeholder={ph}
                              onChange={(e) => set(e.target.value)}
                            />
                          )}
                          {help && (
                            <p id={helpId} className="text-xs text-muted-foreground">
                              {help}
                            </p>
                          )}
                        </div>
                      );
                    })}
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
                {/* The step is called Confirm, so it has to show what there is
                    to confirm. The email especially: it is the only route to
                    the ticket QR, and until now it was typed on step one and
                    never shown again — a typo was unrecoverable and invisible. */}
                <section className="flex flex-col gap-3">
                  <Eyebrow>Your details</Eyebrow>
                  <div className="rounded-[var(--radius-lg)] border border-border bg-card p-5 text-sm shadow-[var(--shadow-1)]">
                    <dl className="flex flex-col gap-2">
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Name</dt>
                        <dd className="min-w-0 text-end font-medium break-words">
                          {a.firstName} {a.lastName}
                        </dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Email</dt>
                        <dd className="min-w-0 text-end font-medium break-all">{a.email}</dd>
                      </div>
                      <div className="flex justify-between gap-4">
                        <dt className="text-muted-foreground">Phone</dt>
                        <dd className="min-w-0 text-end font-medium tabular-nums">
                          {a.phoneCC} {a.phone}
                        </dd>
                      </div>
                      {attendeeTypeEnabled && a.attendeeType && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Attendee type</dt>
                          <dd className="min-w-0 text-end font-medium capitalize">
                            {a.attendeeType}
                          </dd>
                        </div>
                      )}
                      {a.attendeeType === "company" && a.company.trim() && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Company</dt>
                          <dd className="min-w-0 text-end font-medium break-words">
                            {a.company.trim()}
                          </dd>
                        </div>
                      )}
                      {confirmedJobTitle && (
                        <div className="flex justify-between gap-4">
                          <dt className="text-muted-foreground">Job title</dt>
                          <dd className="min-w-0 text-end font-medium break-words">
                            {confirmedJobTitle}
                          </dd>
                        </div>
                      )}
                    </dl>
                    <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
                      Your ticket is emailed to this address.
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="lg"
                      className="mt-3 h-11"
                      onClick={() => setStep(0)}
                    >
                      Edit details
                    </Button>
                  </div>
                </section>
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
                {/* Read-only here: these were ASKED on the Tickets step, which
                    is the first point at which we know which of them apply.
                    Confirm reviews, it does not collect. */}
                {answeredFields.length > 0 && (
                  <section className="flex flex-col gap-3">
                    <Eyebrow>Additional details</Eyebrow>
                    <div className="rounded-[var(--radius-lg)] border border-border bg-card p-5 text-sm shadow-[var(--shadow-1)]">
                      <dl className="flex flex-col gap-2">
                        {answeredFields.map(({ field, label, value }) => (
                          <div key={field.id} className="flex justify-between gap-4">
                            <dt className="text-muted-foreground">{label}</dt>
                            <dd className="min-w-0 text-end font-medium break-words">{value}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  </section>
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
                {/* Worded by the organiser; shown verbatim. Do not paraphrase
                    to fit the layout — it is the text people consent to. */}
                <Checkbox checked={dataUse} onCheckedChange={setDataUse}>
                  <span>
                    By registering, you agree that your personal information will be used solely
                    for event-related purposes and will not be shared with any third party without
                    your prior consent, except where required by law.{" "}
                    <a
                      href={`/${locale}/legal/privacy-disclaimer`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      Read the full disclaimer
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
      <div role="alert" aria-live="assertive" id={fid.error} ref={errorRef} tabIndex={-1}>
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
