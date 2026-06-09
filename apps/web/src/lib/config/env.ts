/**
 * Production environment validation (fail-fast).
 *
 * In production the app must refuse to run with missing, empty, weak, or
 * development-default secrets. In development the documented dev values are
 * accepted. Error messages NEVER include secret values — only variable names
 * and the reason.
 */

type Env = Record<string, string | undefined>;

/** Lowercased values that are obvious dev placeholders and must be rejected in prod. */
const WEAK_EXACT = new Set([
  "",
  "change_me",
  "changeme",
  "change-me",
  "dev-secret",
  "dev-webhook-secret",
  "secret",
  "password",
  "changeme!123",
  "dev-only-secret-change-me",
  "test",
  "example",
]);

/** Substrings that mark a value as a non-production placeholder. */
const WEAK_SUBSTRINGS = ["change_me", "changeme", "change-me", "dev-secret", "dev-only", "placeholder"];

function isWeak(value: string): boolean {
  const v = value.trim().toLowerCase();
  if (WEAK_EXACT.has(v)) return true;
  return WEAK_SUBSTRINGS.some((s) => v.includes(s));
}

/** A secret is acceptable in prod if present, not weak, and reasonably long. */
function checkSecret(env: Env, name: string, errors: string[], minLen = 16) {
  const v = env[name];
  if (!v || v.trim() === "") {
    errors.push(`${name} is required in production (missing or empty)`);
    return;
  }
  if (isWeak(v)) {
    errors.push(`${name} uses a development/default placeholder value; set a strong production secret`);
    return;
  }
  if (v.length < minLen) {
    errors.push(`${name} is too short for production (min ${minLen} chars)`);
  }
}

function checkPresent(env: Env, name: string, errors: string[]) {
  const v = env[name];
  if (!v || v.trim() === "") errors.push(`${name} is required in production (missing or empty)`);
  else if (isWeak(v)) errors.push(`${name} uses a development/default placeholder value`);
}

/**
 * Validate the environment. Returns a list of human-readable error strings
 * (empty when valid). Only enforces in production; dev/test always pass.
 * NEVER includes secret values in the messages.
 */
export function validateEnv(env: Env, nodeEnv: string | undefined): string[] {
  if (nodeEnv !== "production") return [];
  const errors: string[] = [];

  // Auth / signing / encryption secrets — must be strong.
  checkSecret(env, "AUTH_SECRET", errors);
  checkSecret(env, "MAGIC_LINK_SECRET", errors);
  checkSecret(env, "PRETIX_WEBHOOK_SECRET", errors);

  // Encryption key: must be present, non-weak, and decode to 32 bytes.
  const enc = env.ENCRYPTION_KEY;
  if (!enc || enc.trim() === "") {
    errors.push("ENCRYPTION_KEY is required in production (missing or empty)");
  } else if (isWeak(enc)) {
    errors.push("ENCRYPTION_KEY uses a development/default placeholder value");
  } else {
    try {
      if (Buffer.from(enc, "base64").length !== 32) {
        errors.push("ENCRYPTION_KEY must be a base64-encoded 32-byte key");
      }
    } catch {
      errors.push("ENCRYPTION_KEY must be valid base64");
    }
  }

  // Connection / URL config — must be present and non-placeholder.
  checkPresent(env, "DATABASE_URL", errors);
  checkPresent(env, "PRETIX_BASE_URL", errors);
  checkSecret(env, "PRETIX_API_TOKEN", errors, 8);

  // Public app URL must be HTTPS in production (secure cookies require it).
  const appUrl = env.APP_URL;
  if (!appUrl || appUrl.trim() === "") {
    errors.push("APP_URL is required in production (missing or empty)");
  } else if (!/^https:\/\//i.test(appUrl)) {
    errors.push("APP_URL must use https:// in production (secure cookies require HTTPS)");
  }

  // Outbound email: must be configured, or explicitly disabled.
  if (!env.SMTP_HOST && env.ALLOW_EMAIL_DISABLED_IN_PRODUCTION !== "true") {
    errors.push(
      "SMTP_HOST is required in production, or set ALLOW_EMAIL_DISABLED_IN_PRODUCTION=true to run without outbound email",
    );
  }

  return errors;
}

/**
 * Assert the live process environment is production-safe. Throws a single error
 * listing offending variable names (no secret values). No-op outside production.
 */
export function assertProductionEnv(env: Env = process.env, nodeEnv = process.env.NODE_ENV): void {
  const errors = validateEnv(env, nodeEnv);
  if (errors.length > 0) {
    throw new Error(
      "Invalid production environment configuration:\n" +
        errors.map((e) => `  - ${e}`).join("\n") +
        "\nRefusing to start. Set strong production secrets (see .env.production.example).",
    );
  }
}

/** Whether outbound email is intentionally disabled in production. */
export function isEmailDisabledInProduction(env: Env = process.env): boolean {
  return env.NODE_ENV === "production" && !env.SMTP_HOST && env.ALLOW_EMAIL_DISABLED_IN_PRODUCTION === "true";
}
