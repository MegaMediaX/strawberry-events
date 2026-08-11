import { PretixError, PretixValidationError } from "./errors";

export { PretixError };

const API_PREFIX = "/api/v1";

/**
 * Request timeouts. Node's undici defaults to a 300s headers/body timeout, which
 * is indistinguishable from "down" at a check-in desk: a stalled pretix would
 * hang every scan for five minutes while staff stare at a spinner and the queue
 * grows. Fail fast instead, so the operator can retry or fall back to the
 * printed list.
 *
 * REQUEST_TIMEOUT_MS covers single-object calls on the human-waiting path
 * (redeem, create order, mark paid). LIST_TIMEOUT_MS is the ceiling for
 * paginated sweeps, which are admin-side, legitimately slower, and never block
 * an attendee.
 */
const REQUEST_TIMEOUT_MS = 10_000;
const LIST_TIMEOUT_MS = 20_000;

interface PretixConfig {
  baseUrl: string;
  token: string;
}

/**
 * Resolve base URL (always env) and token. An explicit token (per-organizer,
 * resolved by the caller) takes precedence; otherwise the env token is used.
 */
function getConfig(explicitToken?: string): PretixConfig {
  const baseUrl = process.env.PRETIX_BASE_URL;
  const token = explicitToken ?? process.env.PRETIX_API_TOKEN;
  if (!baseUrl || !token) {
    throw new PretixError(
      "pretix is not configured (PRETIX_BASE_URL / PRETIX_API_TOKEN missing)",
    );
  }
  return { baseUrl: baseUrl.replace(/\/$/, ""), token };
}

interface Paginated<T> {
  count: number;
  next: string | null;
  results: T[];
}

/** Fetch an absolute URL with auth + error mapping. */
async function rawFetch<T>(
  url: string,
  token: string,
  init: RequestInit = {},
  timeoutMs: number = REQUEST_TIMEOUT_MS,
): Promise<T> {
  // The WHOLE exchange is wrapped, not just the fetch call. AbortSignal aborts
  // the body stream as well as the connection, and a saturated pretix typically
  // flushes headers and then stalls mid-body — so a timeout surfaces from
  // res.json(), not from fetch(). Mapping only the fetch would have left the
  // exact failure this timeout exists for escaping unmapped, reaching callers
  // as a raw DOMException and, at the check-in desk, a bare 500.
  try {
    const res = await fetch(url, {
      ...init,
      // A caller-supplied signal wins; otherwise bound the request.
      signal: init.signal ?? AbortSignal.timeout(timeoutMs),
      headers: {
        Authorization: `Token ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(init.headers as Record<string, string> | undefined),
      },
    });

    if (!res.ok) {
      let detail: unknown;
      try {
        detail = await res.json();
      } catch {
        detail = await res.text().catch(() => undefined);
      }
      if (
        res.status === 400 &&
        detail &&
        typeof detail === "object" &&
        !Array.isArray(detail)
      ) {
        throw new PretixValidationError(
          `pretix validation error for ${url}`,
          detail as Record<string, string[]>,
        );
      }
      throw new PretixError(
        `pretix API error ${res.status} for ${url}`,
        res.status,
        detail,
      );
    }

    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  } catch (err) {
    // Already-mapped errors pass through untouched — otherwise a 400 would be
    // rewritten as a 504 and every validation message would be lost.
    if (err instanceof PretixError) throw err;
    // AbortSignal.timeout rejects with a TimeoutError DOMException; a network
    // failure rejects with a TypeError. Both are opaque to callers, so map them
    // onto PretixError (504) with a message an operator can act on.
    if (err instanceof Error && err.name === "TimeoutError") {
      throw new PretixError(
        `pretix did not respond within ${timeoutMs}ms for ${url}`,
        504,
      );
    }
    throw new PretixError(
      `pretix is unreachable for ${url}: ${(err as Error).message}`,
      504,
    );
  }
}

/**
 * Low-level authenticated request to the pretix REST API. All adapter modules
 * must route through this — do not call pretix directly elsewhere.
 */
export async function pretixFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  token?: string,
): Promise<T> {
  const cfg = getConfig(token);
  return rawFetch<T>(`${cfg.baseUrl}${API_PREFIX}${path}`, cfg.token, init);
}

/**
 * Fetch every page of a paginated pretix list endpoint, following `next` URLs,
 * and return the concatenated `results`.
 */
export async function pretixFetchAll<T = unknown>(
  path: string,
  token?: string,
): Promise<T[]> {
  const cfg = getConfig(token);
  const { baseUrl } = cfg;
  token = cfg.token;
  let url: string | null = `${baseUrl}${API_PREFIX}${path}`;
  const out: T[] = [];

  while (url) {
    // Per-page ceiling, not a budget for the whole sweep: each page is its own
    // request, and a large catalogue legitimately takes several of them.
    const page: Paginated<T> = await rawFetch<Paginated<T>>(url, token, {}, LIST_TIMEOUT_MS);
    out.push(...page.results);
    url = page.next;
  }
  return out;
}

/** Smoke check used at startup/verification: hits the organizers list. */
export async function pretixHealthCheck(): Promise<boolean> {
  await pretixFetch("/organizers/");
  return true;
}
