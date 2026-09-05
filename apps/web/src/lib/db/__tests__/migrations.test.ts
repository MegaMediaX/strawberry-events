import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATIONS = join(process.cwd(), "prisma", "migrations");

function migrationFiles(): { name: string; sql: string }[] {
  return readdirSync(MIGRATIONS, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({
      name: e.name,
      sql: readFileSync(join(MIGRATIONS, e.name, "migration.sql"), "utf8"),
    }));
}

/** Statements, with `--` comment lines stripped so prose about a hazard is not mistaken for the hazard. */
function statements(sql: string): string {
  return sql
    .split("\n")
    .filter((l) => !l.trimStart().startsWith("--"))
    .join("\n");
}

describe("migrations", () => {
  it("has migrations to check", () => {
    expect(migrationFiles().length).toBeGreaterThan(10);
  });

  /**
   * `prisma migrate diff` proposes dropping these on EVERY run.
   *
   * They are GIN trigram indexes created with raw SQL in
   * 20260612000000_add_trgm_fuzzy_search, and they are what keeps typo-tolerant
   * attendee search fast at the door. Prisma's schema language cannot express
   * `gin_trgm_ops`, so they are invisible to schema.prisma and every generated
   * diff reads them as drift.
   *
   * Two consecutive migrations have now arrived carrying these drops. Nothing
   * about that is loud: DROP INDEX succeeds silently, the migration applies
   * cleanly, tests stay green, and search simply gets slow weeks later with
   * nothing pointing back at the change. Hence a test rather than a comment.
   *
   * If you are here because this failed: delete the DROP INDEX lines from your
   * generated migration. They are not part of your change.
   */
  it("never drops the trigram search indexes", () => {
    const offenders = migrationFiles()
      .filter(({ sql }) => /DROP\s+INDEX[^;]*_trgm/i.test(statements(sql)))
      .map(({ name }) => name);

    expect(offenders).toEqual([]);
  });

  /**
   * Postgres cannot remove a value from an enum type, so every one is a
   * permanent decision — the codebase already carries several it cannot undo.
   * New value-constrained columns should use a CHECK, which can be widened AND
   * narrowed. Existing enums are not the target here; adding to them is fine.
   */
  it("does not introduce new enum types", () => {
    const offenders = migrationFiles()
      .filter(({ sql }) => /CREATE\s+TYPE\s+"?\w+"?\s+AS\s+ENUM/i.test(statements(sql)))
      .filter(({ name }) => name > "20260905000000_")
      .map(({ name }) => name);

    expect(offenders).toEqual([]);
  });
});
