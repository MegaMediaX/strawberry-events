import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ResultBanner } from "../result-banner";

const render = (result: Parameters<typeof ResultBanner>[0]["result"]) =>
  renderToStaticMarkup(<ResultBanner result={result} />);

describe("the session-ended banner is not a refusal", () => {
  const auth = {
    kind: "auth" as const,
    detail: "Your session has ended. Sign in again to keep checking people in.",
    signInHref: "/en/login",
  };

  it("says what happened and offers the way back", () => {
    const html = render(auth);
    expect(html).toContain("SESSION ENDED");
    expect(html).toContain("Sign in again");
    expect(html).toContain('href="/en/login"');
  });

  it("does not wear the refusal's words", () => {
    // "STOP" over a valid attendee is what sent operators hunting for a problem
    // with a ticket that was fine.
    const html = render(auth);
    expect(html).not.toContain("STOP");
    expect(html).not.toContain("ENTER");
  });

  it("still announces itself, like every other outcome", () => {
    expect(render(auth)).toContain('aria-live="assertive"');
  });

  it("leaves the refusal state alone", () => {
    const html = render({ kind: "err", name: "Not checked in", detail: "Ticket not found" });
    expect(html).toContain("STOP");
    expect(html).not.toContain("Sign in again");
  });
});
