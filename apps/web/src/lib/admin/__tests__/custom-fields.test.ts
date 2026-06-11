import { describe, it, expect, vi, beforeEach } from "vitest";
import type { SessionContext } from "@/lib/auth/types";

vi.mock("@/lib/db/client", () => ({
  prisma: {
    eventMapping: { findUnique: vi.fn() },
    customFormField: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
    auditLog: { create: vi.fn() },
  },
}));

import { prisma } from "@/lib/db/client";
import { getFieldsForTicket, validateRequiredAnswers, defineField, listFields, type FieldDef } from "@/lib/admin/custom-fields";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;

const sa: SessionContext = { userId: "su", isSuperAdmin: true, memberships: [] };
const orgAdminA: SessionContext = {
  userId: "a1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "organizer_admin", assignedEventIds: [] }],
};
const finance: SessionContext = {
  userId: "f1", isSuperAdmin: false,
  memberships: [{ organizationId: "orgA", role: "finance", assignedEventIds: [] }],
};

const mappingA = { id: "e1", organizationId: "orgA", localEventId: "loc1" };

const fields: FieldDef[] = [
  { id: "f1", ticketId: null, labelEn: "Company", labelAr: "شركة", type: "text", required: true, options: null },
  { id: "f2", ticketId: "7", labelEn: "Press ID", labelAr: null, type: "text", required: true, options: null },
  { id: "f3", ticketId: "9", labelEn: "Talk title", labelAr: null, type: "text", required: false, options: null },
];

beforeEach(() => {
  vi.clearAllMocks();
  mock(prisma.eventMapping.findUnique).mockResolvedValue(mappingA);
  mock(prisma.customFormField.create).mockResolvedValue({ id: "fNew" });
  mock(prisma.customFormField.findMany).mockResolvedValue(fields);
});

describe("getFieldsForTicket (pure)", () => {
  it("includes event-wide fields (ticketId null) for any ticket", () => {
    expect(getFieldsForTicket(fields, 7).map((f) => f.id)).toContain("f1");
  });
  it("includes a ticket-specific field only for its ticket", () => {
    expect(getFieldsForTicket(fields, 7).map((f) => f.id)).toEqual(["f1", "f2"]);
    expect(getFieldsForTicket(fields, 9).map((f) => f.id)).toEqual(["f1", "f3"]);
  });
  it("does not render another ticket's field", () => {
    expect(getFieldsForTicket(fields, 7).map((f) => f.id)).not.toContain("f3");
  });
});

describe("validateRequiredAnswers (pure)", () => {
  it("reports missing required fields", () => {
    const missing = validateRequiredAnswers(getFieldsForTicket(fields, 7), []);
    expect(missing).toContain("Company");
    expect(missing).toContain("Press ID");
  });
  it("passes when all required are answered", () => {
    const missing = validateRequiredAnswers(getFieldsForTicket(fields, 7), [
      { fieldId: "f1", value: "Acme" },
      { fieldId: "f2", value: "PRESS-1" },
    ]);
    expect(missing).toEqual([]);
  });
  it("treats whitespace-only as missing", () => {
    const missing = validateRequiredAnswers(getFieldsForTicket(fields, 7), [
      { fieldId: "f1", value: "  " },
      { fieldId: "f2", value: "x" },
    ]);
    expect(missing).toEqual(["Company"]);
  });
});

describe("defineField", () => {
  const input = { eventMappingId: "e1", labelEn: "Company", labelAr: "شركة", type: "text", required: true };

  it("super admin creates a field + audits", async () => {
    await defineField(sa, input);
    expect(prisma.customFormField.create).toHaveBeenCalledTimes(1);
    expect(mock(prisma.customFormField.create).mock.calls[0][0].data.organizationId).toBe("orgA");
    expect(prisma.auditLog.create).toHaveBeenCalled();
  });
  it("organizer admin creates within their org", async () => {
    await defineField(orgAdminA, input);
    expect(prisma.customFormField.create).toHaveBeenCalledTimes(1);
  });
  it("denies an event in another org", async () => {
    mock(prisma.eventMapping.findUnique).mockResolvedValue({ id: "e1", organizationId: "orgB", localEventId: "loc9" });
    await expect(defineField(orgAdminA, input)).rejects.toThrow();
    expect(prisma.customFormField.create).not.toHaveBeenCalled();
  });
  it("finance is blocked", async () => {
    await expect(defineField(finance, input)).rejects.toThrow();
  });
  it("impersonating is blocked", async () => {
    await expect(defineField({ ...sa, impersonating: true }, input)).rejects.toThrow();
    expect(prisma.customFormField.create).not.toHaveBeenCalled();
  });
});

describe("listFields", () => {
  it("returns fields for an accessible event", async () => {
    const res = await listFields(orgAdminA, "e1");
    expect(res).toHaveLength(3);
    expect(mock(prisma.customFormField.findMany).mock.calls[0][0].where).toEqual({ eventMappingId: "e1" });
  });
  it("denies a cross-org event", async () => {
    mock(prisma.eventMapping.findUnique).mockResolvedValue({ id: "e1", organizationId: "orgB", localEventId: "loc9" });
    await expect(listFields(orgAdminA, "e1")).rejects.toThrow();
  });
});
