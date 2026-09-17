// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const toDataURL = vi.fn();
vi.mock("qrcode", () => ({ default: { toDataURL: (...a: unknown[]) => toDataURL(...a) } }));

import { QrCodeDisplay, QR_QUIET_ZONE_MODULES } from "../qr-code-display";

beforeEach(() => vi.clearAllMocks());

describe("the QR reports when it has settled", () => {
  it("settles once the symbol is drawn", async () => {
    toDataURL.mockResolvedValue("data:image/png;base64,AAA");
    const onSettled = vi.fn();
    render(<QrCodeDisplay value="secret-xyz" onSettled={onSettled} />);
    await waitFor(() => expect(screen.getByTestId("qr-image")).toBeTruthy());
    expect(onSettled).toHaveBeenCalledTimes(1);
  });

  /**
   * A FAILURE settles too, and this is the case that matters.
   *
   * When generation fails the fallback is a readable code that still gets
   * someone through a door — as much the payoff as the symbol would have
   * been. A screen that holds its reveal for a QR that is never coming waits
   * forever, and it waits hardest for the attendee whose ticket already went
   * wrong.
   */
  it("settles when generation fails, so the screen never waits forever", async () => {
    toDataURL.mockRejectedValue(new Error("no canvas"));
    const onSettled = vi.fn();
    render(<QrCodeDisplay value="secret-xyz" onSettled={onSettled} />);
    await waitFor(() => expect(screen.getByTestId("qr-fallback")).toBeTruthy());
    expect(onSettled).toHaveBeenCalledTimes(1);
    // And the code itself is on screen, which is the actual promise.
    expect(screen.getByTestId("qr-fallback").textContent).toContain("secret-xyz");
  });

  it("does not settle while still generating", () => {
    toDataURL.mockReturnValue(new Promise(() => {}));
    const onSettled = vi.fn();
    render(<QrCodeDisplay value="secret-xyz" onSettled={onSettled} />);
    expect(onSettled).not.toHaveBeenCalled();
  });

  /** The quiet zone is a scanning property, not a style. It rides along here. */
  it("still asks for the standard quiet zone", async () => {
    toDataURL.mockResolvedValue("data:image/png;base64,AAA");
    render(<QrCodeDisplay value="secret-xyz" />);
    await waitFor(() => expect(toDataURL).toHaveBeenCalled());
    expect(toDataURL.mock.calls[0][1]).toMatchObject({ margin: QR_QUIET_ZONE_MODULES });
    expect(QR_QUIET_ZONE_MODULES).toBeGreaterThanOrEqual(4);
  });

  /**
   * A caller passing an inline arrow — which is what a caller does — must not
   * restart QR generation on every render.
   */
  it("does not regenerate when the callback identity changes", async () => {
    toDataURL.mockResolvedValue("data:image/png;base64,AAA");
    const { rerender } = render(<QrCodeDisplay value="secret-xyz" onSettled={() => {}} />);
    await waitFor(() => expect(toDataURL).toHaveBeenCalledTimes(1));
    rerender(<QrCodeDisplay value="secret-xyz" onSettled={() => {}} />);
    rerender(<QrCodeDisplay value="secret-xyz" onSettled={() => {}} />);
    expect(toDataURL).toHaveBeenCalledTimes(1);
  });
});
