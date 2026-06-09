"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { register } from "@/lib/registration/service";
import { registerInputSchema } from "@/lib/registration/schema";
import { rateLimit } from "@/lib/security/rate-limit";

async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip") ||
    "unknown"
  );
}

export interface RegisterActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function registerAction(
  locale: string,
  slug: string,
  values: unknown,
): Promise<RegisterActionResult> {
  // Defense-in-depth rate limit (pair with edge/CDN/nginx): 10 registrations/min/IP.
  const ip = await clientIp();
  if (!rateLimit(`register:${ip}`, 10, 60_000).allowed) {
    return { error: "Too many attempts. Please wait a minute and try again." };
  }

  const parsed = registerInputSchema.safeParse({
    ...(values as object),
    eventSlug: slug,
    locale,
  });
  if (!parsed.success) {
    const fieldErrors: Record<string, string[]> = {};
    for (const i of parsed.error.issues) {
      const key = i.path.length ? String(i.path[i.path.length - 1]) : "_";
      (fieldErrors[key] ??= []).push(i.message);
    }
    return { fieldErrors };
  }

  let result;
  try {
    result = await register(parsed.data);
  } catch (err) {
    return { error: (err as Error).message };
  }

  // Approval-pending and issued both land on the confirmation page, which renders
  // the correct state (pending approval / QR). COD-without-approval → payment pending.
  if (result.approvalStatus === "pending" || result.status === "paid") {
    redirect(`/${locale}/events/${slug}/confirmation/${result.orderCode}`);
  }
  redirect(`/${locale}/events/${slug}/payment-pending/${result.orderCode}`);
}
