import { prisma } from "@/lib/db/client";
import { rateLimit } from "@/lib/security/rate-limit";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { generateCode, hashCode, verifyCode } from "@/lib/tokens/verification-code";
import { sendEmail } from "@/lib/email/service";
import { verifyEmailCodeEmail, type Locale } from "@/lib/email/templates";

const TTL_MS = 10 * 60 * 1000;

/**
 * Wrong guesses allowed against one code. Five, against a 10^6 space, over a
 * ten-minute life — and the counter lives in the row, not in the in-memory
 * limiter, because that map is wiped on every deploy and CI recreates the
 * container on every merge.
 */
export const MAX_ATTEMPTS = 5;

/**
 * One string for every failure: wrong code, expired code, no code, locked out,
 * address that never had one. Any distinction here would answer the question
 * `registerAttendee` refuses to answer, one step later in the same flow.
 */
export const CODE_REJECTED =
  "That code isn't right, or it's expired. Request a new one.";

/**
 * The account just verified rides on the SUCCESS branch, and a union is what
 * makes that a guarantee rather than a hope.
 *
 * The caller needs the id to sweep this address's registrations onto the
 * account, and it cannot look the user up itself: the signup verify action is
 * unauthenticated and deliberately knows nothing about whether an account
 * exists. With `userId?: string` on a flat interface, a success path that
 * forgot to set it would compile, run, and silently link nothing — which is
 * precisely the bug claim-on-verify was written to fix, reintroduced with no
 * type error and no failing test. As a union it cannot be returned without one.
 *
 * `?: never` on each side keeps `res.error` and `res.userId` readable on an
 * unnarrowed result, so callers that only check `ok` are unaffected.
 *
 * Actions must not pass `userId` to the client — it is for server-side
 * follow-up work only.
 */
export type CheckResult =
  | { ok: true; userId: string; error?: never }
  | { ok: false; error: string; userId?: never };

/**
 * The handle proving you are the one who ASKED for a code.
 *
 * High-entropy and random, so sha256 is the right hash here for the same
 * reason it is wrong for the six-digit code itself: nothing is guessable, and
 * a deterministic digest is all the comparison needs.
 */
export function newFlowToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashFlowToken(token) };
}

