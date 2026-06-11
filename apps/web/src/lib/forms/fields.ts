// Pure, prisma-free helpers for modular custom fields — safe to import in both
// server and client components.

export interface FieldDef {
  id: string;
  ticketId: string | null;
  labelEn: string;
  labelAr: string | null;
  placeholderEn?: string | null;
  placeholderAr?: string | null;
  helpTextEn?: string | null;
  helpTextAr?: string | null;
  type: string;
  required: boolean;
  options: unknown;
  sortOrder?: number;
}

export interface AnswerInput {
  fieldId: string;
  value: string;
}

/**
 * Fields that apply to a given ticket: event-wide fields (ticketId null) plus
 * any whose ticketId matches the pretix item id.
 */
export function getFieldsForTicket<T extends { ticketId: string | null }>(fields: T[], itemId: number): T[] {
  const id = String(itemId);
  return fields.filter((f) => f.ticketId == null || f.ticketId === id);
}

/** Labels of required fields that have no non-empty answer. */
export function validateRequiredAnswers(fields: FieldDef[], answers: AnswerInput[]): string[] {
  const byId = new Map(answers.map((a) => [a.fieldId, (a.value ?? "").trim()]));
  return fields.filter((f) => f.required && !(byId.get(f.id) ?? "")).map((f) => f.labelEn);
}

/** Parse a JSON options blob into a string[] of select/multiselect choices. */
export function fieldOptions(options: unknown): string[] {
  if (Array.isArray(options)) return options.map((o) => String(o));
  return [];
}
