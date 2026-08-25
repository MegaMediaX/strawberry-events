"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getSessionContext } from "@/lib/auth/session";
import { getActiveOrg } from "@/lib/auth/active-org.server";
import * as service from "@/lib/events/service";
import { eventInputSchema, ticketInputSchema, subEventInputSchema } from "@/lib/events/schema";
import { PretixValidationError } from "@/lib/pretix/errors";
import type { BadgeTagValue } from "@/lib/badges/tags";

export interface ActionResult {
  ok?: boolean;
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

export async function deleteEventAction(
  locale: string,
  eventId: string,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { error: "Not authenticated" };
  try {
    await service.deleteEvent(session, eventId);
  } catch (err) {
    return { error: (err as Error).message };
  }
  revalidatePath(`/${locale}/admin/events`);
  return { ok: true };
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

  let mapping;
  try {
    mapping = await service.createEvent(session, org, parsed.data);
  } catch (err) {
    if (err instanceof PretixValidationError) {
      return { fieldErrors: err.fieldErrors };
    }
    return { error: (err as Error).message };
  }

  revalidatePath(`/${locale}/admin/events`);
  // Land on the new event's edit page so the user can add tickets next; the
  // `saved` flag tells the form to surface a confirmation toast on arrival.
  redirect(`/${locale}/admin/events/${mapping.id}/edit?saved=1`);
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
  // Stay on the edit page; the client surfaces a "Saved" toast on success.
  return { ok: true };
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

/**
 * Apply all ticket & sub-event edits, additions, and removals from the tickets
 * page in one call (the single page-level "Save"). Stops at the first failure
 * and returns its message; pretix/DB calls are individually atomic.
 */
export async function saveTicketsAction(
  locale: string,
  eventId: string,
  payload: {
    tickets?: {
      create?: unknown[];
      update?: { itemId: number; input: unknown }[];
      delete?: { itemId: number; label?: string }[];
    };
    subEvents?: {
      create?: unknown[];
      update?: { id: string; input: unknown }[];
      delete?: string[];
    };
  },
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { error: "Not authenticated" };

  try {
    // Deletes first (frees pretix slugs/quota names), then updates, then creates.
    for (const d of payload.tickets?.delete ?? []) {
      if (!Number.isInteger(d.itemId) || d.itemId <= 0) {
        return { error: "Invalid ticket reference" };
      }
      await service.deleteTicket(session, eventId, d.itemId, d.label);
    }
    for (const u of payload.tickets?.update ?? []) {
      const parsed = ticketInputSchema.safeParse(u.input);
      if (!parsed.success) return { fieldErrors: zodToFieldErrors(parsed.error.issues) };
      await service.updateTicket(session, eventId, u.itemId, parsed.data);
    }
    for (const c of payload.tickets?.create ?? []) {
      const parsed = ticketInputSchema.safeParse(c);
      if (!parsed.success) return { fieldErrors: zodToFieldErrors(parsed.error.issues) };
      await service.createTicket(session, eventId, parsed.data);
    }

    for (const id of payload.subEvents?.delete ?? []) {
      await service.deleteSubEvent(session, eventId, id);
    }
    for (const u of payload.subEvents?.update ?? []) {
      const parsed = subEventInputSchema.safeParse(u.input);
      if (!parsed.success) return { fieldErrors: zodToFieldErrors(parsed.error.issues) };
      await service.updateSubEvent(session, eventId, u.id, parsed.data);
    }
    for (const c of payload.subEvents?.create ?? []) {
      const parsed = subEventInputSchema.safeParse(c);
      if (!parsed.success) return { fieldErrors: zodToFieldErrors(parsed.error.issues) };
      await service.createSubEvent(session, eventId, parsed.data);
    }
  } catch (err) {
    if (err instanceof PretixValidationError) return { fieldErrors: err.fieldErrors };
    return { error: (err as Error).message };
  }

  revalidatePath(`/${locale}/admin/events/${eventId}/tickets`);
  return { ok: true };
}

export async function setTicketInviteOnlyAction(
  locale: string,
  eventId: string,
  itemId: number,
  inviteOnly: boolean,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { error: "Not authenticated" };

  try {
    await service.setTicketInviteOnly(session, eventId, itemId, inviteOnly);
  } catch (err) {
    return { error: (err as Error).message };
  }

  revalidatePath(`/${locale}/admin/events/${eventId}/tickets`);
  return {};
}

export async function generateInviteLinkAction(
  locale: string,
  eventId: string,
  itemId: number,
  tag: BadgeTagValue | undefined,
  expiresInSeconds: number | undefined,
): Promise<ActionResult & { url?: string }> {
  const session = await getSessionContext();
  if (!session) return { error: "Not authenticated" };

  try {
    const url = await service.generateInviteLink(session, eventId, itemId, {
      locale,
      tag,
      expiresInSeconds,
    });
    return { url };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function createEmailInvitesAction(
  locale: string,
  eventId: string,
  values: {
    emails: string[];
    itemIds: number[];
    tag?: string;
    expiresAt?: string | null;
  },
): Promise<ActionResult & { sent?: number; skipped?: string[] }> {
  const session = await getSessionContext();
  if (!session) return { error: "Not authenticated" };

  const emails = values.emails.filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim()));
  if (!emails.length) return { error: "No valid email addresses provided" };

  const expiresAt = values.expiresAt ? new Date(values.expiresAt) : null;
  const tag = values.tag as import("@prisma/client").AttendeeTag | undefined;

  try {
    const result = await service.createEmailInvites(session, eventId, {
      emails,
      itemIds: values.itemIds,
      tag,
      expiresAt,
    });
    revalidatePath(`/${locale}/admin/events/${eventId}/tickets`);
    return { sent: result.sent, skipped: result.skipped };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function listInvitesAction(
  eventId: string,
): Promise<{ invites?: import("@prisma/client").Invite[]; error?: string }> {
  const session = await getSessionContext();
  if (!session) return { error: "Not authenticated" };

  try {
    const invites = await service.listInvites(session, eventId);
    return { invites };
  } catch (err) {
    return { error: (err as Error).message };
  }
}

export async function createSubEventAction(
  locale: string,
  eventId: string,
  values: unknown,
): Promise<ActionResult> {
  const session = await getSessionContext();
  if (!session) return { error: "Not authenticated" };

  const parsed = subEventInputSchema.safeParse(values);
  if (!parsed.success) {
    return { fieldErrors: zodToFieldErrors(parsed.error.issues) };
  }

  try {
    await service.createSubEvent(session, eventId, parsed.data);
  } catch (err) {
    if (err instanceof PretixValidationError) {
      return { fieldErrors: err.fieldErrors };
    }
    return { error: (err as Error).message };
  }

  revalidatePath(`/${locale}/admin/events/${eventId}/tickets`);
  return {};
}
