import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/client";

export const dynamic = "force-dynamic";

/** DB connectivity check. 200 when reachable, 503 otherwise. No secrets/DSN leaked. */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: "ok", service: "strawberry-events", checks: { db: "ok" } });
  } catch {
    return NextResponse.json(
      { status: "error", service: "strawberry-events", checks: { db: "error" } },
      { status: 503 },
    );
  }
}
