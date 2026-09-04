import { describe, it, expect } from "vitest";
import { splitName, placeholderEmail } from "@/lib/registration/names";
import { registerInputSchema } from "@/lib/registration/schema";

describe("splitName", () => {
  it("splits a plain two-part name", () => {
    expect(splitName("Roy Boulos")).toEqual({ firstName: "Roy", lastName: "Boulos" });
  });

  it("keeps an honorific with the given name", () => {
    expect(splitName("Dr. Bachir Zoghbi")).toEqual({
      firstName: "Dr. Bachir",
      lastName: "Zoghbi",
    });
  });

  it("treats everything after the first token as the family name", () => {
    expect(splitName("Roy Bou Harb")).toEqual({ firstName: "Roy", lastName: "Bou Harb" });
  });

  it("repeats a mononym, because pretix rejects an empty family name", () => {
    expect(splitName("Madonna")).toEqual({ firstName: "Madonna", lastName: "Madonna" });
  });

  it("collapses irregular whitespace", () => {
    expect(splitName("  Roy   Boulos  ")).toEqual({ firstName: "Roy", lastName: "Boulos" });
  });

  it("survives an empty string rather than throwing mid-import", () => {
    expect(splitName("   ")).toEqual({ firstName: "", lastName: "" });
  });

  it("round-trips: first + last reproduces the supplied name", () => {
    for (const name of ["Roy Boulos", "Dr. Bachir Zoghbi", "Roy Bou Harb", "Hélène Waked"]) {
      const { firstName, lastName } = splitName(name);
      expect(`${firstName} ${lastName}`).toBe(name);
    }
  });
});

describe("placeholderEmail", () => {
  const ev = "lebtech-2026";

  it("is deterministic — the same person always maps to the same address", () => {
    expect(placeholderEmail(ev, "CIS Integration", "Roy Boulos"))
      .toBe(placeholderEmail(ev, "CIS Integration", "Roy Boulos"));
  });

  it("distinguishes same-named people at different companies", () => {
    expect(placeholderEmail(ev, "Potech", "Ali Sleiman"))
      .not.toBe(placeholderEmail(ev, "Dataconsult", "Ali Sleiman"));
  });

  it("uses the .invalid TLD so it can never reach a real inbox", () => {
    expect(placeholderEmail(ev, "GCS", "Joe Ayoub")).toMatch(/\.invalid$/);
  });

  it("strips accents and punctuation into a safe local part", () => {
    expect(placeholderEmail(ev, "Potech", "Hélène Waked"))
      .toBe("potech.helene-waked@lebtech-2026.invalid");
  });
});

describe("placeholderEmail — namesakes at the same company", () => {
  const ev = "lebtech-2026";

  it("gives two different people with the same name distinct addresses", () => {
    // Without this they collapsed onto one address, and a bulk importer's
    // idempotency check read the second person as the first and skipped them —
    // no error, no failed row, just someone who reaches the door with no ticket.
    expect(placeholderEmail(ev, "Bank of Beirut", "Georges Hanna", 1))
      .not.toBe(placeholderEmail(ev, "Bank of Beirut", "Georges Hanna", 2));
  });

  it("keeps occurrence 1 byte-identical to the un-numbered address", () => {
    // Anyone already registered holds the un-numbered address. If occurrence 1
    // ever diverged from it they would stop matching, and a re-run would issue
    // every one of them a second ticket.
    expect(placeholderEmail(ev, "Potech", "Hélène Waked", 1))
      .toBe("potech.helene-waked@lebtech-2026.invalid");
    expect(placeholderEmail(ev, "Potech", "Hélène Waked"))
      .toBe(placeholderEmail(ev, "Potech", "Hélène Waked", 1));
  });

  it("stays deterministic for a given occurrence", () => {
    expect(placeholderEmail(ev, "GCS", "Joe Ayoub", 3))
      .toBe(placeholderEmail(ev, "GCS", "Joe Ayoub", 3));
  });

  it("separates names that slug to the same local part", () => {
    // "Jean-Paul" and "Jean Paul" are different names that collapse to one
    // address, so a caller de-duplicating on the raw name would miss them and
    // collide anyway. Callers must count occurrences of the generated ADDRESS.
    const a = placeholderEmail(ev, "Acme", "Jean-Paul Aoun");
    const b = placeholderEmail(ev, "Acme", "Jean Paul Aoun");
    expect(a).toBe(b);
    expect(placeholderEmail(ev, "Acme", "Jean Paul Aoun", 2)).not.toBe(a);
  });
});

describe("placeholderEmail — accepted by the real registration schema", () => {
  // A placeholder that failed schema validation would abort a whole bulk
  // import, so this asserts against registerInputSchema itself rather than
  // re-stating its email pattern here.
  const base = {
    eventSlug: "expo",
    attendee: {
      firstName: "A",
      lastName: "B",
      email: "",
      phoneCC: "+961",
      phone: "70123456",
    },
    tickets: [{ itemId: 1, quantity: 1 }],
    consentTerms: true,
    consentPrivacy: true,
    consentDataUse: true,
  };

  it("accepts placeholders for names, honorifics and accents at any occurrence", () => {
    for (const name of ["Hélène Waked", "Dr. Bachir Zoghbi", "Roy Bou Harb", "Madonna"]) {
      for (const occurrence of [1, 2, 10]) {
        const email = placeholderEmail("lebtech-2026", "CIS Integration", name, occurrence);
        const parsed = registerInputSchema.safeParse({
          ...base,
          attendee: { ...base.attendee, email },
        });
        expect(parsed.success, `${email} was rejected`).toBe(true);
      }
    }
  });
});
