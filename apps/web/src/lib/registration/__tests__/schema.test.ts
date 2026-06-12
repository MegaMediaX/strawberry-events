import { describe, it, expect } from "vitest";
import { registerInputSchema } from "@/lib/registration/schema";

const base = {
  eventSlug: "expo",
  attendee: { firstName: "A", lastName: "B", email: "a@b.com", phoneCC: "", phone: "" },
  tickets: [{ itemId: 1, quantity: 1 }],
  consentTerms: true as const,
  consentPrivacy: true as const,
};

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
