"use server";

import { redirect } from "next/navigation";
import { register } from "@/lib/registration/service";
import { registerInputSchema } from "@/lib/registration/schema";
import { rateLimit } from "@/lib/security/rate-limit";
import { clientIp } from "@/lib/security/client-ip";
import { PretixValidationError, flattenFieldErrors } from "@/lib/pretix/errors";

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

  // eventSlug/locale come from the route, and consentSource is pinned here (not
  // read from `values`) so a crafted payload cannot claim a different channel
  // and slip past the web form's hard consent requirement.
  const parsed = registerInputSchema.safeParse({
    ...(values as object),
    eventSlug: slug,
    locale,
    consentSource: "web_form",
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
    // pretix rejected the order with a 400. Log the full field detail so the
    // real cause is diagnosable in production, and show the registrant the
    // actual reason(s) rather than a bare internal API URL.
    if (err instanceof PretixValidationError) {
      const reasons = flattenFieldErrors(err.fieldErrors);
      console.error(
        `[register] pretix validation error (event=${slug}):`,
        JSON.stringify(err.fieldErrors),
      );
      return {
        error: reasons.length
          ? `Registration could not be completed: ${reasons.join("; ")}`
          : "Registration could not be completed. Please try again or contact the organizer.",
      };
    }
    return { error: (err as Error).message };
  }

  // Approval-pending and issued both land on the confirmation page, which renders
  // the correct state (pending approval / QR). COD-without-approval → payment pending.
  if (result.approvalStatus === "pending" || result.status === "paid") {
    redirect(`/${locale}/events/${slug}/confirmation/${result.orderCode}`);
  }
  redirect(`/${locale}/events/${slug}/payment-pending/${result.orderCode}`);
}
