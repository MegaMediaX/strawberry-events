export class PretixError extends Error {
  readonly status?: number;
  readonly detail?: unknown;

  constructor(message: string, status?: number, detail?: unknown) {
    super(message);
    this.name = "PretixError";
    this.status = status;
    this.detail = detail;
  }
}

/** Thrown on a pretix 400, carrying per-field validation messages. */
export class PretixValidationError extends PretixError {
  readonly fieldErrors: Record<string, string[]>;

  constructor(message: string, fieldErrors: Record<string, string[]>) {
    super(message, 400, fieldErrors);
    this.name = "PretixValidationError";
    this.fieldErrors = fieldErrors;
  }
}

/** Thrown by adapter functions whose implementation is deferred past M1. */
export class NotImplemented extends PretixError {
  constructor(operation: string) {
    super(`pretix adapter operation not implemented yet: ${operation}`);
    this.name = "NotImplemented";
  }
}

/**
 * Flatten pretix's nested field-error structure (e.g.
 * `{ positions: [{ attendee_name: ["This field is required."] }] }`) into
 * readable `path: message` lines. pretix's raw 400 body is otherwise opaque —
 * this makes the actual reason visible in logs and to the registrant instead of
 * a bare internal API URL.
 */
export function flattenFieldErrors(errors: unknown, path: string[] = []): string[] {
  if (errors == null) return [];
  if (typeof errors === "string") {
    return [path.length ? `${path.join(".")}: ${errors}` : errors];
  }
  if (Array.isArray(errors)) {
    return errors.flatMap((child, i) =>
      // Arrays of scalar messages don't need noisy numeric indices; arrays of
      // nested objects (e.g. positions) keep the index for locatability.
      flattenFieldErrors(child, typeof child === "string" ? path : [...path, String(i)]),
    );
  }
  if (typeof errors === "object") {
    return Object.entries(errors as Record<string, unknown>).flatMap(([k, v]) =>
      flattenFieldErrors(v, [...path, k]),
    );
  }
  return [path.length ? `${path.join(".")}: ${String(errors)}` : String(errors)];
}
