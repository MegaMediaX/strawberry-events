import { SaveContactButton } from "@/components/public/save-contact-button";
import type { VCardInput } from "@/lib/checkin/vcard";

/**
 * The badge contact card, as a pure function of its data.
 *
 * Split out from the page so it can actually be rendered in a test. The page
 * is an async server component that queries Prisma, so the only way to assert
 * "a card with no email and no phone still offers Save contact" was to inspect
 * the source as a string — which cannot express "not inside that conditional"
 * and passed whether or not the bug was present.
 */
export interface ContactCardProps {
  name: string;
  /**
   * The event this badge belongs to, and where and when it was.
   *
   * Both used to be the string "LEBTECH 2026" written into this file. This is
   * a multi-event platform: every badge printed for every other event resolved
   * to a card announcing an event its holder did not attend, and the vCard
   * carried that claim into the scanner's phone book permanently.
   */
  eventName: string;
  /** "Beirut · 28—30 Aug 2026", already composed, or null when unknown. */
  metLine: string | null;
  /** Company if given, else "Freelancer"/"Student". 53% of attendees give no company. */
  affiliation: string | null;
  /**
   * The person's job title, shown above the company. Absent for everyone who
   * registered before the field existed, and for anyone who skipped it — so it
   * renders as nothing at all rather than as an empty line.
   */
  jobTitle: string | null;
  /** Shown only when it adds something the affiliation line does not. */
  typeLabel: string | null;
  email: string | null;
  phone: string | null;
  contact: VCardInput;
}

export function ContactCard({
  name,
  eventName,
  metLine,
  jobTitle,
  affiliation,
  typeLabel,
  email,
  phone,
  contact,
}: ContactCardProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
      <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
        {eventName}
      </p>

      {/* Someone's name in lights. The display scale rather than a hand-typed
          size, and the serif rather than the sans — this is the one line the
          page exists for, and it is read by a stranger holding a phone. */}
      <h1 className="font-heading mt-4 text-[length:var(--display-3)] leading-[1.05] tracking-[-0.02em] text-balance text-foreground">
        {name}
      </h1>

      {jobTitle ? (
        <p className="mt-2 text-base font-medium text-foreground">{jobTitle}</p>
      ) : null}

      {affiliation ? (
        <p className={`${jobTitle ? "mt-0.5" : "mt-2"} text-base text-foreground/80`}>
          {affiliation}
        </p>
      ) : null}

      {/* Muted, not red: the one red thing on this page is Save contact. */}
      {typeLabel ? (
        <p className="mt-3 text-[12px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          {typeLabel}
        </p>
      ) : null}

      {email || phone ? (
        <dl className="mt-8 space-y-4">
          {/* Underlined at REST, not on hover. These two were styled exactly
              like the text around them — no colour shift, no underline until
              a pointer arrived — on a page whose entire purpose is handing a
              stranger a way to make contact, read one-handed on a phone where
              hover does not exist (WCAG 1.4.1). */}
          {email ? (
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Email
              </dt>
              <dd className="mt-1 text-[15px] break-all">
                <a
                  className="inline-flex min-h-11 items-center underline underline-offset-2"
                  href={`mailto:${email}`}
                >
                  {email}
                </a>
              </dd>
            </div>
          ) : null}
          {phone ? (
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Phone
              </dt>
              <dd className="mt-1 text-[15px]">
                {/* tel: strips spaces — some diallers choke on them. */}
                <a
                  className="inline-flex min-h-11 items-center underline underline-offset-2"
                  href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                >
                  {phone}
                </a>
              </dd>
            </div>
          ) : null}
        </dl>
      ) : null}

      {/* Deliberately OUTSIDE the contact block. A card with no email or phone
          is still worth saving — name, affiliation and where you met are the
          parts you forget by the next morning. Hiding the page's only action
          behind optional data would hide it from exactly the attendees whose
          card is sparsest. */}
      <SaveContactButton contact={contact} />

      {/* Addressed to whoever scanned, not to the person on the badge. */}
      {metLine ? (
        <p className="mt-6 text-[13px] leading-[1.5] text-muted-foreground">
          Met at {eventName} &middot; {metLine}
        </p>
      ) : (
        <p className="mt-6 text-[13px] leading-[1.5] text-muted-foreground">
          Met at {eventName}
        </p>
      )}
    </div>
  );
}
