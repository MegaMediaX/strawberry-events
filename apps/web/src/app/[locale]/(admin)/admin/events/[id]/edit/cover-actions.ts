"use server";

import { revalidatePath } from "next/cache";
import { getSessionContext } from "@/lib/auth/session";
import * as service from "@/lib/events/service";
import { CoverImageError, MAX_COVER_BYTES, coverImageUrl } from "@/lib/events/cover-image";

export interface CoverActionResult {
  ok: boolean;
  error?: string;
  url?: string | null;
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
    return { ok: true, url: null };
  } catch (err) {
    return { ok: false, error: (err as Error).message };
  }
}
