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
        LEBTECH 2026 &middot; 6th Edition
      </p>

      <h1 className="mt-4 font-[family-name:var(--font-heading)] text-4xl leading-[1.1] text-foreground">
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
          {email ? (
            <div>
              <dt className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                Email
              </dt>
              <dd className="mt-1 text-[15px] break-all">
                <a
                  className="inline-flex min-h-11 items-center underline-offset-2 hover:underline"
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
                  className="inline-flex min-h-11 items-center underline-offset-2 hover:underline"
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
      <p className="mt-6 text-[13px] leading-[1.5] text-muted-foreground">
        Met at LEBTECH 2026 &middot; Beirut, 28&ndash;30 August
      </p>
    </div>
  );
}
