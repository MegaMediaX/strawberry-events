import { describe, it, expect } from "vitest";
import { qrViewState } from "../qr-state";

describe("qrViewState", () => {
  it("is 'loading' before the data URL resolves and no error yet", () => {
    expect(qrViewState({ src: null, error: false })).toBe("loading");
  });

  it("is 'error' when generation failed and there is no data URL", () => {
    // This is the regression guard: previously a failed QR left src null
    // forever, so the view stayed in 'loading' and the attendee was stuck.
    expect(qrViewState({ src: null, error: true })).toBe("error");
  });

  it("is 'ready' once a data URL is available", () => {
    expect(qrViewState({ src: "data:image/png;base64,abc", error: false })).toBe(
      "ready",
    );
  });

  it("prefers 'ready' over 'error' if a data URL exists (success wins)", () => {
    expect(qrViewState({ src: "data:image/png;base64,abc", error: true })).toBe(
      "ready",
    );
  });
});
