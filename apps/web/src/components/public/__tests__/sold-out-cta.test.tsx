import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { TicketRail } from "../ticket-rail";
import { MobileCtaBar } from "../mobile-cta-bar";

/**
 * A sold-out event must render no route into the registration wizard.
 *
 * The previous markup was `<Link><Button disabled/></Link>`, which reads as
 * blocked and is not: the anchor keeps its place in the tab order, Enter
 * activates it, and a click landing outside the button activates it too. The
 * assertion is therefore about the ANCHOR, not about the button's disabled
 * attribute — checking the latter is what let this survive.
 */
const rail = (
  soldOut: boolean,
  ended = false,
  capacity: { sold: number; total: number | null } = { sold: 120, total: 120 },
) =>
  renderToStaticMarkup(
    <TicketRail
      locale="en"
      slug="strawberry-summit"
      soldOut={soldOut}
      ended={ended}
      tickets={[
        {
          id: 1,
          titleEn: "General admission",
          titleAr: null,
          descriptionEn: null,
          descriptionAr: null,
          priceCents: 0,
        },
      ]}
      capacity={capacity}
      calendar={{
        title: "Strawberry Summit",
        start: "2026-08-28T09:30:00.000Z",
        end: "2026-08-30T18:00:00.000Z",
        location: null,
        description: null,
      }}
    />,
  );

const bar = (soldOut: boolean, ended = false) =>
  renderToStaticMarkup(
    <MobileCtaBar
      locale="en"
      slug="strawberry-summit"
      fromCents={0}
      soldOut={soldOut}
      ended={ended}
    />,
  );

const REGISTER_HREF = 'href="/en/events/strawberry-summit/register"';

describe("sold out closes the registration route", () => {
  it("ticket rail links to registration while tickets remain", () => {
    expect(rail(false)).toContain(REGISTER_HREF);
  });

  it("ticket rail renders no registration link when sold out", () => {
    const html = rail(true);
    expect(html).not.toContain(REGISTER_HREF);
    expect(html).toContain("Sold out");
  });

  it("mobile bar links to registration while tickets remain", () => {
    expect(bar(false)).toContain(REGISTER_HREF);
  });

  it("mobile bar renders no registration link when sold out", () => {
    const html = bar(true);
    expect(html).not.toContain(REGISTER_HREF);
    expect(html).toContain("Sold out");
  });
});

/** Red is for actions. A closed control is a notice and must not carry it. */
const RED_FILL = "bg-primary";

describe("an ended event reads as closed, not as a broken action", () => {
  it("ticket rail renders no registration link and no red once ended", () => {
    const html = rail(false, true);
    expect(html).not.toContain(REGISTER_HREF);
    expect(html).toContain("This event has ended");
    expect(html).not.toContain(RED_FILL);
  });

  it("ticket rail drops the availability line once ended", () => {
    // Unlimited capacity renders "Open registration", which contradicted
    // "This event has ended" directly beneath it.
    const unlimited = { sold: 0, total: null };
    expect(rail(false, false, unlimited)).toContain("Open registration");
    expect(rail(false, true, unlimited)).not.toContain("Open registration");
  });

  it("mobile bar renders no registration link and no red once ended", () => {
    const html = bar(false, true);
    expect(html).not.toContain(REGISTER_HREF);
    expect(html).toContain("Ended");
    expect(html).not.toContain(RED_FILL);
  });

  it("sold out is not red either", () => {
    expect(rail(true)).not.toContain(RED_FILL);
    expect(bar(true)).not.toContain(RED_FILL);
  });
});
