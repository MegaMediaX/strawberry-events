import { readFile } from "node:fs/promises";
import path from "node:path";
import { resolveCoverPath, COVER_CONTENT_TYPES } from "@/lib/events/cover-image";

export const dynamic = "force-dynamic";

/**
 * Serve an event cover photo from the server uploads dir. The [file] segment is
 * a single path component; resolveCoverPath rejects anything that isn't a
 * well-formed stored filename or that would escape the uploads root, so no
 * traversal is possible. Cover images are public by design (shown on the
 * storefront), so no auth gate here.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ file: string }> },
) {
  const { file } = await params;
  const abs = resolveCoverPath(file);
  if (!abs) return new Response("Not found", { status: 404 });

  const ext = path.extname(abs).slice(1).toLowerCase();
  const contentType = COVER_CONTENT_TYPES[ext];
  if (!contentType) return new Response("Not found", { status: 404 });

  let data: Buffer;
  try {
    data = await readFile(abs);
  } catch {
    return new Response("Not found", { status: 404 });
  }

  return new Response(new Uint8Array(data), {
    headers: {
      "content-type": contentType,
      "cache-control": "public, max-age=3600",
    },
  });
}
