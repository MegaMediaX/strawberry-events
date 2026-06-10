"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { centsToPrice } from "@/lib/pretix/mappers";
import { Stepper } from "./stepper";
import { PhoneCountryField } from "./phone-country-field";
import { SeatSelector } from "@/components/seats/seat-selector";
import { getFieldsForTicket, validateRequiredAnswers, fieldOptions, type FieldDef } from "@/lib/forms/fields";
import { registerAction } from "@/app/[locale]/(public)/events/[slug]/register/actions";

interface WizardTicket {
  id: number;
  title: string;
  priceCents: number;
}

const STEPS = ["Details", "Tickets", "Confirm"];

export function RegistrationWizard({
  locale,
  slug,
  tickets,
  seatSections,
  customFields = [],
}: {
  locale: string;
  slug: string;
  tickets: WizardTicket[];
  seatSections?: import("@/components/seats/seat-selector").SectionNode[];
  customFields?: FieldDef[];
}) {
  const reduce = useReducedMotion();
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
  });
  const [qty, setQty] = useState<Record<number, number>>({});
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

  const totalCents = tickets.reduce(
    (sum, t) => sum + (qty[t.id] ?? 0) * t.priceCents,
    0,
  );
  const hasTickets = Object.values(qty).some((q) => q > 0);
  const totalQty = Object.values(qty).reduce((sum, q) => sum + (q ?? 0), 0);
  const seatsRequired = !!seatSections && seatSections.length > 0;
  const seatsSatisfied = !seatsRequired || seatIds.length === totalQty;

  function next() {
    setErr(null);
    if (step === 0) {
      if (!a.firstName || !a.lastName || !a.email || !a.phone) {
        setErr("Please complete all required fields.");
        return;
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
    setStep((s) => Math.min(2, s + 1));
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
    const res = await registerAction(locale, slug, {
      attendee: { ...a, company: a.company || null },
      tickets: tickets
        .filter((t) => (qty[t.id] ?? 0) > 0)
        .map((t) => ({ itemId: t.id, quantity: qty[t.id] })),
      seatIds: seatSections ? seatIds : undefined,
      answers: scopedAnswers,
      consentTerms: terms,
      consentPrivacy: privacy,
    });
    setBusy(false);
    // On success the action redirects; only errors return.
    if (res?.error) setErr(res.error);
    if (res?.fieldErrors)
      setErr(Object.values(res.fieldErrors).flat().join(", "));
  }

  const dir = reduce ? 0 : 24;

  return (
    <div className="mx-auto max-w-xl px-4 py-8 pb-28">
      <Stepper steps={STEPS} current={step} />
      <div className="mt-6 min-h-[280px]">
        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ x: dir, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -dir, opacity: 0 }}
            transition={{ duration: 0.22 }}
          >
            {step === 0 && (
              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>First name</Label>
                    <Input
                      autoComplete="given-name"
                      value={a.firstName}
                      onChange={(e) => setA({ ...a, firstName: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Last name</Label>
                    <Input
                      autoComplete="family-name"
                      value={a.lastName}
                      onChange={(e) => setA({ ...a, lastName: e.target.value })}
                    />
                  </div>
                </div>
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    autoComplete="email"
                    value={a.email}
                    onChange={(e) => setA({ ...a, email: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Phone</Label>
                  <PhoneCountryField
                    cc={a.phoneCC}
                    phone={a.phone}
                    onCc={(v) => setA({ ...a, phoneCC: v })}
                    onPhone={(v) => setA({ ...a, phone: v })}
                  />
                </div>
                <div>
                  <Label>Company (optional)</Label>
                  <Input
                    autoComplete="organization"
                    value={a.company}
                    onChange={(e) => setA({ ...a, company: e.target.value })}
                  />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="flex flex-col gap-3">
                {tickets.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between rounded-[var(--radius-lg)] border border-border p-3"
                  >
                    <div>
                      <div className="font-medium">{t.title}</div>
                      <div className="text-sm text-muted-foreground">
                        {t.priceCents === 0 ? "Free" : `$${centsToPrice(t.priceCents)}`}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() =>
                          setQty({ ...qty, [t.id]: Math.max(0, (qty[t.id] ?? 0) - 1) })
                        }
                      >
                        −
                      </Button>
                      <span className="w-6 text-center">{qty[t.id] ?? 0}</span>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => setQty({ ...qty, [t.id]: (qty[t.id] ?? 0) + 1 })}
                      >
                        +
                      </Button>
                    </div>
                  </div>
                ))}
                {seatSections && seatSections.length > 0 && (
                  <div className="mt-2 rounded-[var(--radius-lg)] border border-border p-3">
                    <div className="mb-2 font-medium">Choose your seat(s)</div>
                    <SeatSelector sections={seatSections} onChange={setSeatIds} />
                  </div>
                )}
              </div>
            )}

            {step === 2 && (
              <div className="flex flex-col gap-4">
                <div className="rounded-[var(--radius-lg)] border border-border p-3 text-sm">
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
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={terms}
                    onChange={(e) => setTerms(e.target.checked)}
                  />
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
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={privacy}
                    onChange={(e) => setPrivacy(e.target.checked)}
                  />
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
                </label>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {err && <p className="mt-3 text-sm text-destructive">{err}</p>}

      {/* Sticky bottom action bar */}
      <div className="fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border bg-background/90 px-4 py-3 backdrop-blur">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0 || busy}
        >
          Back
        </Button>
        {step < 2 ? (
          <Button type="button" onClick={next}>
            Next
          </Button>
        ) : (
          <Button type="button" onClick={submit} disabled={busy}>
            {busy ? "Submitting…" : "Complete registration"}
          </Button>
        )}
      </div>
    </div>
  );
}
