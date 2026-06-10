import { createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const s = process.env.MAGIC_LINK_SECRET || process.env.WEBHOOK_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
      // Never sign with a public constant in production (forgeable ticket links).
      throw new Error("MAGIC_LINK_SECRET is required in production");
    }
    return "dev-secret";
  }
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

/** Produce an opaque token binding an order code, e.g. "<b64(code)>.<sig>". */
export function signMagicLink(orderCode: string): string {
  const p = b64url(orderCode);
  return `${p}.${sign(p)}`;
}

/** Verify a token and return the order code, or null if invalid/tampered. */
export function verifyMagicLink(token: string): string | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [p, sig] = parts;
  const expected = sign(p);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return Buffer.from(p.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString(
      "utf8",
    );
  } catch {
    return null;
  }
}
