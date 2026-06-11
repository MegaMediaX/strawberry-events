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
  // Staff walk-in only: an explicit role/tag overriding the item→tag mapping.
  // The public wizard never sets this, so behavior there is unchanged.
  roleTag: z.enum(["media", "partner", "staff", "speaker", "visitor"]).optional(),
  // Modular per-ticket custom field answers.
  answers: z.array(z.object({ fieldId: z.string(), value: z.string() })).optional(),
  // Invite token for invite-only tickets (set by the register page from the URL).
  inviteToken: z.string().optional(),
  consentTerms: z.literal(true, { message: "You must accept the Terms" }),
  consentPrivacy: z.literal(true, { message: "You must accept the Privacy Policy" }),
});

export type RegisterInput = z.infer<typeof registerInputSchema>;
