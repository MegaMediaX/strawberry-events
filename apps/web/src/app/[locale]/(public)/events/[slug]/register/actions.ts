"use server";

import { redirect } from "next/navigation";
import { register } from "@/lib/registration/service";
import { registerInputSchema } from "@/lib/registration/schema";

export interface RegisterActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export async function registerAction(
  locale: string,
  slug: string,
  values: unknown,
): Promise<RegisterActionResult> {
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

  if (result.status === "paid") {
    redirect(`/${locale}/events/${slug}/confirmation/${result.orderCode}`);
  }
  redirect(`/${locale}/events/${slug}/payment-pending/${result.orderCode}`);
}
