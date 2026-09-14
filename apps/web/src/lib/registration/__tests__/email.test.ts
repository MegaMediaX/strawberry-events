import { describe, it, expect } from "vitest";

import { isValidEmail } from "../email";
import { registerInputSchema } from "../schema";

/**
 * The wizard and the schema have to agree on what a usable address is: the
 * ticket QR is only reachable through the link sent to it, so anything the
 * form accepts and the server then rejects costs the attendee four filled-in
 * steps — and anything both accept but nobody can deliver to costs the ticket.
 */
describe("isValidEmail", () => {
  it("accepts ordinary addresses, with surrounding whitespace", () => {
    expect(isValidEmail("marven@strawberry.agency")).toBe(true);
    expect(isValidEmail("  first.last+tag@sub.example.co.uk  ")).toBe(true);
  });

  it("rejects the shapes that would silently never deliver", () => {
    expect(isValidEmail("")).toBe(false);
    expect(isValidEmail("marven")).toBe(false);
    expect(isValidEmail("marven@")).toBe(false);
    expect(isValidEmail("marven@localhost")).toBe(false);
    expect(isValidEmail("marven @strawberry.agency")).toBe(false);
    expect(isValidEmail("two@at@strawberry.agency")).toBe(false);
  });
});

describe("the schema applies the same rule", () => {
  const input = (email: string) => ({
    eventSlug: "strawberry-summit",
    locale: "en" as const,
    attendee: {
      firstName: "Marven",
      lastName: "Mouaalem",
      email,
      phoneCC: "+961",
      phone: "70123456",
    },
    tickets: [{ itemId: 1, quantity: 1 }],
    consentSource: "web_form" as const,
    consentTerms: true,
    consentPrivacy: true,
    consentDataUse: true,
  });

  it("passes an address the client accepted", () => {
    expect(registerInputSchema.safeParse(input("marven@strawberry.agency")).success).toBe(true);
  });

  it("rejects one the client would have caught first", () => {
    const parsed = registerInputSchema.safeParse(input("marven@localhost"));
    expect(parsed.success).toBe(false);
  });
});
