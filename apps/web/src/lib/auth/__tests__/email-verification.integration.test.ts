import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

const run = Boolean(process.env.TEST_DATABASE_URL);

vi.mock("@/lib/email/service", () => ({ sendEmail: vi.fn().mockResolvedValue(true) }));

/**
 * The unit tests mock Prisma, so they prove the calls are shaped correctly but
 * not that the database agrees. These run against a real Postgres and cover the
 * two properties that only exist at the storage layer: the compare-and-set that
 * makes a code single-use, and the attempt counter surviving as a row rather
 * than as process memory.
 */
describe.skipIf(!run)("email verification (integration)", () => {
  let prisma: typeof import("@/lib/db/client").prisma;
  let mintCode: typeof import("@/lib/auth/email-verification").mintCode;
  let storeAndSendCode: typeof import("@/lib/auth/email-verification").storeAndSendCode;
  let checkVerificationCode: typeof import("@/lib/auth/email-verification").checkVerificationCode;

  const email = `verify-${Date.now()}@example.test`;
  let userId = "";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db/client"));
    ({ mintCode, storeAndSendCode, checkVerificationCode } = await import(
      "@/lib/auth/email-verification"
    ));
    const user = await prisma.user.create({
      data: { email, passwordHash: "x", emailVerified: null },
    });
    userId = user.id;
  });

  afterAll(async () => {
    if (userId) await prisma.user.delete({ where: { id: userId } }).catch(() => {});
  });

  it("accepts the code once, then never again", async () => {
    const minted = await mintCode();
    await storeAndSendCode(userId, email, minted);

    const first = await checkVerificationCode(email, minted.code);
    expect(first.ok).toBe(true);

    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.emailVerified).toBeInstanceOf(Date);

    // Replay of the very same correct code.
    const second = await checkVerificationCode(email, minted.code);
    expect(second.ok).toBe(false);
  });

  it("persists wrong guesses and locks the code out at the limit", async () => {
    const minted = await mintCode();
    await storeAndSendCode(userId, email, minted);

    for (let i = 0; i < 5; i += 1) {
      expect((await checkVerificationCode(email, "000000")).ok).toBe(false);
    }

    const row = await prisma.emailVerificationCode.findFirst({
      where: { email, usedAt: null },
      orderBy: { createdAt: "desc" },
    });
    expect(row?.attempts).toBe(5);

    // The CORRECT code is now refused: the lockout is on the row, so it holds
    // across restarts in a way the in-memory limiter could not.
    expect((await checkVerificationCode(email, minted.code)).ok).toBe(false);
  });

  it("issuing a new code kills the previous one", async () => {
    const older = await mintCode();
    await storeAndSendCode(userId, email, older);

    const newer = await mintCode();
    await storeAndSendCode(userId, email, newer);

    expect((await checkVerificationCode(email, older.code)).ok).toBe(false);
    expect((await checkVerificationCode(email, newer.code)).ok).toBe(true);
  });

  it("only one of two concurrent submissions of the same code wins", async () => {
    const minted = await mintCode();
    await storeAndSendCode(userId, email, minted);

    const results = await Promise.all([
      checkVerificationCode(email, minted.code),
      checkVerificationCode(email, minted.code),
    ]);

    expect(results.filter((r) => r.ok)).toHaveLength(1);
  });
});
