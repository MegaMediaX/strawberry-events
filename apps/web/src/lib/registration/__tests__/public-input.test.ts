import { describe, it, expect } from "vitest";
import { publicRegisterFields } from "@/lib/registration/public-input";
import { registerInputSchema } from "@/lib/registration/schema";

/** Exactly what registration-wizard.tsx sends, and nothing more. */
const wizardPayload = {
  attendee: {
    firstName: "A",
    lastName: "B",
    email: "a@b.com",
    phoneCC: "+961",
    phone: "70123456",
    attendeeType: "company" as const,
    company: "Acme",
    jobTitle: "Engineer",
  },
  tickets: [{ itemId: 1, quantity: 1 }],
  seatIds: undefined,
  answers: [],
  inviteToken: undefined,
  consentTerms: true,
  consentPrivacy: true,
  consentDataUse: true,
};

describe("publicRegisterFields — staff-only fields are unreachable from the public action", () => {
  it.each(["roleTag", "roleLabel", "staffWalkIn", "userId", "consentSource"])(
    "drops %s from a crafted payload",
    (field) => {
      const allowed = publicRegisterFields({ ...wizardPayload, [field]: "x" });
      expect(allowed).not.toHaveProperty(field);
    },
  );

  it("passes the wizard's own payload through untouched", () => {
    expect(publicRegisterFields(wizardPayload)).toEqual(wizardPayload);
  });

  it("leaves an absent optional field absent rather than explicitly undefined", () => {
    // `key in obj` is true for an explicit undefined, so this guards the
    // distinction the schema's .default()s rely on.
    const allowed = publicRegisterFields({ tickets: [] });
    expect("consentTerms" in allowed).toBe(false);
  });

  it.each([null, undefined, "string", 42, []])("returns {} for non-object input %s", (input) => {
    expect(publicRegisterFields(input)).toEqual({});
  });
});

describe("publicRegisterFields — end to end through registerInputSchema", () => {
  const parsePublic = (values: unknown) =>
    registerInputSchema.safeParse({
      ...publicRegisterFields(values),
      eventSlug: "expo",
      locale: "en",
      consentSource: "web_form",
    });

  it("a payload claiming roleTag 'staff' does not yield a staff role", () => {
    const r = parsePublic({ ...wizardPayload, roleTag: "staff" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.roleTag).toBeUndefined();
  });

  it("staffWalkIn:true no longer waives the public phone requirement", () => {
    const r = parsePublic({
      ...wizardPayload,
      staffWalkIn: true,
      attendee: { ...wizardPayload.attendee, phoneCC: "", phone: "" },
    });
    expect(r.success).toBe(false);
    if (!r.success) {
      const paths = r.error.issues.map((i) => i.path.join("."));
      expect(paths).toContain("attendee.phone");
    }
  });

  it("a payload claiming another user's userId does not attach the order to them", () => {
    const r = parsePublic({ ...wizardPayload, userId: "clx000000000000000000000" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.userId).toBeUndefined();
  });

  it("the wizard's genuine payload still registers", () => {
    expect(parsePublic(wizardPayload).success).toBe(true);
  });
});
