import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("@/lib/db/client", () => ({
  prisma: { $queryRaw: vi.fn() },
}));

import { prisma } from "@/lib/db/client";
import { GET as health } from "@/app/api/health/route";
import { GET as healthDb } from "@/app/api/health/db/route";
import { GET as healthReady } from "@/app/api/health/ready/route";

const mock = <T,>(fn: T) => fn as unknown as ReturnType<typeof vi.fn>;
const SECRET_MARKERS = ["AUTH_SECRET", "ENCRYPTION_KEY", "PRETIX_API_TOKEN", "password", "change_me"];

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.unstubAllEnvs());

describe("/api/health", () => {
  it("returns a safe ok status with no secrets", async () => {
    const res = health();
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", service: "strawberry-events" });
    expect(JSON.stringify(body)).not.toMatch(new RegExp(SECRET_MARKERS.join("|")));
  });
});

describe("/api/health/db", () => {
  it("200 when the DB responds", async () => {
    mock(prisma.$queryRaw).mockResolvedValue([{ "?column?": 1 }]);
    const res = await healthDb();
    expect(res.status).toBe(200);
    expect((await res.json()).checks.db).toBe("ok");
  });
  it("503 when the DB is unreachable", async () => {
    mock(prisma.$queryRaw).mockRejectedValue(new Error("ECONNREFUSED"));
    const res = await healthDb();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.db).toBe("error");
    // must not leak the connection string / error internals
    expect(JSON.stringify(body)).not.toMatch(/postgres|ECONNREFUSED|5432|5433/);
  });
});

describe("/api/health/ready", () => {
  it("ready (200) in non-production with DB up", async () => {
    mock(prisma.$queryRaw).mockResolvedValue([{ ok: 1 }]);
    const res = await healthReady();
    expect(res.status).toBe(200);
    expect((await res.json()).checks).toEqual({ db: "ok", config: "ok" });
  });

  it("not ready (503) when required production config is missing", async () => {
    vi.stubEnv("NODE_ENV", "production"); // with no prod secrets set → config invalid
    mock(prisma.$queryRaw).mockResolvedValue([{ ok: 1 }]);
    const res = await healthReady();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.checks.config).toBe("error");
    // coarse status only — no offending variable names leaked
    expect(JSON.stringify(body)).not.toMatch(new RegExp(SECRET_MARKERS.join("|")));
  });
});
