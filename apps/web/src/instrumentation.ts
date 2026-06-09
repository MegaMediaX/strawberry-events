/**
 * Next.js instrumentation hook — runs once at server startup.
 * Fail fast in production if the environment is misconfigured (weak/missing secrets).
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { assertProductionEnv } = await import("@/lib/config/env");
    assertProductionEnv();
  }
}
