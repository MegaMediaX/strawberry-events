import { describe, it, expect } from "vitest";
import { toAttendeeView } from "@/lib/registration/attendee-view";

/**
 * The leak these tests guard was invisible in the rendered markup: the QR was
 * correctly withheld, but the whole order row was still handed to a client
 * component and therefore serialized into the page HTML. So the assertions
 * below check the SERIALIZED form, not just the object's shape — a field that
 * survives JSON.stringify is a field that ships to the browser.
 */

const SECRET = "pretix-position-secret-abcdef123456";
const TOKEN = "magic-link-token-should-never-ship";

/** A full row, as Prisma returns it, with the columns that must not escape. */
const row = {
  orderCode: "ABCDE",
  status: "paid" as const,
  approvalStatus: "approved" as const,
  pretixSecret: SECRET,
  magicLinkToken: TOKEN,
  magicLinkVersion: 3,
  magicLinkRevokedAt: null,
  badgeSlug: "jane-doe-x7",
  roleTag: "speaker",
  email: "jane@example.com",
  phone: "70123456",
  attendeeName: "Jane Doe",
  userId: null,
  eventMapping: {
    id: "evt_1",
    titleEn: "LEBTECH 2026",
    whatsappChannelUrl: null,
    pretixEventSlug: "lebtech-2026",
    venueName: "Forum de Beyrouth",
    address: null,
    city: "Beirut",
    country: "LB",
    mapUrl: null,
    mapEmbedUrl: null,
    latitude: null,
    longitude: null,
  },
};

describe("toAttendeeView — the order-code surface", () => {
  const view = toAttendeeView(row, { revealSecret: false });
  const wire = JSON.stringify(view);

  it("does not ship the pretix secret", () => {
    expect(wire).not.toContain(SECRET);
  });

  it("does not ship the magic-link token", () => {
    expect(wire).not.toContain(TOKEN);
  });

  it("omits pretixSecret as a key entirely, rather than nulling it", () => {
    expect("pretixSecret" in view).toBe(false);
  });

  it("drops every other row column", () => {
    expect(Object.keys(view).sort()).toEqual([
      "approvalStatus",
      "eventMapping",
      "orderCode",
      "status",
    ]);
    for (const leaked of ["magicLinkToken", "badgeSlug", "roleTag", "email", "phone", "attendeeName", "userId"]) {
      expect(wire).not.toContain(leaked);
    }
  });

  it("drops event columns the attendee view does not need", () => {
    expect(wire).not.toContain("pretixEventSlug");
    expect(Object.keys(view.eventMapping)).not.toContain("id");
  });

  it("still carries what the page actually renders", () => {
    expect(view.orderCode).toBe("ABCDE");
    expect(view.eventMapping.titleEn).toBe("LEBTECH 2026");
    expect(view.eventMapping.venueName).toBe("Forum de Beyrouth");
    expect(view.status).toBe("paid");
    expect(view.approvalStatus).toBe("approved");
  });
});

describe("toAttendeeView — the authorized magic-link surface", () => {
  const view = toAttendeeView(row, { revealSecret: true });
  const wire = JSON.stringify(view);

  it("carries the secret, because this surface renders the QR", () => {
    expect(view.pretixSecret).toBe(SECRET);
  });

  it("still withholds the magic-link token and the rest of the row", () => {
    expect(wire).not.toContain(TOKEN);
    expect(wire).not.toContain("badgeSlug");
  });

  it("omits the secret key when the row has none", () => {
    const noSecret = toAttendeeView({ ...row, pretixSecret: null }, { revealSecret: true });
    expect("pretixSecret" in noSecret).toBe(false);
  });
});
