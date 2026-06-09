import { NextResponse } from "next/server";
import { verifyWebhook } from "@/lib/pretix/webhooks";

/**
 * Receives pretix webhooks (check-in / order events). pretix remains the source
 * of truth — counters are read live — so this endpoint acknowledges and logs the
 * event. Browser auto-print cannot be server-triggered; physical printing happens
 * in pretixSCAN or the staff check-in station.
 */
export async function POST(request: Request) {
  let event;
  try {
    event = await verifyWebhook(request);
  } catch {
    return NextResponse.json({ error: "invalid webhook" }, { status: 401 });
  }
  console.info("[pretix-webhook]", event.action, event.organizer, event.event ?? "", event.code ?? "");
  return NextResponse.json({ ok: true });
}
