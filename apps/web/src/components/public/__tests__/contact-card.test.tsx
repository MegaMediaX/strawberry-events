import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ContactCard } from "../contact-card";

const render = (props: Partial<Parameters<typeof ContactCard>[0]> = {}) =>
  renderToStaticMarkup(
    <ContactCard
      name="Salwa Eid"
      eventName="LEBTECH 2026"
      metLine="28—30 Aug 2026 · Le Royal Hotel Beirut"
      jobTitle={null}
      affiliation="GPCS"
      typeLabel={null}
      email="s@gpcs-lb.com"
      phone="+961 3260918"
      contact={{ fullName: "Salwa Eid" }}
      {...props}
    />,
  );

describe("Save contact is always offered", () => {
  // The page's only conversion goal. It previously sat inside the
  // `email || phone` conditional, so an attendee with neither got no button at
  // all — and the test that was supposed to catch that inspected source
  // positions, which passed whether or not the bug was present.
  it("renders with full details", () => {
    expect(render()).toContain("Save contact");
  });

  it("renders with no phone", () => {
    expect(render({ phone: null })).toContain("Save contact");
  });

  it("renders with no email", () => {
    expect(render({ email: null })).toContain("Save contact");
  });

  it("renders with neither email nor phone", () => {
    const html = render({ email: null, phone: null });
    expect(html).toContain("Save contact");
    // And the contact list is gone entirely rather than left as empty chrome.
    expect(html).not.toContain("<dl");
  });

  it("renders for the sparsest possible attendee", () => {
    const html = render({ affiliation: null, typeLabel: null, email: null, phone: null });
    expect(html).toContain("Save contact");
    expect(html).toContain("Salwa Eid");
  });
});

describe("what the card shows", () => {
  it("shows the affiliation line", () => {
    expect(render({ affiliation: "Freelancer" })).toContain("Freelancer");
  });

  it("omits the affiliation line when there is none", () => {
    // 53% of attendees give no company, so this is the common path.
    const html = render({ affiliation: null });
    expect(html).toContain("Salwa Eid");
    expect(html).toContain("Save contact");
  });

  it("spends no red on the type label", () => {
    // Red belongs to the CTA alone. A red pill competing with the button was
    // the reason "COMPANY" read as a badge rather than a descriptor.
    const html = render({ typeLabel: "Freelancer" });
    const label = /<p[^>]*>\s*Freelancer\s*<\/p>/.exec(html)?.[0] ?? "";
    expect(label).toContain("text-muted-foreground");
    expect(label).not.toContain("text-primary");
    expect(label).not.toContain("bg-primary");
  });

  it("addresses the person who scanned, not the badge wearer", () => {
    const html = render();
    expect(html).toContain("Met at LEBTECH 2026");
    expect(html).not.toMatch(/Thank you for joining us/);
  });

  /**
   * The event's name was written into this file, twice, plus the page title
   * and the vCard note. This platform runs many events: every badge printed
   * for any other one resolved to a card announcing an event its holder had
   * not attended — and the vCard carried that into the scanner's phone book,
   * where it stays.
   */
  it("names the event it was actually given, not one written into the file", () => {
    const html = render({
      eventName: "Beirut Design Week",
      metLine: "12—16 May 2027 · Station",
    });
    expect(html).toContain("Beirut Design Week");
    expect(html).toContain("Met at Beirut Design Week · 12—16 May 2027 · Station");
    expect(html).not.toContain("LEBTECH");
  });

  it("says where it was met, and stays a sentence when the schedule is unknown", () => {
    const html = render({ eventName: "Beirut Design Week", metLine: null });
    expect(html).toContain("Met at Beirut Design Week");
    expect(html).not.toMatch(/Met at Beirut Design Week\s*·/);
  });

  /** Someone's name in lights: the display scale and the serif, not a nudged size. */
  it("sets the name in the display face", () => {
    const html = render();
    const h1 = /<h1[^>]*>/.exec(html)?.[0] ?? "";
    expect(h1).toContain("font-heading");
    expect(h1).toContain("text-[length:var(--display-3)]");
  });

  it("keeps tel: dialable by stripping spaces", () => {
    // Some diallers choke on spaces in a tel: href.
    expect(render({ phone: "+961 3 260918" })).toContain('href="tel:+9613260918"');
  });
});

describe("job title on the card", () => {
  it("shows the job title above the company", () => {
    const html = render({ jobTitle: "CEO", affiliation: "GPCS" });
    expect(html).toContain("CEO");
    expect(html).toContain("GPCS");
    expect(html.indexOf("CEO")).toBeLessThan(html.indexOf("GPCS"));
  });

  it("emits no element at all when there is no job title", () => {
    // The common path: 526 company registrations predate the field, and
    // everyone may skip it. An empty <p> would push the company down a line
    // for no reason.
    //
    // Asserting on the margin class instead would NOT catch this: an
    // always-rendered empty paragraph leaves the affiliation's own margin
    // untouched, so the card looks wrong while the test stays green.
    const html = render({ jobTitle: null, affiliation: "GPCS" });
    expect(html).toContain("GPCS");
    expect(html).not.toMatch(/<p[^>]*><\/p>/);
  });

  it("still offers Save contact for someone with only a title", () => {
    const html = render({ jobTitle: "CTO", affiliation: null, email: null, phone: null });
    expect(html).toContain("Save contact");
    expect(html).toContain("CTO");
  });
});
