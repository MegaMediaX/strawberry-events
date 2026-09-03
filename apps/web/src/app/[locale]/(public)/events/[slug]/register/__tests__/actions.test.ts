import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * These tests exist to cover the ONE line the security property rests on:
 * registerAction spreading `publicRegisterFields(values)` rather than the raw
 * payload. public-input.test.ts re-composes that call itself, so it would keep
 * passing if the action were reverted to `...(values as object)`.
 *
 * Note there is no second line of defense to fall back on. `register()` does
 * re-run `registerInputSchema.parse()`, but roleTag/userId/staffWalkIn are all
 * DECLARED fields — Zod strips unknown keys, not known ones — so re-parsing
 * passes them straight through. The allowlist in the action is the only thing
 * standing between a crafted payload and the created order.
 */

const { registerMock } = vi.hoisted(() => ({ registerMock: vi.fn() }));

vi.mock("@/lib/registration/service", () => ({ register: registerMock }));
vi.mock("@/lib/security/rate-limit", () => ({ rateLimit: () => ({ allowed: true }) }));
vi.mock("@/lib/security/client-ip", () => ({ clientIp: async () => "127.0.0.1" }));
vi.mock("next/navigation", () => ({
  // The real redirect() signals by throwing; mirror that so the action's
  // success path terminates the same way it does in production.
  redirect: (path: string) => {
    throw Object.assign(new Error("NEXT_REDIRECT"), { path });
  },
}));

import { registerAction } from "@/app/[locale]/(public)/events/[slug]/register/actions";

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
  answers: [],
  consentTerms: true,
  consentPrivacy: true,
  consentDataUse: true,
};

/** The action redirects on success, which our mock throws. */
async function callAction(values: unknown) {
  await expect(registerAction("en", "expo", values)).rejects.toThrow("NEXT_REDIRECT");
  expect(registerMock).toHaveBeenCalledTimes(1);
  return registerMock.mock.calls[0][0];
}

describe("registerAction — staff-only fields cannot cross the public boundary", () => {
  beforeEach(() => {
    registerMock.mockReset();
    registerMock.mockResolvedValue({
      orderCode: "ABCDE",
      status: "paid",
      approvalStatus: "approved",
      magicLinkToken: "tok",
    });
  });

  it("drops a crafted roleTag, userId and staffWalkIn before calling register()", async () => {
    const input = await callAction({
      ...wizardPayload,
      roleTag: "staff",
      roleLabel: "Access All Areas",
      staffWalkIn: true,
      userId: "clx000000000000000000000",
    });

    expect(input.roleTag).toBeUndefined();
    expect(input.roleLabel).toBeUndefined();
    expect(input.staffWalkIn).toBeUndefined();
    expect(input.userId).toBeUndefined();
  });

  it("pins the server-controlled fields regardless of what was sent", async () => {
    const input = await callAction({
      ...wizardPayload,
      eventSlug: "some-other-event",
      locale: "ar",
      consentSource: "staff_walkin",
    });

    expect(input.eventSlug).toBe("expo");
    expect(input.locale).toBe("en");
    expect(input.consentSource).toBe("web_form");
  });

  it("still forwards the wizard's own payload intact", async () => {
    const input = await callAction(wizardPayload);

    expect(input.attendee).toMatchObject(wizardPayload.attendee);
    expect(input.tickets).toEqual(wizardPayload.tickets);
    expect(input.consentTerms).toBe(true);
  });

  it("rejects an invalid payload without ever calling register()", async () => {
    const res = await registerAction("en", "expo", { ...wizardPayload, tickets: [] });

    expect(res.fieldErrors).toBeDefined();
    expect(registerMock).not.toHaveBeenCalled();
  });
});
