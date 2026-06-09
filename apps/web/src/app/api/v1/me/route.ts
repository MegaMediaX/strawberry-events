import { withApi, methodNotAllowed } from "@/lib/api/handler";
import { ok } from "@/lib/api/response";

export async function GET(request: Request) {
  return withApi(request, null, async (ctx) =>
    ok({
      organizationId: ctx.organizationId,
      scopes: ctx.scopes,
      eventRestrictions: ctx.eventRestrictions,
    }),
  );
}

export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
