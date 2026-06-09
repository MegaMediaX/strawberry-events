"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/auth/active-org.server";
import * as service from "@/lib/events/service";
import { eventInputSchema, ticketInputSchema } from "@/lib/events/schema";
import { PretixValidationError } from "@/lib/pretix/errors";

export interface ActionResult {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

function zodToFieldErrors(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const i of issues) {
    const key = i.path.length ? String(i.path[0]) : "_";
    (out[key] ??= []).push(i.message);
  }
  return out;
}

export async function createEventAction(
  locale: string,
  values: unknown,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { error: "Not authenticated" };
  const org = await getActiveOrg(session);
  if (!org) return { error: "No active organization" };

  const parsed = eventInputSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    await service.createEvent(session, org, parsed.data);
  } catch (err) {
    if (err instanceof PretixValidationError) {
      return { fieldErrors: err.fieldErrors };
    }
    return { error: (err as Error).message };
  }

  revalidatePath(`/${locale}/admin/events`);
  redirect(`/${locale}/admin/events`);
}

export async function updateEventAction(
  locale: string,
  eventId: string,
  values: unknown,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { error: "Not authenticated" };

  const parsed = eventInputSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    await service.updateEvent(session, eventId, parsed.data);
  } catch (err) {
    if (err instanceof PretixValidationError) {
      return { fieldErrors: err.fieldErrors };
    }
    return { error: (err as Error).message };
  }

  revalidatePath(`/${locale}/admin/events`);
  redirect(`/${locale}/admin/events`);
}

export async function createTicketAction(
  locale: string,
  eventId: string,
  values: unknown,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { error: "Not authenticated" };

  const parsed = ticketInputSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    await service.createTicket(session, eventId, parsed.data);
  } catch (err) {
    if (err instanceof PretixValidationError) {
      return { fieldErrors: err.fieldErrors };
    }
    return { error: (err as Error).message };
  }

  revalidatePath(`/${locale}/admin/events/${eventId}/tickets`);
  return {};
}
