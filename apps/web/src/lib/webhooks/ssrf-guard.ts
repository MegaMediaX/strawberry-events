import { lookup } from "node:dns/promises";

/** Raised when a webhook target URL is unsafe (bad scheme or private host). */
export class SsrfViolationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SsrfViolationError";
  }
}

function octets(addr: string): number[] | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  const o = parts.map((p) => Number(p));
  if (o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return o;
}

/** True for loopback, link-local, and RFC 1918 private IPv4 ranges. */
export function isPrivateIPv4(addr: string): boolean {
  const o = octets(addr);
  if (!o) return false;
  const [a, b] = o;
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 (incl. AWS IMDS 169.254.169.254)
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

/** True for IPv6 loopback, link-local (fe80::/10), and unique-local (fc00::/7). */
function isPrivateIPv6(addr: string): boolean {
  const a = addr.toLowerCase();
  if (a === "::1") return true;
  if (a.startsWith("fe80:") || a.startsWith("fe80::")) return true;
  if (a.startsWith("fc") || a.startsWith("fd")) return true; // fc00::/7
  return false;
}

function isBlockedHost(host: string): boolean {
  if (host === "localhost" || host === "0.0.0.0" || host === "::1") return true;
  if (host.endsWith(".local") || host.endsWith(".internal")) return true;
  if (isPrivateIPv4(host)) return true;
  if (host.includes(":") && isPrivateIPv6(host)) return true;
  return false;
}

/**
 * Reject operator-supplied webhook URLs that could be used for SSRF: require
 * https, block loopback/link-local/RFC-1918 literals statically, then resolve
 * DNS and reject if any address is private (closes the DNS-rebind vector).
 * Called both at webhook creation and before each delivery.
 */
export async function assertSafeWebhookUrl(raw: string): Promise<void> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new SsrfViolationError("Invalid URL");
  }
  if (url.protocol !== "https:") {
    throw new SsrfViolationError("Webhook URL must use https");
  }
  const host = url.hostname.replace(/^\[/, "").replace(/\]$/, "").toLowerCase();
  if (isBlockedHost(host)) {
    throw new SsrfViolationError("Webhook URL points to a private or local address");
  }

  let resolved: { address: string; family: number }[];
  try {
    resolved = await lookup(host, { all: true });
  } catch {
    throw new SsrfViolationError("Webhook host could not be resolved");
  }
  for (const r of resolved) {
    if (r.family === 4 && isPrivateIPv4(r.address)) {
      throw new SsrfViolationError("Webhook URL resolves to a private address");
    }
    if (r.family === 6 && isPrivateIPv6(r.address)) {
      throw new SsrfViolationError("Webhook URL resolves to a private address");
    }
  }
}
