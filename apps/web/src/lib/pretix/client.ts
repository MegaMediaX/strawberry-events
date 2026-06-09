import { PretixError, PretixValidationError } from "./errors";

export { PretixError };

const API_PREFIX = "/api/v1";

interface PretixConfig {
  baseUrl: string;
  token: string;
}

function getConfig(): PretixConfig {
  const baseUrl = process.env.PRETIX_BASE_URL;
  const token = process.env.PRETIX_API_TOKEN;
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
): Promise<T> {
  const res = await fetch(url, {
    ...init,
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
}

/**
 * Low-level authenticated request to the pretix REST API. All adapter modules
 * must route through this — do not call pretix directly elsewhere.
 */
export async function pretixFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { baseUrl, token } = getConfig();
  return rawFetch<T>(`${baseUrl}${API_PREFIX}${path}`, token, init);
}

/**
 * Fetch every page of a paginated pretix list endpoint, following `next` URLs,
 * and return the concatenated `results`.
 */
export async function pretixFetchAll<T = unknown>(path: string): Promise<T[]> {
  const { baseUrl, token } = getConfig();
  let url: string | null = `${baseUrl}${API_PREFIX}${path}`;
  const out: T[] = [];

  while (url) {
    const page: Paginated<T> = await rawFetch<Paginated<T>>(url, token);
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
