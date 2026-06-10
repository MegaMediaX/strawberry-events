import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Liveness: the app process is up. No dependencies, no secrets. */
export function GET() {
  return NextResponse.json({ status: "ok", service: "strawberry-events", checks: {} });
}
