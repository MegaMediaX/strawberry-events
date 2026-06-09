import { withApi, methodNotAllowed, resolveApiEvent } from "@/lib/api/handler";
import { ok, fail } from "@/lib/api/response";
import { seatDTO } from "@/lib/api/serializers";
import { prisma } from "@/lib/db/client";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApi(request, "seats:read", async (ctx) => {
    const event = await resolveApiEvent(ctx, id);
    if (!event) return fail("not_found", "Event not found", 404);
    const seats = await prisma.seatAssignment.findMany({
      where: { row: { section: { seatMap: { eventMappingId: event.id } } } },
      orderBy: { label: "asc" },
    });
    return ok(seats.map(seatDTO));
  });
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
