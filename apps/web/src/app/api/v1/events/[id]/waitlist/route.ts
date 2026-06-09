import { withApi, methodNotAllowed, resolveApiEvent } from "@/lib/api/handler";
import { ok, fail, readPaging, paginationMeta } from "@/lib/api/response";
import { waitlistDTO } from "@/lib/api/serializers";
import { prisma } from "@/lib/db/client";
import { joinWaitlist } from "@/lib/waitlist/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApi(request, "waitlist:read", async (ctx) => {
    const event = await resolveApiEvent(ctx, id);
    if (!event) return fail("not_found", "Event not found", 404);
    const url = new URL(request.url);
    const { page, perPage, skip, take } = readPaging(url);
    const where = { eventMappingId: event.id };
    const [rows, total] = await Promise.all([
      prisma.waitlistEntry.findMany({ where, skip, take, orderBy: { position: "asc" } }),
      prisma.waitlistEntry.count({ where }),
    ]);
    return ok(rows.map(waitlistDTO), paginationMeta(page, perPage, total));
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApi(request, "waitlist:write", async (ctx) => {
    const event = await resolveApiEvent(ctx, id);
    if (!event) return fail("not_found", "Event not found", 404);
    let body: { email?: string; itemId?: number };
    try {
      body = await request.json();
    } catch {
      return fail("bad_request", "Invalid JSON body", 400);
    }
    if (!body.email) return fail("bad_request", "email is required", 400);
    const entry = await joinWaitlist(event.id, body.email, body.itemId ?? null);
    return ok(waitlistDTO(entry), {}, { status: 201 });
  });
}

export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
