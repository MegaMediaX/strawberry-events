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
  // Registration feature toggles (read by the public/register flows).
  waitlistEnabled: z.boolean().default(false),
  seatSelectionEnabled: z.boolean().default(false),
  badgeAutoPrint: z.boolean().default(false),
  // When true, a paid-tier registration cannot be approved until it is paid.
  payBeforeApproval: z.boolean().default(false),
  // Location (all optional; storefront renders gracefully when absent).
  venueName: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  mapUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")).nullable(),
  mapEmbedUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")).nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  // Optional WhatsApp channel/group link shown after registration.
  whatsappChannelUrl: z.string().url("Enter a valid URL").optional().or(z.literal("")).nullable(),
  // Sub-event capacity controls (stage 1).
  maxAttendees: z.number().int().min(0).nullable().optional(),
  ticketsPerUserMain: z.number().int().min(1).optional(),
  ticketsPerUserTotal: z.number().int().min(1).optional(),
});

export type EventInput = z.infer<typeof eventInputSchema>;
/** Form-side type: fields with defaults are optional before parsing. */
export type EventFormValues = z.input<typeof eventInputSchema>;

export const ticketInputSchema = z.object({
  titleEn: z.string().min(1, "Title (EN) is required"),
  titleAr: z.string().optional().nullable(),
  priceCents: z.number().int().min(0, "Price cannot be negative"),
  quotaSize: z.number().int().min(0).nullable(),
});

export type TicketInput = z.infer<typeof ticketInputSchema>;

export const subEventInputSchema = z
  .object({
    titleEn: z.string().min(1, "Title (EN) is required"),
    titleAr: z.string().optional().nullable(),
    category: z.string().min(1, "Category is required"),
    location: z.string().optional().nullable(),
    dateFrom: z.string().min(1, "Start date is required"),
    dateTo: z.string().min(1, "End date is required"),
    priceCents: z.number().int().min(0, "Price cannot be negative"),
    maxAttendees: z.number().int().min(0).nullable(),
    ticketsPerUser: z.number().int().min(1).default(1),
  })
  .refine((d) => new Date(d.dateTo) > new Date(d.dateFrom), {
    message: "End date must be after start date",
    path: ["dateTo"],
  });

export type SubEventInput = z.infer<typeof subEventInputSchema>;
