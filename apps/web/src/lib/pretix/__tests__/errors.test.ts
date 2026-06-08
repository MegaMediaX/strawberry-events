import { describe, it, expect } from "vitest";
import {
  PretixError,
  PretixValidationError,
  NotImplemented,
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
