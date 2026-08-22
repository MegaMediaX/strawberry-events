import { describe, it, expect } from "vitest";
import { registerInputSchema } from "@/lib/registration/schema";

const base = {
  eventSlug: "expo",
  attendee: { firstName: "A", lastName: "B", email: "a@b.com", phoneCC: "", phone: "" },
  tickets: [{ itemId: 1, quantity: 1 }],
  consentTerms: true as const,
  consentPrivacy: true, consentDataUse: true as const,
};

const validPhone = { phoneCC: "+961", phone: "70123456" };

describe("registerInputSchema — phone requirement", () => {
  it("public registration (no staffWalkIn) requires phone", () => {
    const r = registerInputSchema.safeParse(base);
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("attendee.phone");
      expect(paths).toContain("attendee.phoneCC");
    }
  });

  it("public registration with a valid phone passes", () => {
    const r = registerInputSchema.safeParse({
      ...base,
      attendee: { ...base.attendee, phoneCC: "+961", phone: "70123456" },
    });
    expect(r.success).toBe(true);
  });

  it("staff walk-in may omit phone", () => {
    const r = registerInputSchema.safeParse({
      ...base,
      staffWalkIn: true,
      attendee: { ...base.attendee, email: "a@b.com" },
    });
    expect(r.success).toBe(true);
    if (r.success) {
      expect(r.data.attendee.phone).toBe("");
      expect(r.data.attendee.phoneCC).toBe("");
    }
  });
});

describe("registerInputSchema — email requirement", () => {
  it("public registration requires email", () => {
    const r = registerInputSchema.safeParse({
      ...base,
      attendee: { ...base.attendee, email: "", phoneCC: "+961", phone: "70123456" },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join("."))).toContain("attendee.email");
    }
  });

  it("staff walk-in may omit email entirely", () => {
    const r = registerInputSchema.safeParse({ ...base, staffWalkIn: true });
    expect(r.success).toBe(true);
  });

  it("a provided email must be well-formed, even for a walk-in", () => {
    const r = registerInputSchema.safeParse({
      ...base,
      staffWalkIn: true,
      attendee: { ...base.attendee, email: "not-an-email" },
    });
    expect(r.success).toBe(false);
  });
});

describe("registerInputSchema — consent source", () => {
  const publicBase = { ...base, attendee: { ...base.attendee, ...validPhone } };

  it("defaults to the web form when no source is given", () => {
    const r = registerInputSchema.safeParse(publicBase);
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.consentSource).toBeUndefined();
  });

  it("web form registrations are rejected without every consent", () => {
    for (const missing of ["consentTerms", "consentPrivacy", "consentDataUse"] as const) {
      const r = registerInputSchema.safeParse({ ...publicBase, [missing]: false });
      expect(r.success).toBe(false);
      if (!r.success) {
        expect(r.error.issues.map((i) => i.path.join("."))).toContain(missing);
      }
    }
  });

  it("an omitted consent flag is treated as not given, not as accepted", () => {
    const noConsent: Record<string, unknown> = { ...publicBase };
    delete noConsent.consentTerms;
    delete noConsent.consentPrivacy;
    delete noConsent.consentDataUse;
    const r = registerInputSchema.safeParse(noConsent);
    expect(r.success).toBe(false);
  });

  it("staff walk-ins and API callers may record that no consent was collected", () => {
    for (const consentSource of ["staff_walkin", "api"] as const) {
      const r = registerInputSchema.safeParse({
        ...publicBase,
        consentSource,
        consentTerms: false,
        consentPrivacy: false, consentDataUse: false,
      });
      expect(r.success).toBe(true);
      if (r.success) {
        expect(r.data.consentSource).toBe(consentSource);
        expect(r.data.consentTerms).toBe(false);
      }
    }
  });

  it("rejects an unknown consent source", () => {
    const r = registerInputSchema.safeParse({ ...publicBase, consentSource: "carrier_pigeon" });
    expect(r.success).toBe(false);
  });
});

describe("registerInputSchema — attendee type", () => {
  it("Company attendee type requires a company name", () => {
    const r = registerInputSchema.safeParse({
      ...base,
      attendee: { ...base.attendee, ...validPhone, attendeeType: "company", company: "" },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join("."))).toContain("attendee.company");
    }
  });

  it("Company attendee type with a company name passes", () => {
    const r = registerInputSchema.safeParse({
      ...base,
      attendee: { ...base.attendee, ...validPhone, attendeeType: "company", company: "Acme" },
    });
    expect(r.success).toBe(true);
  });

  it("Student / Freelancer do not require a company name", () => {
    for (const attendeeType of ["student", "freelancer"] as const) {
      const r = registerInputSchema.safeParse({
        ...base,
        attendee: { ...base.attendee, ...validPhone, attendeeType },
      });
      expect(r.success).toBe(true);
    }
  });

  it("omitting attendee type is allowed (field disabled / optional)", () => {
    const r = registerInputSchema.safeParse({
      ...base,
      attendee: { ...base.attendee, ...validPhone },
    });
    expect(r.success).toBe(true);
  });

  it("rejects an unknown attendee type value", () => {
    const r = registerInputSchema.safeParse({
      ...base,
      attendee: { ...base.attendee, ...validPhone, attendeeType: "investor" },
    });
    expect(r.success).toBe(false);
  });
});

describe("the data-use disclaimer is a separate consent", () => {
  const publicBase = { ...base, attendee: { ...base.attendee, ...validPhone } };

  it("accepting the privacy policy does not imply accepting it", () => {
    // They are different statements. Folding one into the other would record a
    // consent the registrant never gave.
    const r = registerInputSchema.safeParse({
      ...publicBase,
      consentPrivacy: true,
      consentDataUse: false,
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      expect(r.error.issues.map((i) => i.path.join("."))).toContain("consentDataUse");
    }
  });

  it("is not required of the staff walk-in or API channels", () => {
    // Those channels are allowed to say "no consent was collected", which
    // yields a null consentAt — an honest gap beats a fabricated timestamp.
    for (const consentSource of ["staff_walkin", "api"] as const) {
      const r = registerInputSchema.safeParse({
        ...publicBase,
        consentSource,
        consentDataUse: false,
      });
      expect(r.success).toBe(true);
    }
  });
});
