import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/client";
import { canAccessEvent } from "@/lib/auth/org-scope";
import { hasAnyRole, ForbiddenError } from "@/lib/auth/guards";
import type { SessionContext } from "@/lib/auth/types";
import type { FieldDef } from "@/lib/forms/fields";

export type { FieldDef, AnswerInput } from "@/lib/forms/fields";
export { getFieldsForTicket, validateRequiredAnswers } from "@/lib/forms/fields";

function assertCanManageFields(session: SessionContext) {
  if (session.impersonating) throw new ForbiddenError("Cannot manage fields while impersonating");
  if (!hasAnyRole(session, ["organizer_admin"])) {
    throw new ForbiddenError("Requires organizer admin or super admin");
  }
}

async function loadAccessibleEvent(session: SessionContext, eventMappingId: string) {
  const mapping = await prisma.eventMapping.findUnique({ where: { id: eventMappingId } });
  if (!mapping || !canAccessEvent(session, mapping.organizationId, mapping.localEventId)) {
    throw new ForbiddenError("Event not found or access denied");
  }
  return mapping;
}

export interface DefineFieldInput {
  id?: string;
  eventMappingId: string;
  ticketId?: string | null;
  labelEn: string;
  labelAr?: string | null;
  placeholderEn?: string | null;
  placeholderAr?: string | null;
  helpTextEn?: string | null;
  helpTextAr?: string | null;
  type: string;
  required?: boolean;
  options?: Prisma.InputJsonValue | null;
  sortOrder?: number;
}

/** Create or update a custom field definition on an accessible event. Audited. */
export async function defineField(session: SessionContext, input: DefineFieldInput) {
  assertCanManageFields(session);
  const mapping = await loadAccessibleEvent(session, input.eventMappingId);

  const data = {
    ticketId: input.ticketId ?? null,
    labelEn: input.labelEn,
    labelAr: input.labelAr ?? null,
    placeholderEn: input.placeholderEn ?? null,
    placeholderAr: input.placeholderAr ?? null,
    helpTextEn: input.helpTextEn ?? null,
    helpTextAr: input.helpTextAr ?? null,
    type: input.type,
    required: input.required ?? false,
    options: (input.options ?? undefined) as Prisma.InputJsonValue | undefined,
    sortOrder: input.sortOrder ?? 0,
  };

  let field;
  if (input.id) {
    field = await prisma.customFormField.update({ where: { id: input.id }, data });
  } else {
    field = await prisma.customFormField.create({
      data: { organizationId: mapping.organizationId, eventMappingId: mapping.id, ...data },
    });
  }

  await prisma.auditLog.create({
    data: {
      organizationId: mapping.organizationId,
      actorUserId: session.userId,
      action: input.id ? "custom_field.updated" : "custom_field.created",
      entityType: "custom_field",
      entityId: field.id,
    },
  });
  return field;
}

/** List custom fields for an accessible event (admin). */
export async function listFields(session: SessionContext, eventMappingId: string) {
  assertCanManageFields(session);
  await loadAccessibleEvent(session, eventMappingId);
  return prisma.customFormField.findMany({ where: { eventMappingId }, orderBy: { sortOrder: "asc" } });
}

/** Public read of an event's fields (for the registration wizard). No secrets. */
export async function getEventFields(eventMappingId: string): Promise<FieldDef[]> {
  return prisma.customFormField.findMany({
    where: { eventMappingId },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true, ticketId: true, labelEn: true, labelAr: true,
      placeholderEn: true, placeholderAr: true, helpTextEn: true, helpTextAr: true,
      type: true, required: true, options: true,
    },
  });
}
