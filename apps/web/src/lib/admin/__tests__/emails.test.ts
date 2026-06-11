import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    emailLog: { findMany: vi.fn(), findUnique: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));
vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn() }));

import { prisma } from "@/lib/db/client";
import { sendEmail } from "@/lib/email/service";
import { listEmails, resendEmail } from "@/lib/admin/emails";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const sa: SessionContext = { userId: "su", isSuperAdmin: true, memberships: [] };
const orgAdmin: SessionContext = {
  userId: "a1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "f1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};
const checkin: SessionContext = {
  userId: "c1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "checkin_staff", assignedEventIds: [] }],
};

const log = { id: "e1", recipient: "a@b.com", subject: "Ticket", bodyText: "body", templateType: "ticket_issued", organizationId: "orgA", eventMappingId: null, attendeeRef: "ABC12" };

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.emailLog.findMany).mockResolvedValue([]);
  mock(prisma.emailLog.findUnique).mockResolvedValue(log);
  mock(sendEmail).mockResolvedValue(true);
});

describe("listEmails — scope", () => {
  it("super admin is unconstrained", async () => {
    await listEmails(sa);
    expect(mock(prisma.emailLog.findMany).mock.calls[0][0].where).toEqual({});
  });
  it("organizer admin is org-scoped", async () => {
    await listEmails(orgAdmin);
    expect(mock(prisma.emailLog.findMany).mock.calls[0][0].where).toEqual({ organizationId: { in: ["orgA"] } });
  });
  it("finance may view (org-scoped)", async () => {
    await listEmails(finance);
    expect(mock(prisma.emailLog.findMany).mock.calls[0][0].where).toEqual({ organizationId: { in: ["orgA"] } });
  });
  it("check-in staff cannot view", async () => {
    await expect(listEmails(checkin)).rejects.toThrow();
  });
});

describe("resendEmail", () => {
  it("super admin resends + audits", async () => {
    const res = await resendEmail(sa, "e1");
    expect(res).toEqual({ ok: true, sent: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(mock(prisma.auditLog.create).mock.calls[0][0].data.action).toBe("email.resent");
  });
  it("organizer admin resends within their org", async () => {
    await resendEmail(orgAdmin, "e1");
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });
  it("finance cannot resend", async () => {
    await expect(resendEmail(finance, "e1")).rejects.toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("check-in staff cannot resend", async () => {
    await expect(resendEmail(checkin, "e1")).rejects.toThrow();
  });
  it("impersonating cannot resend", async () => {
    await expect(resendEmail({ ...sa, impersonating: true }, "e1")).rejects.toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("cross-org resend is denied", async () => {
    mock(prisma.emailLog.findUnique).mockResolvedValue({ ...log, organizationId: "orgB" });
    await expect(resendEmail(orgAdmin, "e1")).rejects.toThrow();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("respects disabled mode (no fake success), still audited", async () => {
    mock(sendEmail).mockResolvedValue(false);
    const res = await resendEmail(sa, "e1");
    expect(res).toEqual({ ok: true, sent: false });
    expect(mock(prisma.auditLog.create).mock.calls[0][0].data.success).toBe(false);
  });
});
