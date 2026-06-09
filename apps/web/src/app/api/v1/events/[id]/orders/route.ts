import { withApi, methodNotAllowed, resolveApiEvent } from "@/lib/api/handler";
import { ok, fail, readPaging, paginationMeta } from "@/lib/api/response";
import { orderDTO } from "@/lib/api/serializers";
import { prisma } from "@/lib/db/client";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApi(request, "orders:read", async (ctx) => {
    const event = await resolveApiEvent(ctx, id);
    if (!event) return fail("not_found", "Event not found", 404);
    const url = new URL(request.url);
    const { page, perPage, skip, take } = readPaging(url);
    const where = { eventMappingId: event.id };
    const [rows, total] = await Promise.all([
      prisma.attendeeOrder.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.attendeeOrder.count({ where }),
    ]);
    return ok(rows.map(orderDTO), paginationMeta(page, perPage, total));
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
