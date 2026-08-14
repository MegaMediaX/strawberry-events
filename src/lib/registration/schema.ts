import { z } from "zod";
import { checkAttendeeEmail } from "./email-validation";

export const registerInputSchema = z
  .object({
    eventSlug: z.string().min(1),
    locale: z.enum(["en", "ar"]).default("en"),
    userId: z.string().nullable().optional(),
    attendee: z.object({
      firstName: z.string().min(1, "Required"),
      lastName: z.string().min(1, "Required"),
      // Email and phone are optional at the type level; they are REQUIRED for
      // the public wizard and OPTIONAL for staff walk-ins (see superRefine).
      email: z.string().optional().default(""),
      phoneCC: z.string().optional().default(""),
      phone: z.string().optional().default(""),
      company: z.string().trim().optional().nullable(),
      // Attendee type (Student / Company / Freelancer). `company` carries the
      // free-text company name when attendeeType = "company".
      attendeeType: z.enum(["student", "company", "freelancer"]).optional().nullable(),
    }),
    tickets: z
      .array(z.object({ itemId: z.number().int(), quantity: z.number().int().min(1) }))
      .min(1, "Select at least one ticket"),
    seatIds: z.array(z.string()).optional(),
    // Staff walk-in only: an explicit role/tag overriding the item→tag mapping.
    // The public wizard never sets this, so behavior there is unchanged.
    roleTag: z.enum(["media", "partner", "staff", "speaker", "visitor"]).optional(),
    // Staff walk-in marker: when true, phone is optional. The public wizard
    // never sets this, so phone stays required for public registrations.
    staffWalkIn: z.boolean().optional(),
    // Modular per-ticket custom field answers.
    answers: z.array(z.object({ fieldId: z.string(), value: z.string() })).optional(),
    // Invite token for invite-only tickets (set by the register page from the URL).
    inviteToken: z.string().optional(),
    consentTerms: z.literal(true, { message: "You must accept the Terms" }),
    consentPrivacy: z.literal(true, { message: "You must accept the Privacy Policy" }),
  })
  .superRefine((val, ctx) => {
    // Company attendees must supply a company name (the free-text `company`).
    if (
      val.attendee.attendeeType === "company" &&
      !val.attendee.company?.trim()
    ) {
      ctx.addIssue({ code: "custom", path: ["attendee", "company"], message: "Company name is required" });
    }

    const email = val.attendee.email;
    // A provided email must always be well-formed AND free of common typos
    // (e.g. "@gmail.ccom") — it flows to the pretix order and to real delivery.
    if (email.length > 0) {
      const check = checkAttendeeEmail(email);
      if (!check.valid) {
        ctx.addIssue({ code: "custom", path: ["attendee", "email"], message: check.message ?? "Enter a valid email address" });
      }
    }

    if (val.staffWalkIn) return; // walk-ins may omit email + phone

    if (email.length === 0) {
      ctx.addIssue({ code: "custom", path: ["attendee", "email"], message: "Required" });
    }
    if (val.attendee.phoneCC.length < 1) {
      ctx.addIssue({ code: "custom", path: ["attendee", "phoneCC"], message: "Required" });
    }
    if (val.attendee.phone.length < 3) {
      ctx.addIssue({ code: "custom", path: ["attendee", "phone"], message: "Required" });
    }
  });

export type RegisterInput = z.infer<typeof registerInputSchema>;
