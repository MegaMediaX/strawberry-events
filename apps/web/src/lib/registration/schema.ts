import { z } from "zod";

export const registerInputSchema = z.object({
  eventSlug: z.string().min(1),
  locale: z.enum(["en", "ar"]).default("en"),
  userId: z.string().nullable().optional(),
  attendee: z.object({
    firstName: z.string().min(1, "Required"),
    lastName: z.string().min(1, "Required"),
    email: z.string().email("Enter a valid email address"),
    phoneCC: z.string().min(1, "Required"),
    phone: z.string().min(3, "Required"),
    company: z.string().optional().nullable(),
  }),
  tickets: z
    .array(z.object({ itemId: z.number().int(), quantity: z.number().int().min(1) }))
    .min(1, "Select at least one ticket"),
  seatIds: z.array(z.string()).optional(),
  consentTerms: z.literal(true, { message: "You must accept the Terms" }),
  consentPrivacy: z.literal(true, { message: "You must accept the Privacy Policy" }),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
