import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/lib/auth/session", () => ({ getSessionContext: vi.fn() }));

import { getSessionContext } from "@/lib/auth/session";
import { landingPathAction } from "@/app/[locale]/(auth)/login/actions";
import { ADMIN_ROLES, STAFF_ROLES } from "@/lib/auth/areas";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const session = (roles: string[], isSuperAdmin = false) => ({
  isSuperAdmin,
  memberships: roles.map((role) => ({ organizationId: "orgA", role, assignedEventIds: [], assignedSubEventIds: [] })),
});

beforeEach(() => vi.clearAllMocks());

describe("where login sends you", () => {
  it("sends check-in staff to the door screen, not the admin", async () => {
    // THE bug. /admin does not accept checkin_staff, so sending them there
    // bounced them back to /login — identical, from the operator's side, to a
    // rejected password. Debugged on a door laptop, it costs an hour.
    mock(getSessionContext).mockResolvedValue(session(["checkin_staff"]));
    expect(await landingPathAction("en")).toBe("/en/staff");
  });

  it("never sends anyone to an area their role cannot open", async () => {
    // The invariant, checked for every role rather than the one that broke.
    for (const role of ["super_admin", "organizer_admin", "finance", "workshop_organiser", "checkin_staff"]) {
      mock(getSessionContext).mockResolvedValue(session([role]));
      const dest = await landingPathAction("en");

      if (dest === "/en/admin") expect(ADMIN_ROLES).toContain(role);
      else if (dest === "/en/staff") expect(STAFF_ROLES).toContain(role);
      else expect(dest).toBe("/en/my-tickets");
    }
  });

  it("prefers the admin when someone can open both", async () => {
    mock(getSessionContext).mockResolvedValue(session(["organizer_admin"]));
    expect(await landingPathAction("en")).toBe("/en/admin");
  });

  it("sends attendees to their tickets", async () => {
    mock(getSessionContext).mockResolvedValue(session([]));
    expect(await landingPathAction("en")).toBe("/en/my-tickets");
  });

  it("sends a super admin to the admin", async () => {
    mock(getSessionContext).mockResolvedValue(session([], true));
    expect(await landingPathAction("en")).toBe("/en/admin");
  });

  it("sends a signed-out visitor back to login", async () => {
    mock(getSessionContext).mockResolvedValue(null);
    expect(await landingPathAction("en")).toBe("/en/login");
  });

  it("keeps the locale it was given", async () => {
    mock(getSessionContext).mockResolvedValue(session(["checkin_staff"]));
    expect(await landingPathAction("ar")).toBe("/ar/staff");
  });
});
