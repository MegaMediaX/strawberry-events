import { describe, it, expect, vi } from "vitest";

// framer-motion is stubbed to a plain div: this suite is about what reaches the
// markup, not about animation.
vi.mock("framer-motion", async () => {
  const { createElement } = await import("react");
  return {
    motion: {
      div: (props: { children?: unknown; className?: string }) =>
        createElement("div", { className: props.className }, props.children as never),
    },
  };
});

// The real QR renders asynchronously in an effect, which never runs under
// renderToStaticMarkup. Stub it so the secret it was handed is visible in the
// output — otherwise this suite would pass even if the QR were rendered.
vi.mock("../qr-code-display", async () => {
  const { createElement } = await import("react");
  return {
    QrCodeDisplay: (props: { value: string }) =>
      createElement("div", { "data-testid": "qr" }, props.value),
  };
});

import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AttendeeStateView } from "../attendee-state-view";

const SECRET = "pretix-position-secret-abc123";

const issuedOrder = {
  orderCode: "3XKQ7",
  status: "paid",
  approvalStatus: "not_required",
  pretixSecret: SECRET,
  eventMapping: { titleEn: "Demo Expo" },
} as const;

const render = (props: Parameters<typeof AttendeeStateView>[0]) =>
  renderToStaticMarkup(createElement(AttendeeStateView, props));

describe("AttendeeStateView — ticket secret boundary", () => {
  it("withholds the pretix secret by default (fail closed)", () => {
    // No canRevealTicket prop at all: a route that forgets to opt in must not
    // leak a scannable ticket.
    const html = render({ order: issuedOrder });
    expect(html).not.toContain(SECRET);
    expect(html).not.toContain('data-testid="qr"');
  });

  it("withholds the pretix secret when explicitly not authorized", () => {
    const html = render({ order: issuedOrder, canRevealTicket: false });
    expect(html).not.toContain(SECRET);
  });

  it("renders the QR with the pretix secret on the authorized (magic-link) surface", () => {
    const html = render({ order: issuedOrder, canRevealTicket: true });
    expect(html).toContain(SECRET);
    expect(html).toContain("Present this QR at the entrance.");
  });

  it("still shows the order status and event when the QR is withheld", () => {
    const html = render({ order: issuedOrder });
    expect(html).toContain("You&#x27;re in!");
    expect(html).toContain("Demo Expo");
    expect(html).toContain("3XKQ7");
  });

  it("renders the injected recovery affordance only when the QR is withheld", () => {
    const recovery = createElement("span", null, "resend-slot");
    expect(render({ order: issuedOrder, ticketRecovery: recovery })).toContain("resend-slot");
    expect(
      render({ order: issuedOrder, canRevealTicket: true, ticketRecovery: recovery }),
    ).not.toContain("resend-slot");
  });

  it("never renders a QR for pending approval, even on the authorized surface", () => {
    const html = render({
      order: { ...issuedOrder, status: "pending", approvalStatus: "pending" },
      canRevealTicket: true,
    });
    expect(html).not.toContain(SECRET);
    expect(html).toContain("Registration under review");
  });

  it("never renders a QR for pending payment, even on the authorized surface", () => {
    const html = render({
      order: { ...issuedOrder, status: "pending", approvalStatus: "not_required" },
      canRevealTicket: true,
    });
    expect(html).not.toContain(SECRET);
    expect(html).toContain("Payment pending");
  });

  it("falls back to the order code, not the secret, when no secret is stored", () => {
    const html = render({
      order: { ...issuedOrder, pretixSecret: null },
      canRevealTicket: true,
    });
    expect(html).toContain('data-testid="qr"');
    expect(html).not.toContain(SECRET);
  });
});
