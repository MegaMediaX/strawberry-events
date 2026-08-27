import { z } from "zod";

import { JOB_TITLE_MAX, JOB_TITLE_OTHER } from "@/lib/registration/job-title";
import { BADGE_TAGS, ROLE_LABEL_MAX } from "@/lib/badges/tags";

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
      // Job title, offered under the company name. Optional for everyone,
      // always — 526 company registrations predate this field and must stay
      // valid. The forms gate WHERE it is asked; the schema only says what a
      // title may look like.
      jobTitle: z
        .string()
        .trim()
        .max(JOB_TITLE_MAX, `Job title must be ${JOB_TITLE_MAX} characters or fewer`)
        .optional()
        .nullable(),
    }),
    tickets: z
      .array(z.object({ itemId: z.number().int(), quantity: z.number().int().min(1) }))
      .min(1, "Select at least one ticket"),
    seatIds: z.array(z.string()).optional(),
    // Staff walk-in only: an explicit role/tag overriding the item→tag mapping.
    // The public wizard never sets this, so behavior there is unchanged.
    roleTag: z.enum(BADGE_TAGS).optional(),
    // Band text for roleTag `other`. Capped here as well as in the resolver
    // because this schema is the boundary the external API comes through.
    roleLabel: z.string().trim().max(ROLE_LABEL_MAX).optional().nullable(),
    // Staff walk-in marker: when true, phone is optional. The public wizard
    // never sets this, so phone stays required for public registrations.
    staffWalkIn: z.boolean().optional(),
    // Modular per-ticket custom field answers.
    answers: z.array(z.object({ fieldId: z.string(), value: z.string() })).optional(),
    // Invite token for invite-only tickets (set by the register page from the URL).
    inviteToken: z.string().optional(),
    // Which channel is collecting the consent below. Staff walk-ins and the
    // external API identify themselves so a stored consent record can never
    // imply the data subject ticked a web form when a third party created the
    // order for them. Left `.optional()` rather than `.default()` so it stays
    // absent from the inferred input type: omitting it means "web_form", which
    // is what every existing public caller is.
    consentSource: z.enum(["web_form", "staff_walkin", "api"]).optional(),
    // Plain booleans rather than literal(true): only the web form can *refuse*
    // to proceed without the boxes (see superRefine). The other channels are
    // allowed to say "no consent was collected", which yields a NULL
    // consentAt — an honest gap beats a fabricated timestamp.
    consentTerms: z.boolean().default(false),
    consentPrivacy: z.boolean().default(false),
    // The organiser's data-use consent, added alongside the other two rather
    // than folded into consentPrivacy: they are separate statements and a
    // registrant who accepted one has not thereby accepted the other.
    consentDataUse: z.boolean().default(false),
  })
  .superRefine((val, ctx) => {
    // The public wizard renders both checkboxes and must not be submittable
    // without them; messages/paths are unchanged so the existing field-error
    // mapping in registerAction still surfaces them on the right controls.
    if ((val.consentSource ?? "web_form") === "web_form") {
      if (!val.consentTerms) {
        ctx.addIssue({ code: "custom", path: ["consentTerms"], message: "You must accept the Terms" });
      }
      if (!val.consentPrivacy) {
        ctx.addIssue({ code: "custom", path: ["consentPrivacy"], message: "You must accept the Privacy Policy" });
      }
      if (!val.consentDataUse) {
        ctx.addIssue({
          code: "custom",
          path: ["consentDataUse"],
          message: "You must accept the data-use disclaimer",
        });
      }
    }

    // Company attendees must supply a company name (the free-text `company`).
    if (
      val.attendee.attendeeType === "company" &&
      !val.attendee.company?.trim()
    ) {
      ctx.addIssue({ code: "custom", path: ["attendee", "company"], message: "Company name is required" });
    }

    // "Other" is the dropdown's sentinel for "let me type one", never a title.
    // Storing it would publish "Other" on the contact profile and print it on
    // the badge, which reads as data rather than as the bug it is.
    if (val.attendee.jobTitle?.trim() === JOB_TITLE_OTHER) {
      ctx.addIssue({
        code: "custom",
        path: ["attendee", "jobTitle"],
        message: "Enter your job title",
      });
    }

    const email = val.attendee.email;
    // A provided email must always be well-formed (it flows to the pretix order).
    if (email.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      ctx.addIssue({ code: "custom", path: ["attendee", "email"], message: "Enter a valid email address" });
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
