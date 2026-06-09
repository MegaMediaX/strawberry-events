import { withApi, methodNotAllowed, resolveApiEvent } from "@/lib/api/handler";
import { ok, fail, readPaging, paginationMeta } from "@/lib/api/response";
import { attendeeDTO } from "@/lib/api/serializers";
import { prisma } from "@/lib/db/client";
import { register } from "@/lib/registration/service";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApi(request, "attendees:read", async (ctx) => {
    const event = await resolveApiEvent(ctx, id);
    if (!event) return fail("not_found", "Event not found", 404);
    const url = new URL(request.url);
    const { page, perPage, skip, take } = readPaging(url);
    const where = { eventMappingId: event.id };
    const [rows, total] = await Promise.all([
      prisma.attendeeOrder.findMany({ where, skip, take, orderBy: { createdAt: "desc" } }),
      prisma.attendeeOrder.count({ where }),
    ]);
    return ok(rows.map(attendeeDTO), paginationMeta(page, perPage, total));
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return withApi(request, "attendees:write", async (ctx) => {
    const event = await resolveApiEvent(ctx, id);
    if (!event) return fail("not_found", "Event not found", 404);
    let b: {
      email?: string; firstName?: string; lastName?: string;
      phoneCC?: string; phone?: string; company?: string; itemId?: number; quantity?: number;
    };
    try {
      b = await request.json();
    } catch {
      return fail("bad_request", "Invalid JSON body", 400);
    }
    if (!b.email || !b.firstName || !b.lastName || !b.itemId) {
      return fail("bad_request", "email, firstName, lastName, itemId are required", 400);
    }
    try {
      const res = await register({
        eventSlug: event.pretixEventSlug,
        locale: "en",
        attendee: {
          firstName: b.firstName, lastName: b.lastName, email: b.email,
          phoneCC: b.phoneCC ?? "+961", phone: b.phone ?? "", company: b.company ?? null,
        },
        tickets: [{ itemId: b.itemId, quantity: b.quantity ?? 1 }],
        consentTerms: true,
        consentPrivacy: true,
      });
      return ok(
        { orderCode: res.orderCode, status: res.status, approvalStatus: res.approvalStatus },
        {},
        { status: 201 },
      );
    } catch (err) {
      return fail("registration_failed", (err as Error).message, 422);
    }
  });
}

export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
