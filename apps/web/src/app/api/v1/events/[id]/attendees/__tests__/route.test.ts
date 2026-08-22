import { describe, it, expect, vi, beforeEach } from "vitest";

// The route's auth/rate-limit wrapper is covered by the api handler suite; here
// we only care about what the endpoint tells register() about consent.
vi.mock("@/lib/api/handler", () => ({
  withApi: (_request: Request, _scope: string | null, fn: (ctx: unknown) => Promise<Response>) =>
    fn({ organizationId: "orgA" }),
  resolveApiEvent: vi.fn(),
  methodNotAllowed: vi.fn(),
}));
vi.mock("@/lib/db/client", () => ({ prisma: { attendeeOrder: { findMany: vi.fn(), count: vi.fn() } } }));
vi.mock("@/lib/registration/service", () => ({ register: vi.fn() }));

import { resolveApiEvent } from "@/lib/api/handler";
import { register } from "@/lib/registration/service";
import { POST } from "@/app/api/v1/events/[id]/attendees/route";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const params = Promise.resolve({ id: "e1" });
const body = (extra: Record<string, unknown> = {}) =>
  new Request("https://app/api/v1/events/e1/attendees", {
    method: "POST",
    body: JSON.stringify({ email: "a@b.com", firstName: "A", lastName: "B", itemId: 7, ...extra }),
  });

beforeEach(() => {
  vi.clearAllMocks();
  mock(resolveApiEvent).mockResolvedValue({ id: "e1", pretixEventSlug: "expo" });
  mock(register).mockResolvedValue({
    orderCode: "API1", status: "paid", approvalStatus: "not_required", magicLinkToken: "t",
  });
});

describe("POST /api/v1/events/{id}/attendees — consent provenance", () => {
  it("registers with source 'api' and no consent when the caller asserts none", async () => {
    const res = await POST(body(), { params });
    expect(res.status).toBe(201);
    const arg = mock(register).mock.calls[0][0];
    expect(arg.consentSource).toBe("api");
    expect(arg.consentTerms).toBe(false);
    expect(arg.consentPrivacy).toBe(false);
  });

  it("passes through an explicit consent assertion from the integrator", async () => {
    await POST(body({ consentTerms: true, consentPrivacy: true, consentDataUse: true }), { params });
    const arg = mock(register).mock.calls[0][0];
    expect(arg.consentTerms).toBe(true);
    expect(arg.consentPrivacy).toBe(true);
  });

  it("treats a half-filled or non-boolean assertion as no consent", async () => {
    await POST(body({ consentTerms: true, consentPrivacy: "yes" }), { params });
    const arg = mock(register).mock.calls[0][0];
    expect(arg.consentTerms).toBe(true);
    expect(arg.consentPrivacy).toBe(false);
  });

  it("still requires the identity fields", async () => {
    const res = await POST(
      new Request("https://app/api/v1/events/e1/attendees", {
        method: "POST",
        body: JSON.stringify({ email: "a@b.com" }),
      }),
      { params },
    );
    expect(res.status).toBe(400);
    expect(register).not.toHaveBeenCalled();
  });
});
