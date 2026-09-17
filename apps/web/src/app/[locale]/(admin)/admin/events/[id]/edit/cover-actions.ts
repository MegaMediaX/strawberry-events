"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import * as service from "@/lib/events/service";
import { CoverImageError, MAX_COVER_BYTES, coverImageUrl } from "@/lib/events/cover-image";

export interface CoverActionResult {
  ok: boolean;
  error?: string;
  url?: string | null;
  /** The cover's own pixel size, when its header could be read. */
  size?: { width: number; height: number } | null;
  /** Which part of it survives the crop. */
  focus?: { x: number; y: number };
}

export async function uploadCoverAction(
  locale: string,
  eventId: string,
  formData: FormData,
): Promise<CoverActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Choose an image to upload" };
  }
  if (file.size > MAX_COVER_BYTES) {
    return { ok: false, error: "Image exceeds the 5 MB limit" };
  }

  try {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const updated = await service.setEventCover(session, eventId, bytes);
    revalidatePath(`/${locale}/admin/events/${eventId}/edit`);
    return {
      ok: true,
      url: updated.coverImagePath ? coverImageUrl(updated.coverImagePath) : null,
      size:
        updated.coverWidth && updated.coverHeight
          ? { width: updated.coverWidth, height: updated.coverHeight }
          : null,
      // A new picture resets the crop to centre; the picker has to follow, or
      // it would keep drawing the old event's box over the new photograph.
      focus: { x: updated.coverFocusX, y: updated.coverFocusY },
    };
  } catch (err) {
    if (err instanceof CoverImageError) return { ok: false, error: err.message };
    return { ok: false, error: (err as Error).message };
  }
}

export async function removeCoverAction(
  locale: string,
  eventId: string,
): Promise<CoverActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };

  try {
    await service.removeEventCover(session, eventId);
    revalidatePath(`/${locale}/admin/events/${eventId}/edit`);
    return { ok: true, url: null, size: null, focus: { x: 50, y: 50 } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}

/**
 * Record which part of the cover survives the crop.
 *
 * Every public surface frames the cover at the house cinematic ratio, and a
 * frame crops — a portrait poster keeps under a third of its height. Until
 * this existed that third was always the middle, so a poster with its subject
 * high lost the subject on the index, on the event page and in the emailed
 * link, with nobody able to intervene.
 */
export async function setCoverFocusAction(
  locale: string,
  eventId: string,
  x: number,
  y: number,
): Promise<CoverActionResult> {
  const session = await getSessionContext();
  if (!session) return { ok: false, error: "Not authenticated" };

  try {
    const updated = await service.setCoverFocus(session, eventId, x, y);
    revalidatePath(`/${locale}/admin/events/${eventId}/edit`);
    return { ok: true, focus: { x: updated.coverFocusX, y: updated.coverFocusY } };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
