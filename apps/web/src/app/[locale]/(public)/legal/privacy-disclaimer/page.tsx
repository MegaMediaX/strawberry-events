import type { Metadata } from "next";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";

export const metadata: Metadata = {
  title: "Privacy & Data Protection Disclaimer",
  description:
    "How your information is collected and used when you register for a Strawberry Agency event.",
};

/**
 * The short consent notice registrants agree to at checkout, verbatim as the
 * organiser wrote it.
 *
 * Kept separate from `/legal/privacy`, which is the longer operational
 * document naming the specific processors. This is the text the registration
 * checkbox points at, so it must stay exactly as approved — do not paraphrase
 * it to fit the layout.
 */
function Paragraph({ children }: { children: React.ReactNode }) {
  return <p className="text-[15px] leading-[1.7] text-foreground/85">{children}</p>;
}

export default async function PrivacyDisclaimerPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto w-full max-w-2xl px-6 py-14">
      <h1 className="font-[family-name:var(--font-heading)] text-3xl leading-tight text-foreground">
        Privacy &amp; Data Protection Disclaimer
      </h1>

      <div className="mt-8 space-y-5">
        <Paragraph>
          By registering for this event, you acknowledge and agree that the information you
          provide will be collected and used solely for the purposes of event registration,
          administration, communication, attendance management, and related event activities.
        </Paragraph>

        <Paragraph>
          Your personal information will not be sold, rented, shared, or disclosed to any third
          party without your prior consent, except where disclosure is required by applicable law
          or by a competent governmental or legal authority.
        </Paragraph>

        {/* Added to cover the badge QR. Without it the paragraph above reads as
            a promise of no public disclosure, while the badge page publishes
            contact details to anyone who scans a lanyard. */}
        <Paragraph>
          Your name, organisation and contact details will also appear on a page linked from the
          QR code on your event badge, so that people you meet can save your contact details.
          That page is public to anyone who scans or photographs your badge, though it is not
          listed by search engines. You may ask us to remove it at any time, and doing so does
          not affect your ticket or your entry to the event.
        </Paragraph>

        <Paragraph>
          Your information will be handled responsibly and with appropriate measures to protect
          its confidentiality and security. By submitting your registration, you consent to the
          collection and use of your information for the purposes stated above.
        </Paragraph>

        <Paragraph>
          You may contact the event organizers at any time to request further information
          regarding the use of your personal data or to exercise any rights available to you under
          applicable data-protection laws.
        </Paragraph>
      </div>

      <div className="mt-10 rounded-[var(--radius-lg)] border border-border bg-card p-6">
        <h2 className="text-[13px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
          What you agree to at registration
        </h2>
        {/* Rendered as static text, not inputs: the live checkboxes are on the
            registration form. Interactive controls here would look like
            something to submit and would collect nothing. */}
        <ul className="mt-4 space-y-3 text-[15px] leading-[1.6] text-foreground/85">
          <li className="flex gap-3">
            <span aria-hidden="true" className="text-muted-foreground">
              &#9744;
            </span>
            <span>I have read and agree to the Privacy &amp; Data Protection Disclaimer.</span>
          </li>
          <li className="flex gap-3">
            <span aria-hidden="true" className="text-muted-foreground">
              &#9744;
            </span>
            <span>I consent to receive event-related communications from the organizers.</span>
          </li>
        </ul>
      </div>

      <p className="mt-10 text-[14px] leading-[1.6] text-muted-foreground">
        For the detail of which systems hold your data and how long it is kept, see the{" "}
        <Link className="underline underline-offset-2" href={`/${locale}/legal/privacy`}>
          Privacy Policy
        </Link>
        . Questions, or to exercise your rights, contact{" "}
        <a
          className="underline underline-offset-2"
          href="mailto:events@strawberryagency.com"
        >
          events@strawberryagency.com
        </a>
        .
      </p>
    </main>
  );
}
