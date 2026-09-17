// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

/**
 * The QR is stubbed to a component that settles ON DEMAND, because the whole
 * point of the reveal's gate is the window between "the plate is on screen"
 * and "the symbol is drawn". A stub that settles immediately would make that
 * window zero and the gate untestable.
 */
let settleQr: (() => void) | null = null;
vi.mock("../qr-code-display", async () => {
  const { useEffect } = await import("react");
  return {
    QrCodeDisplay: ({ value, onSettled }: { value: string; onSettled?: () => void }) => {
      useEffect(() => {
        settleQr = () => onSettled?.();
        return () => {
          settleQr = null;
        };
      }, [onSettled]);
      return <div data-testid="qr">{value}</div>;
    },
  };
});

import { AttendeeStateView } from "../attendee-state-view";
import { REVEAL_KEY_PREFIX } from "../ticket-reveal-memory";
import type { AttendeeView } from "@/lib/registration/attendee-view";

const order = (over: Partial<AttendeeView> = {}): AttendeeView =>
  ({
    orderCode: "ABC12",
    attendeeName: "Salwa Eid",
    approvalStatus: "not_required",
    status: "paid",
    pretixSecret: "secret-xyz",
    schedule: null,
    eventMapping: {
      titleEn: "LEBTECH 2026",
      titleAr: null,
      venueName: null,
      address: null,
      city: null,
      country: null,
      mapUrl: null,
      mapEmbedUrl: null,
      latitude: null,
      longitude: null,
      whatsappChannelUrl: null,
    },
    ...over,
  }) as unknown as AttendeeView;

const heading = () => screen.getByRole("heading", { level: 1 }).parentElement!;

beforeEach(() => {
  localStorage.clear();
  settleQr = null;
});

describe("the ticket's reveal", () => {
  /**
   * The gate that matters. A sweep of light over a pulsing grey placeholder is
   * a reveal of a loading state — the payoff is the code, so the code has to
   * be there first.
   */
  it("waits for the QR to be drawn before it plays", async () => {
    render(<AttendeeStateView order={order()} canRevealTicket />);
    expect(heading().className).not.toContain("ticket-sheen");

    settleQr!();
    await waitFor(() => expect(heading().className).toContain("ticket-sheen"));
  });

  /**
   * The bug this whole module exists for. That link is emailed, and what
   * people do with an emailed ticket is open it again — at the door, with a
   * scanner pointed at it.
   */
  it("plays once and never again for the same ticket", async () => {
    const first = render(<AttendeeStateView order={order()} canRevealTicket />);
    settleQr!();
    await waitFor(() => expect(heading().className).toContain("ticket-sheen"));
    expect(localStorage.getItem(`${REVEAL_KEY_PREFIX}ABC12`)).toBe("1");
    first.unmount();

    render(<AttendeeStateView order={order()} canRevealTicket />);
    settleQr!();
    // Give it every chance to play: settle, flush, and look again.
    await waitFor(() => expect(screen.getByTestId("qr")).toBeTruthy());
    expect(heading().className).not.toContain("ticket-sheen");
  });

  it("treats a different ticket as its own payoff", async () => {
    const first = render(<AttendeeStateView order={order()} canRevealTicket />);
    settleQr!();
    await waitFor(() => expect(heading().className).toContain("ticket-sheen"));
    first.unmount();

    render(<AttendeeStateView order={order({ orderCode: "XYZ99" })} canRevealTicket />);
    settleQr!();
    await waitFor(() => expect(heading().className).toContain("ticket-sheen"));
  });

  /**
   * No QR means nothing to wait for — a pending registration still gets its
   * one moment, it just has no code in it yet.
   */
  it("plays without waiting on a screen that has no QR", async () => {
    render(<AttendeeStateView order={order({ status: "pending" })} />);
    await waitFor(() => expect(heading().className).toContain("ticket-sheen"));
  });

  /**
   * Storage blocked or full answers "already seen", so the ticket is simply
   * the ticket. The failure mode that matters is the other one: replaying the
   * animation in a queue.
   */
  it("shows a plain ticket when storage cannot be trusted", async () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("SecurityError");
    });
    render(<AttendeeStateView order={order()} canRevealTicket />);
    settleQr!();
    await waitFor(() => expect(screen.getByTestId("qr")).toBeTruthy());
    expect(heading().className).not.toContain("ticket-sheen");
    spy.mockRestore();
  });

  /** Whatever happens, the code is on screen. */
  it("never withholds the QR waiting for an animation", () => {
    render(<AttendeeStateView order={order()} canRevealTicket />);
    expect(screen.getByTestId("qr").textContent).toBe("secret-xyz");
  });
});
