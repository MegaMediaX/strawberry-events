import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Prefix marking the versioned ("v2") token format: "v2.<b64url(json)>.<sig>".
 *
 * The tag is separated by a "." on purpose. base64url has no "." in its
 * alphabet, so a legacy body — which is nothing but b64url(orderCode) — can
 * never begin with "v2.". That makes the two formats distinguishable by
 * inspection alone, with no ambiguity and no length heuristics.
 */
const V2 = "v2";

/** On-the-wire claim keys are kept short so the token stays URL-sized. */
interface WireClaims {
  /** order code */
  c: string;
  /** token version (see MagicLinkClaims.version) */
  v: number;
  /** unix epoch seconds; absent = never expires */
  e?: number;
}

/** Decoded contents of a magic-link token. */
export interface MagicLinkClaims {
  /** the attendee order code this token grants access to */
  code: string;
  /**
   * Version the issuing order was at when the link was minted. It must equal
   * AttendeeOrder.magicLinkVersion at lookup time — bumping that column is what
   * kills a leaked link. Legacy tokens carry no claim and decode as 0, which is
   * the column default, so every link already in an inbox keeps working.
   */
  version: number;
  /** unix epoch seconds; absent = never expires (the default) */
  exp?: number;
}

/** Options for minting a token. Passing none reproduces the legacy format. */
export interface SignMagicLinkOptions {
  /** order's magicLinkVersion at issue time; 0 (the default) means legacy. */
  version?: number;
  /**
   * Seconds until the link stops working. Omitted = never expires, which is
   * the deliberate default: a ticket link must still open at the door for an
   * event that may be months out.
   */
  expiresInSeconds?: number;
}

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

function b64urlDecode(input: string): string {
  return Buffer.from(
    input.replace(/-/g, "+").replace(/_/g, "/"),
    "base64",
  ).toString("utf8");
}

function sign(payload: string): string {
  return b64url(createHmac("sha256", secret()).update(payload).digest());
}

function signatureMatches(sig: string, expected: string): boolean {
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  // Length check first: timingSafeEqual throws on a length mismatch.
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Produce an opaque token binding an order code.
 *
 * With no options this emits the legacy two-part form "<b64(code)>.<sig>" —
 * byte-identical to what the registration flow has always produced. That is
 * intentional: hundreds of live orders hold tokens in that shape, and keeping
 * the default unchanged means this change cannot alter a link that is already
 * in someone's inbox or stored on an order row. The versioned format is opt-in
 * and is what rotation mints (see rotateOrderMagicLink).
 */
export function signMagicLink(
  orderCode: string,
  opts: SignMagicLinkOptions = {},
): string {
  const { version = 0, expiresInSeconds } = opts;

  if (version === 0 && expiresInSeconds === undefined) {
    const p = b64url(orderCode);
    return `${p}.${sign(p)}`;
  }

  const claims: WireClaims = { c: orderCode, v: version };
  if (expiresInSeconds !== undefined) {
    claims.e = Math.floor(Date.now() / 1000) + expiresInSeconds;
  }
  const body = `${V2}.${b64url(JSON.stringify(claims))}`;
  return `${body}.${sign(body)}`;
}

/**
 * Verify a token's signature and decode its claims, or null if the token is
 * malformed, tampered with, or past its (optional) expiry.
 *
 * Accepts both the legacy and the versioned format. Callers MUST still compare
 * `version` against the order row — see getOrderByToken. A signature only
 * proves we minted the link; it can say nothing about a revocation that
 * happened after the link was mailed.
 */
export function verifyMagicLinkClaims(token: string): MagicLinkClaims | null {
  // lastIndexOf rather than split("."): a versioned body contains a "." of its
  // own, so the old exact-two-parts check would reject every new token.
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  if (!signatureMatches(sig, sign(body))) return null;

  if (!body.startsWith(`${V2}.`)) {
    // Legacy format: the body is the bare b64url order code, no claims at all.
    // Version 0 is the compatibility floor — it matches the column default, so
    // these tokens stay valid until an operator bumps or revokes.
    try {
      const code = b64urlDecode(body);
      return code ? { code, version: 0 } : null;
    } catch {
      return null;
    }
  }

  let wire: WireClaims;
  try {
    wire = JSON.parse(b64urlDecode(body.slice(V2.length + 1))) as WireClaims;
  } catch {
    return null;
  }

  // The payload is signed, so this can only be our own malformed output — but
  // validate anyway rather than hand a caller an undefined order code.
  if (typeof wire.c !== "string" || !wire.c) return null;
  if (typeof wire.v !== "number" || !Number.isInteger(wire.v)) return null;

  if (wire.e !== undefined && wire.e < Math.floor(Date.now() / 1000)) return null;

  return { code: wire.c, version: wire.v, exp: wire.e };
}

/** Verify a token and return the order code, or null if invalid/tampered. */
export function verifyMagicLink(token: string): string | null {
  return verifyMagicLinkClaims(token)?.code ?? null;
}
