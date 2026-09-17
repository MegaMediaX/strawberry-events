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

/** The stored file's own intrinsic size, in pixels. */
export interface ImageSize {
  width: number;
  height: number;
}

/**
 * Read an image's intrinsic size from its own header.
 *
 * Needed because a link preview that declares its image's dimensions lets a
 * scraper reserve the right box instead of reflowing when the picture lands —
 * and nothing in this system knew how big a cover was. Parsed rather than
 * decoded: these are the first few dozen bytes of a file we have already
 * validated by magic number, and pulling in an image library to learn two
 * integers would be the largest dependency in the upload path.
 *
 * Returns null whenever the header is truncated, unrecognised, or a variant
 * this does not read. That is deliberate and the callers treat it as "unknown":
 * a WRONG declared size is worse for a scraper than no size at all.
 */
export function imageDimensions(bytes: Uint8Array): ImageSize | null {
  const be16 = (i: number) => (bytes[i] << 8) | bytes[i + 1];
  const be32 = (i: number) =>
    ((bytes[i] << 24) | (bytes[i + 1] << 16) | (bytes[i + 2] << 8) | bytes[i + 3]) >>> 0;
  const le16 = (i: number) => bytes[i] | (bytes[i + 1] << 8);

  switch (detectImageType(bytes)) {
    case "png": {
      // IHDR is fixed: it is always the first chunk, at a fixed offset.
      if (bytes.length < 24) return null;
      return { width: be32(16), height: be32(20) };
    }

    case "jpg": {
      // JPEG has no fixed header — the size lives in a frame marker that can
      // sit behind any number of variable-length segments (EXIF thumbnails,
      // colour profiles), so the marker chain has to be walked.
      let i = 2;
      while (i + 9 < bytes.length) {
        if (bytes[i] !== 0xff) return null;
        let marker = bytes[i + 1];
        // Fill bytes: any number of 0xFF may pad before the marker itself.
        let j = i + 1;
        while (marker === 0xff && j + 1 < bytes.length) marker = bytes[++j];
        // SOF0–SOF15 carry the frame size. C4 (DHT), C8 (JPG) and CC (DAC)
        // share the range and do not.
        const isSOF =
          marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isSOF) return { height: be16(j + 4), width: be16(j + 6) };
        const length = be16(j + 1);
        if (length < 2) return null;
        i = j + 1 + length;
      }
      return null;
    }

    case "webp": {
      // Three container variants, and a cover can arrive as any of them.
      const fourCC = String.fromCharCode(...bytes.slice(12, 16));
      if (fourCC === "VP8X" && bytes.length >= 30) {
        // Extended: a 24-bit canvas size, stored minus one.
        const w = bytes[24] | (bytes[25] << 8) | (bytes[26] << 16);
        const h = bytes[27] | (bytes[28] << 8) | (bytes[29] << 16);
        return { width: w + 1, height: h + 1 };
      }
      if (fourCC === "VP8L" && bytes.length >= 25 && bytes[20] === 0x2f) {
        // Lossless: 14 bits each, packed, stored minus one.
        const bits = bytes[21] | (bytes[22] << 8) | (bytes[23] << 16) | (bytes[24] << 24);
        return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
      }
      if (fourCC === "VP8 " && bytes.length >= 30) {
        // Lossy: the key frame's start code has to be where it belongs, or
        // this is not a shape we can read.
        if (!(bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a)) return null;
        return { width: le16(26) & 0x3fff, height: le16(28) & 0x3fff };
      }
      return null;
    }

    default:
      return null;
  }
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
