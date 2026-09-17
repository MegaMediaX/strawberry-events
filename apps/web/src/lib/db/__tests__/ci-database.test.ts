import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * CI provisions a Postgres service and sets DATABASE_URL + TEST_DATABASE_URL so
 * the integration suites run for real. Nothing enforced that, and the failure
 * mode is silent: `describe.skipIf(!run)` reports a skip, vitest exits 0, and
 * the check goes green having proved nothing about registration, check-in,
 * seats, merges or the public API.
 *
 * These are the guards. If the wiring is ever dropped or drifts, CI fails here
 * with the reason rather than passing a hollow run.
 */

const SRC = join(process.cwd(), "src");

/** Walks src for test files. */
function testFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) testFiles(path, out);
    else if (entry.name.endsWith(".test.ts") || entry.name.endsWith(".test.tsx"))
      out.push(path);
  }
  return out;
}

describe("integration suites are gated on TEST_DATABASE_URL", () => {
  /**
   * A new `*.integration.test.ts` gated on some other env var would never run
   * anywhere — locally or in CI — and would look like a passing file. The gate
   * is the contract between the suite and the workflow, so it is checked
   * statically, on every machine, not just where a database happens to exist.
   *
   * `.e2e.test.ts` and `.live.test.ts` are deliberately excluded: those need a
   * live pretix instance (E2E_LIVE / PRETIX_API_TOKEN) that CI does not have,
   * and gate on that instead.
   */
  it("every integration test file reads TEST_DATABASE_URL", () => {
    const files = testFiles(SRC).filter((f) => f.endsWith(".integration.test.ts"));
    expect(files.length).toBeGreaterThan(10);
    const ungated = files.filter(
      (f) => !readFileSync(f, "utf8").includes("TEST_DATABASE_URL"),
    );
    expect(ungated).toEqual([]);
  });
});

// Only meaningful where the workflow is supposed to have wired a database up.
// Locally, where a developer may have no Postgres, these self-skip.
const ci = Boolean(process.env.CI);

describe.skipIf(!ci)("CI wires a real database up", () => {
  it("sets TEST_DATABASE_URL, so the integration suites are not skipped", () => {
    // Without it, ~20 files self-skip and the run is green on unit tests alone.
    expect(process.env.TEST_DATABASE_URL ?? "").not.toBe("");
  });

  /**
   * TEST_DATABASE_URL is only the GATE. `src/lib/db/client.ts` constructs
   * PrismaClient with no explicit datasource, so the connection itself comes
   * from DATABASE_URL. Set one without the other and the suites either skip
   * (no gate) or connect somewhere unintended (no match).
   */
  it("points DATABASE_URL at the same database as the gate", () => {
    expect(process.env.DATABASE_URL).toBe(process.env.TEST_DATABASE_URL);
  });

  it("has a reachable database with the migrations applied", async () => {
    const { prisma } = await import("@/lib/db/client");
    // A table from the schema, not `SELECT 1`: a reachable but unmigrated
    // database answers `SELECT 1` happily and then fails every suite that
    // touches a row.
    await expect(prisma.eventMapping.count()).resolves.toBeTypeOf("number");
    const applied = await prisma.$queryRaw<
      { count: bigint }[]
    >`SELECT count(*)::bigint AS count FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
    expect(Number(applied[0].count)).toBeGreaterThan(10);
  });
});
