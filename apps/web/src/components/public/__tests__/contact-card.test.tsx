import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { ContactCard } from "../contact-card";

const render = (props: Partial<Parameters<typeof ContactCard>[0]> = {}) =>
  renderToStaticMarkup(
    <ContactCard
      name="Salwa Eid"
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

  it("keeps tel: dialable by stripping spaces", () => {
    // Some diallers choke on spaces in a tel: href.
    expect(render({ phone: "+961 3 260918" })).toContain('href="tel:+9613260918"');
  });
});
