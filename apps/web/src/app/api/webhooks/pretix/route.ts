import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/pretix/webhooks";
import { PretixError } from "@/lib/pretix/errors";
import { dispatch } from "@/lib/pretix/handlers";

/**
 * Receives pretix webhooks. pretix is the source of truth; this endpoint
 * reconciles platform state on order payment, cancellation, and check-in (and
 * keeps the live-state flag in sync). Returns 200 only after reconciliation
 * succeeds so pretix's retry logic gets an accurate delivery signal; a handler
 * error returns 500 to trigger a (idempotent) retry.
 */
export async function POST(request: Request) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch (err) {
    const status = err instanceof PretixError ? err.status : 401;
    return NextResponse.json({ error: "invalid webhook" }, { status });
  }

  try {
    await dispatch(event);
  } catch (err) {
    console.error("[pretix-webhook] dispatch failed", (err as Error).message);
    return NextResponse.json({ error: "reconciliation failed" }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
