import { authenticateRequest, ApiError, assertEventAccess, type ApiContext } from "./auth";
import { fail } from "./response";
import type { Scope } from "./scopes";
import { prisma } from "@/lib/db/client";

/**
 * Wrap an API route handler: authenticate (+ optional scope), run the handler,
 * and translate ApiError into the error envelope. Adds rate-limit headers.
 */
export async function withApi(
  request: Request,
  scope: Scope | null,
  fn: (ctx: ApiContext) => Promise<Response>,
): Promise<Response> {
  try {
    const ctx = await authenticateRequest(request, scope);
    const res = await fn(ctx);
    res.headers.set("X-RateLimit-Limit", String(ctx.rate.limit));
    res.headers.set("X-RateLimit-Remaining", String(ctx.rate.remaining));
    res.headers.set("X-RateLimit-Reset", String(Math.ceil(ctx.rate.resetAt / 1000)));
    return res;
  } catch (err) {
    if (err instanceof ApiError) {
      const res = fail(err.code, err.message, err.status);
      if (err.rate) res.headers.set("Retry-After", String(Math.max(1, Math.ceil((err.rate.resetAt - Date.now()) / 1000))));
      return res;
    }
    return fail("internal_error", "Unexpected error", 500);
  }
}

/** Standard 405 for unsupported methods (incl. DELETE — never destructive). */
export function methodNotAllowed() {
  return fail("method_not_allowed", "Method not allowed", 405);
}

/**
 * Resolve an event within the key's organization + event restrictions.
 * Returns null (→ 404 by caller) if not found or out of scope.
 */
export async function resolveApiEvent(ctx: ApiContext, eventId: string) {
  assertEventAccess(ctx, eventId);
  // Fail closed: a key with a null organizationId must not resolve any event.
  // Prisma drops `undefined` from a WHERE clause, so `organizationId ?? undefined`
  // would have matched events in ANY org — a cross-org read.
  if (!ctx.organizationId) {
    throw new ApiError("forbidden", "API key has no organization", 403);
  }
  return prisma.eventMapping.findFirst({
    where: { id: eventId, organizationId: ctx.organizationId },
  });
}
