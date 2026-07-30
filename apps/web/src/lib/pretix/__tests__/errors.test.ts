import { describe, it, expect } from "vitest";
import {
  PretixError,
  PretixValidationError,
  NotImplemented,
  flattenFieldErrors,
} from "@/lib/pretix/errors";

describe("PretixValidationError", () => {
  it("is a PretixError with status 400 and field errors", () => {
    const err = new PretixValidationError("bad request", {
      email: ["This field is required."],
    });
    expect(err).toBeInstanceOf(PretixError);
    expect(err.status).toBe(400);
    expect(err.fieldErrors.email).toEqual(["This field is required."]);
  });
});

describe("NotImplemented", () => {
  it("is a PretixError", () => {
    expect(new NotImplemented("x")).toBeInstanceOf(PretixError);
  });
});

describe("flattenFieldErrors", () => {
  it("flattens a simple top-level field error", () => {
    expect(flattenFieldErrors({ email: ["This field is required."] })).toEqual([
      "email: This field is required.",
    ]);
  });

  it("flattens nested position errors with an index for locatability", () => {
    expect(
      flattenFieldErrors({
        positions: [{ attendee_name: ["This field is required."] }],
      }),
    ).toEqual(["positions.0.attendee_name: This field is required."]);
  });

  it("keeps distinct positions apart", () => {
    expect(
      flattenFieldErrors({
        positions: [
          {},
          { attendee_email: ["Enter a valid email address."] },
        ],
      }),
    ).toEqual(["positions.1.attendee_email: Enter a valid email address."]);
  });

  it("handles a bare detail string and non-field errors", () => {
    expect(flattenFieldErrors({ detail: "Not found." })).toEqual([
      "detail: Not found.",
    ]);
    expect(flattenFieldErrors({ __all__: ["Something went wrong."] })).toEqual([
      "__all__: Something went wrong.",
    ]);
  });

  it("returns nothing for empty input", () => {
    expect(flattenFieldErrors({})).toEqual([]);
    expect(flattenFieldErrors(null)).toEqual([]);
  });
});
