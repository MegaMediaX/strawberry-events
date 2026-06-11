import { createHmac, timingSafeEqual } from "node:crypto";

export interface InvitePayload {
  /** pretix event slug — must match the event the registrant is opening */
  ev: string;
  /** pretix item ids this invite unlocks */
  items: number[];
  /** role tag to assign the registrant (overrides itemTagMap) */
  tag?: "media" | "partner" | "speaker" | "staff" | "visitor";
  /** email-bound restriction (Phase B; ignored in Phase A) */
  email?: string;
  /** unix epoch seconds; absent = never expires */
  exp?: number;
}

function secret(): string {
  const s = process.env.MAGIC_LINK_SECRET || process.env.WEBHOOK_SECRET;
  if (!s) {
    if (process.env.NODE_ENV === "production") {
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

/** Produce a compact invite token: b64url(json).<hmac-sig> */
export function signInvite(p: InvitePayload): string {
  const body = b64url(JSON.stringify(p));
  return `${body}.${sign(body)}`;
}

/** Verify an invite token. Returns the payload or null if tampered/expired. */
export function verifyInvite(token: string): InvitePayload | null {
  const dot = token.lastIndexOf(".");
  if (dot < 1) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = sign(body);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  let payload: InvitePayload;
  try {
    const json = Buffer.from(
      body.replace(/-/g, "+").replace(/_/g, "/"),
      "base64",
    ).toString("utf8");
    payload = JSON.parse(json) as InvitePayload;
  } catch {
    return null;
  }

  if (payload.exp !== undefined && payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
