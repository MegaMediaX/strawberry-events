import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";

/**
 * Event cover-photo storage. Files are written to a server-side uploads dir
 * (outside Next's public/ tree) and served back through a dedicated route
 * handler. Filenames are ALWAYS generated server-side from a cuid-style id +
 * random UUID, so no user-controlled path component ever reaches the filesystem
 * — eliminating path traversal. Content is sniffed by magic bytes, not trusted
 * from the client-declared MIME type or extension.
 */

export const MAX_COVER_BYTES = 5 * 1024 * 1024; // 5 MB

/** ext → content-type, for the allowed image formats only. */
export const COVER_CONTENT_TYPES: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/** Validated stored-filename shape: <generated>.<ext>. No slashes, no dots-dots. */
const FILENAME_RE = /^[A-Za-z0-9_-]+\.(jpg|jpeg|png|webp)$/;

/**
 * Detect the real image type from the leading magic bytes. Returns the
 * canonical extension or null if the bytes are not a supported image.
 */
export function detectImageType(bytes: Uint8Array): "jpg" | "png" | "webp" | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpg";
  }
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "png";
  }
  // WEBP: "RIFF"...."WEBP"
  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "webp";
  }
  return null;
}

export class CoverImageError extends Error {}

/**
 * Validate raw upload bytes. Throws CoverImageError on empty/oversize/unsupported
 * content. Returns the verified extension (derived from magic bytes, not input).
 */
export function validateCoverBytes(bytes: Uint8Array): "jpg" | "png" | "webp" {
  if (bytes.length === 0) throw new CoverImageError("Empty file");
  if (bytes.length > MAX_COVER_BYTES) {
    throw new CoverImageError("Image exceeds the 5 MB limit");
  }
  const ext = detectImageType(bytes);
  if (!ext) {
    throw new CoverImageError("Unsupported image type (use JPEG, PNG, or WebP)");
  }
  return ext;
}

/** Root dir for uploaded covers. Override with EVENT_UPLOADS_DIR in production. */
export function uploadsRoot(): string {
  return (
    process.env.EVENT_UPLOADS_DIR ||
    path.join(process.cwd(), ".uploads", "event-covers")
  );
}

/** Public URL path for a stored cover filename. */
export function coverImageUrl(filename: string): string {
  return `/media/event-cover/${filename}`;
}

/** True if `filename` is a safe stored cover filename (no path components). */
export function isValidCoverFilename(filename: string): boolean {
  return FILENAME_RE.test(filename);
}

/**
 * Resolve a stored filename to an absolute path WITHIN the uploads root.
 * Returns null if the name is malformed or would escape the root.
 */
export function resolveCoverPath(filename: string): string | null {
  if (!isValidCoverFilename(filename)) return null;
  const root = uploadsRoot();
  const abs = path.join(root, filename);
  // Defense in depth: ensure the resolved path stays inside the root.
  const rel = path.relative(root, abs);
  if (rel.startsWith("..") || path.isAbsolute(rel)) return null;
  return abs;
}

/**
 * Persist validated cover bytes for an event. Generates the filename
 * server-side; returns the stored filename to record on the EventMapping.
 */
export async function saveCoverImage(
  eventId: string,
  bytes: Uint8Array,
): Promise<string> {
  const ext = validateCoverBytes(bytes);
  const safeId = eventId.replace(/[^A-Za-z0-9_-]/g, "");
  const filename = `${safeId}-${randomUUID()}.${ext}`;
  const root = uploadsRoot();
  await mkdir(root, { recursive: true });
  await writeFile(path.join(root, filename), bytes);
  return filename;
}

/** Delete a stored cover file (best-effort; missing file is not an error). */
export async function deleteCoverImage(filename: string | null | undefined): Promise<void> {
  if (!filename) return;
  const abs = resolveCoverPath(filename);
  if (!abs) return;
  try {
    await unlink(abs);
  } catch {
    // already gone / never written — ignore
  }
}
