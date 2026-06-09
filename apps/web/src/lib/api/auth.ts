import { prisma } from "@/lib/db/client";
import { hashKey, isRevoked, isExpired, parseBearer } from "./keys";
import { hasScope, type Scope } from "./scopes";
import { checkRateLimit, type RateResult } from "./rate-limit";

export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
    public rate?: RateResult,
  ) {
    super(message);
  }
}

export interface ApiContext {
  keyId: string;
  organizationId: string | null;
  eventRestrictions: string[];
  scopes: string[];
  rate: RateResult;
}

/**
 * Authenticate an API request: resolve the Bearer key, reject
 * missing/revoked/expired, enforce the required scope, and apply the per-key
 * rate limit. Returns the request context (org + event restrictions).
 */
export async function authenticateRequest(
  request: Request,
  required: Scope | null,
): Promise<ApiContext> {
  const raw = parseBearer(request.headers.get("authorization"));
  if (!raw) throw new ApiError("unauthorized", "Missing or malformed API key", 401);

  const key = await prisma.apiKey.findUnique({ where: { keyHash: hashKey(raw) } });
  if (!key) throw new ApiError("unauthorized", "Invalid API key", 401);
  if (isRevoked(key)) throw new ApiError("revoked", "API key has been revoked", 401);
  if (isExpired(key)) throw new ApiError("expired", "API key has expired", 401);

  if (required && !hasScope(key.scopes, required)) {
    throw new ApiError("forbidden_scope", `Missing required scope: ${required}`, 403);
  }

  const rate = checkRateLimit(key.id, key.rateLimitPerMin);
  if (!rate.allowed) {
    throw new ApiError("rate_limited", "Rate limit exceeded", 429, rate);
  }

  // Sampled last-used update (best-effort, non-blocking).
  void prisma.apiKey
    .update({ where: { id: key.id }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  return {
    keyId: key.id,
    organizationId: key.organizationId,
    eventRestrictions: key.eventRestrictions,
    scopes: key.scopes,
    rate,
  };
}

/** Assert an event-scoped key may access this event (empty restrictions = all in org). */
export function assertEventAccess(ctx: ApiContext, eventId: string) {
  if (ctx.eventRestrictions.length > 0 && !ctx.eventRestrictions.includes(eventId)) {
    throw new ApiError("forbidden_event", "API key cannot access this event", 403);
  }
}
