import { vi } from "vitest";

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/**
 * Install a fetch spy that returns the queued responses in order.
 * Returns the spy so tests can assert on call arguments.
 */
export function installFetchMock(...responses: Response[]) {
  const spy = vi.spyOn(globalThis, "fetch");
  for (const r of responses) spy.mockResolvedValueOnce(r);
  return spy;
}

export function setPretixEnv() {
  process.env.PRETIX_BASE_URL = "https://pretix.example.com";
  process.env.PRETIX_API_TOKEN = "tok_123";
}
