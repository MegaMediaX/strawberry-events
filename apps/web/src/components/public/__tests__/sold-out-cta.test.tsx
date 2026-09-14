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
const rail = (soldOut: boolean) =>
  renderToStaticMarkup(
    <TicketRail
      locale="en"
      slug="strawberry-summit"
      soldOut={soldOut}
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
      capacity={{ sold: 120, total: 120 }}
      calendar={{
        title: "Strawberry Summit",
        start: "2026-08-28T09:30:00.000Z",
        end: "2026-08-30T18:00:00.000Z",
        location: null,
        description: null,
      }}
    />,
  );

const bar = (soldOut: boolean) =>
  renderToStaticMarkup(
    <MobileCtaBar locale="en" slug="strawberry-summit" fromCents={0} soldOut={soldOut} />,
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
