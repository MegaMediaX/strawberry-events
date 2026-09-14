import { describe, it, expect } from "vitest";

import { describeFieldErrors } from "../registration-wizard";

/**
 * A server-side rejection used to reach the attendee as the bare Zod text,
 * comma-joined — "Required, Enter a valid email address" on the Confirm step,
 * naming neither the field nor the step it belonged to.
 */
describe("describeFieldErrors", () => {
  it("names the field the attendee saw", () => {
    expect(describeFieldErrors({ email: ["Enter a valid email address"] })).toBe(
      "Email: Enter a valid email address",
    );
  });

  it("keeps several fields apart", () => {
    expect(
      describeFieldErrors({ firstName: ["Required"], phone: ["Required"] }),
    ).toBe("First name: Required · Phone: Required");
  });

  it("passes through a message for a field with no control of its own", () => {
    expect(describeFieldErrors({ tickets: ["Select at least one ticket"] })).toBe(
      "Select at least one ticket",
    );
  });
});
