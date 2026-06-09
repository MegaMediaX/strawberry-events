import { withApi, methodNotAllowed } from "@/lib/api/handler";
import { ok, readPaging, paginationMeta } from "@/lib/api/response";
import { eventDTO } from "@/lib/api/serializers";
import { prisma } from "@/lib/db/client";

export async function GET(request: Request) {
  return withApi(request, "events:read", async (ctx) => {
    const url = new URL(request.url);
    const { page, perPage, skip, take } = readPaging(url);
    const where = {
      organizationId: ctx.organizationId ?? undefined,
      ...(ctx.eventRestrictions.length > 0 ? { id: { in: ctx.eventRestrictions } } : {}),
    };
    const [rows, total] = await Promise.all([
      prisma.eventMapping.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.eventMapping.count({ where }),
    ]);
    return ok(rows.map(eventDTO), paginationMeta(page, perPage, total));
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
