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
