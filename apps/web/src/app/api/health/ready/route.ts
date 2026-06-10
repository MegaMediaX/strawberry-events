import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";
import { validateEnv } from "@/lib/config/env";

export const dynamic = "force-dynamic";

/**
 * Readiness: the app can serve traffic — required production config is valid AND
 * the database is reachable. Reports only coarse ok/error per check; never the
 * offending variable names or any secret. 200 ready, 503 not ready.
 */
export async function GET() {
  const configOk = validateEnv(process.env, process.env.NODE_ENV).length === 0;

  let dbOk = false;
  try {
    await prisma.$queryRaw`SELECT 1`;
    dbOk = true;
  } catch {
    dbOk = false;
  }

  const ready = configOk && dbOk;
  return NextResponse.json(
    {
      status: ready ? "ok" : "error",
      service: "strawberry-events",
      checks: { db: dbOk ? "ok" : "error", config: configOk ? "ok" : "error" },
    },
    { status: ready ? 200 : 503 },
  );
}
