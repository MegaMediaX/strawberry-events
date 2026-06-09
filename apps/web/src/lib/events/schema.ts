import { z } from "zod";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const eventInputSchema = z.object({
  titleEn: z.string().min(1, "Title (EN) is required"),
  titleAr: z.string().optional().nullable(),
  slug: z
    .string()
    .min(1)
    .regex(slugRegex, "Lowercase letters, numbers and hyphens only"),
  descriptionEn: z.string().optional().nullable(),
  descriptionAr: z.string().optional().nullable(),
  dateFrom: z.string().min(1, "Start date is required"),
  dateTo: z.string().optional().nullable(),
  visibility: z.enum(["public", "private", "hidden"]).default("public"),
  accountMode: z.enum(["required", "optional", "guest"]).default("optional"),
  approvalMode: z
    .enum(["none", "manual", "automatic", "manual_and_automatic"])
    .default("none"),
  comingSoon: z.boolean().default(false),
  live: z.boolean().default(false),
});

export type EventInput = z.infer<typeof eventInputSchema>;

export const ticketInputSchema = z.object({
  titleEn: z.string().min(1, "Title (EN) is required"),
  titleAr: z.string().optional().nullable(),
  priceCents: z.number().int().min(0, "Price cannot be negative"),
  quotaSize: z.number().int().min(0).nullable(),
});

export type TicketInput = z.infer<typeof ticketInputSchema>;