export function hashFlowToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Constant-time, so a mismatch cannot be found a character at a time. */
function flowMatches(stored: string, presented: string): boolean {
  const a = Buffer.from(stored, "hex");
  const b = Buffer.from(hashFlowToken(presented), "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface MintedCode {
  code: string;
  codeHash: string;
  /** Give this to the requester; its hash is what gets stored. */
  flowToken: string;
  flowHash: string;
}

/**
 * Generate a code and hash it, WITHOUT deciding whether it will be used.
 *
 * Split out from storing it so the caller can pay the argon2 cost on every
 * path. `registerAttendee` mints one whether or not it goes on to create an
 * account, for the same reason it hashes the password either way: a ~20ms
 * branch-dependent cost is a timing oracle, and the whole point of that flow is
 * that the two branches are indistinguishable.
 */
export async function mintCode(flowToken: string): Promise<MintedCode> {
  const code = generateCode();
  /**
   * The flow token is REQUIRED, not defaulted.
   *
   * It must be minted by the caller, because the caller is what hands it to the
   * browser — and it has to do that on every branch, so that its existence says
   * nothing about whether a code was issued.
   *
   * Minting one here as a fallback looked harmless and was not: the hash would
   * be stored for a token nobody ever received, so the code would be
   * permanently unverifiable and the person would simply never get in. A
   * required parameter turns that silent trap into a compile error.
   */
  return {
    code,
    codeHash: await hashCode(code),
    flowToken,
    flowHash: hashFlowToken(flowToken),
  };
}

/**
 * Store a minted code against an address and mail it.
 *
 * This flow's previous live code is superseded first, so one flow never has two
 * valid codes: without that, a resend would leave the earlier code working and
 * quietly multiply the guessing surface with every click. Scoped to the flow
 * rather than the address — see the note on the update below.
 */
export async function storeAndSendCode(
  userId: string,
  email: string,
  minted: MintedCode,
  locale: Locale = "en",
): Promise<void> {
  const e = email.toLowerCase().trim();

  /**
   * Supersede only THIS flow's previous code, never the whole address.
   *
   * Address-wide supersession is what made the binding bypassable. Requesting a
   * code is unauthenticated, so anyone could ask for one at your address; that
   * killed the code you were holding AND rebound the address to their flow, and
   * your browser was left with a stale token for a dead row. They locked you out
   * without guessing at all.
   *
   * Scoped to the flow, each requester gets their own live code with its own
   * attempt counter. A stranger asking for a code at your address now costs you
   * an email and nothing else — yours keeps working. Mailbombing is still bounded
   * by the per-address budget, which is the right place for that limit.
   */
  await prisma.emailVerificationCode.updateMany({
    where: { email: e, flowHash: minted.flowHash, usedAt: null, supersededAt: null },
    data: { supersededAt: new Date() },
  });

  await prisma.emailVerificationCode.create({
    data: {
      userId,
      email: e,
      codeHash: minted.codeHash,
      flowHash: minted.flowHash,
      expiresAt: new Date(Date.now() + TTL_MS),
    },
  });

  await sendEmail(
    { to: e, ...verifyEmailCodeEmail(locale, minted.code) },
    { templateType: "email_verification", organizationId: null, attendeeRef: e },
  );
}

/**
 * Check a submitted code and, on success, mark the address verified.
 *
 * Looked up by ADDRESS, not by code — the caller was deliberately told nothing
 * about whether an account exists, so it has no userId to offer, and a lookup
 * keyed on the code itself would let anyone probe the whole live code space
 * across all accounts at once.
 */
export async function checkVerificationCode(
  email: string,
  code: string,
  flowToken?: string | null,
): Promise<CheckResult> {
  const e = email.toLowerCase().trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, error: CODE_REJECTED };

  /**
   * Find the code belonging to THIS flow, and ONLY this flow.
   *
   * An earlier version kept a compatibility branch here — rows with a null
   * flowHash stayed reachable to any caller, so that a code issued moments
   * before the deploy would not strand its owner. That branch reopened the very
   * attack this file exists to stop: a null row matched whatever token the
   * caller presented, and the recheck below is written `if (row.flowHash && …)`,
   * so it skipped exactly those rows. Anyone holding a self-minted token could
   * reach a stranger's code and burn its attempts.
   *
   * It was also protecting nobody. `email_verification_codes` in production has
   * never held a row — checked, not assumed — and `mintCode` now always sets a
   * flowHash, so no null row can be created. The compatibility window was
   * hypothetical; the hole it opened was not.
   *
   * A guess with no flow token cannot match anything, so it is refused before
   * the query rather than being allowed to select someone else's row.
   */
  if (!flowToken) return { ok: false, error: CODE_REJECTED };
  const flowHash = hashFlowToken(flowToken);
  const row = await prisma.emailVerificationCode.findFirst({
    where: {
      email: e,
      flowHash,
      usedAt: null,
      supersededAt: null,
      expiresAt: { gt: new Date() },
      attempts: { lt: MAX_ATTEMPTS },
    },
    orderBy: { createdAt: "desc" },
  });
  if (!row) return { ok: false, error: CODE_REJECTED };

  /**
   * Belt and braces behind the scoped lookup above.
   *
   * The `where` clause should make a mismatch unreachable; this catches the case
   * where it is ever loosened, and costs one constant-time comparison. Unlike
   * the version this replaces, a null flowHash now FAILS here instead of
   * skipping the check.
   */
  if (!row.flowHash || !flowMatches(row.flowHash, flowToken)) {
    return { ok: false, error: CODE_REJECTED };
  }

  if (!(await verifyCode(row.codeHash, code))) {
    // Count the miss before answering, so a burst of parallel guesses cannot
    // outrun the counter.
    await prisma.emailVerificationCode.update({
      where: { id: row.id },
      data: { attempts: { increment: 1 } },
    });
    return { ok: false, error: CODE_REJECTED };
  }

  // The CLAIM is what makes the code single-use, not the read above: two
  // requests carrying the same correct code can both reach here, and only one
  // may win. Same compare-and-set `resetPassword` uses.
  const claimed = await prisma.emailVerificationCode.updateMany({
    where: {
      id: row.id,
      usedAt: null,
      supersededAt: null,
      expiresAt: { gt: new Date() },
    },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) return { ok: false, error: CODE_REJECTED };

  await prisma.user.update({
    where: { id: row.userId },
    data: { emailVerified: new Date() },
  });

  return { ok: true, userId: row.userId };
}

/**
 * Per-ADDRESS cap shared by every signup mail — the first code, the
 * "you already have an account" notice, and every resend.
 *
 * One budget on purpose: if resend had its own, it would be a way to mail
 * someone three more times per hour than signup allows, which is exactly the
 * mailbombing the cap exists to stop.
 */
export const MAIL_LIMIT = 8;
export const MAIL_WINDOW_MS = 60 * 60 * 1000;

/**
 * What ONE origin may spend out of that per-address ceiling.
 *
 * Asking for a code is unauthenticated and takes a typed address, so without
 * this a stranger emptied the whole hourly budget in a few cheap requests — and
 * because the budget is shared with signup and the "you already have an
 * account" notice, that also blocked a genuine first-time registration at the
 * address for the rest of the hour.
 *
 * WHAT THIS DOES NOT DO, having claimed otherwise once already: it does not
 * guarantee the owner a mail. An earlier revision set the ceiling to 4 and
 * this to 3 and called that a guarantee, reasoning that one origin could never
 * take the last slot. That was wrong in the ordinary case — the owner's own
 * signup mail takes one of the four, the stranger's three take the rest, and
 * the owner's next resend is refused. The ceiling here is wide enough that a
 * single origin cannot starve normal use, and no wider claim is being made:
 * a few origins still exhaust it, and rotating within an IPv6 prefix makes
 * "a few origins" nearly free.
 *
 * The real guarantee lives elsewhere, in CallerKind below — identity, not
 * arithmetic, is what separates the owner from a stranger.
 */
export const MAIL_LIMIT_PER_ORIGIN = 3;

/**
 * Who is asking, and therefore which budget applies.
 *
 * `public` is the signup form and its resend: a typed address, so anyone can
 * aim it at anyone, and it is charged both the per-origin cap and the shared
 * per-address ceiling.
 *
 * `self` is the signed-in profile route. It can only ever mail the address on
 * the session, so it cannot be aimed at a stranger and cannot mailbomb anyone
 * but the caller — who is already bounded by a per-account limiter at the
 * route. It is therefore exempt from the shared ceiling, and that exemption is
 * the point: once you can sign in, no stranger can stop your verification mail
 * arriving, however much of the public budget they have burned.
 */
export type CallerKind = { kind: "public"; origin: string } | { kind: "self" };

export function signupMailAllowed(email: string, caller: CallerKind): boolean {
  if (caller.kind === "self") return true;
  // Origin budget FIRST. An origin already over its own limit must not get to
  // charge the address's ceiling on its way to being refused.
  if (!signupMailAllowedForOrigin(email, caller.origin)) return false;
  return rateLimit(`signup-mail:${email}`, MAIL_LIMIT, MAIL_WINDOW_MS).allowed;
}

export function signupMailAllowedForOrigin(email: string, origin: string): boolean {
  return rateLimit(
    `signup-mail-origin:${email}:${origin}`,
    MAIL_LIMIT_PER_ORIGIN,
    MAIL_WINDOW_MS,
  ).allowed;
}

/**
 * Issue a replacement code for an address that is waiting on one.
 *
 * This exists because re-running signup could not do it. The first submit
 * CREATES the account, so a second call finds it already present, takes the
 * existing-address branch, and mails "you already have an account" — no new
 * code, and a baffling message for someone who signed up a minute ago.
 *
 * Resolves the same way for every input: unknown address, already-verified
 * account, suspended account, or a code actually sent. The caller is told
 * nothing, exactly as at signup.
 */
export async function resendVerificationCode(
  email: string,
  locale: Locale,
  flowToken: string,
  /**
   * Who is asking. Explicit rather than defaulted, for the same reason
   * flowToken above is: the wrong value here silently removes a protection or
   * silently removes a guarantee, and neither shows up as a failure.
   */
  caller: CallerKind,
): Promise<void> {
  const e = email.toLowerCase().trim();

  const user = await prisma.user.findUnique({ where: { email: e } });
  // Nothing to do for an address with no account, one already verified, or a
  // suspended one — and in all three cases the caller sees the same thing.
  if (!user || user.emailVerified || user.status === "suspended") return;

  // Budget is checked AFTER eligibility, so it is only ever spent on a mail
  // that is actually going out. Checking first would let anyone burn an
  // address's hourly allowance by asking for codes it was never going to get.
  if (!signupMailAllowed(e, caller)) return;

  try {
    await storeAndSendCode(user.id, e, await mintCode(flowToken), locale);
  } catch (err) {
    console.error("[verify] resend failed:", (err as Error).message);
  }
}
