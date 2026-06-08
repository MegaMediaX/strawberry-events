import { PretixError } from "./errors";

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

/**
 * Low-level authenticated request to the pretix REST API. All adapter modules
 * must route through this — do not call pretix directly elsewhere.
 */
export async function pretixFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const { baseUrl, token } = getConfig();
  const url = `${baseUrl}${API_PREFIX}${path}`;

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
    throw new PretixError(
      `pretix API error ${res.status} for ${path}`,
      res.status,
      detail,
    );
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/** Smoke check used at startup/verification: hits the organizers list. */
export async function pretixHealthCheck(): Promise<boolean> {
  await pretixFetch("/organizers/");
  return true;
}
