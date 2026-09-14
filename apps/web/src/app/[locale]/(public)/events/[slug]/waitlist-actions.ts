"use server";

import { z } from "zod";
import { joinWaitlist } from "@/lib/waitlist/service";

const schema = z.object({ eventId: z.string().min(1), email: z.string().email() });

export interface JoinResult {
  ok: boolean;
  position?: number;
  error?: string;
}

export async function joinWaitlistAction(
  eventId: string,
  email: string,
): Promise<JoinResult> {
  const parsed = schema.safeParse({ eventId, email });
  if (!parsed.success) return { ok: false, error: "Enter a valid email" };
  try {
    const entry = await joinWaitlist(parsed.data.eventId, parsed.data.email, null);
    return { ok: true, position: entry.position };
  } catch (err) {
    // Same rule as registerAction: log the real cause, show a sentence the
    // person can act on rather than the driver's own words.
    console.error(`[waitlist] join failed (event=${eventId}):`, err);
    return { ok: false, error: "We couldn't add you to the waitlist. Please try again." };
  }
}
