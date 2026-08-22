import type { Metadata } from "next";
import Link from "next/link";
import { setRequestLocale } from "next-intl/server";

export const metadata: Metadata = { title: "Privacy Policy" };

/**
 * The policy this page replaced was a placeholder. It said the real text "will
 * be published here before public launch" and named only two purposes —
 * processing a registration and admitting someone to the event — while 812
 * people had already registered against it.
 *
 * Every statement below is written from what the code actually does: the fields
 * in `AttendeeOrder`, the processors data genuinely reaches (pretix, the SMTP
 * host), and the 14-day archive retention in `lib/archive/service.ts`. Where a
 * period or a practice is not yet implemented, it is not claimed.
 *
 * NOT LEGAL ADVICE. This is an engineering-accurate draft and needs review by a
 * lawyer before it can be relied on — particularly on Lebanese Law 81/2018 and
 * on GDPR, which can reach a non-EU organiser serving attendees in the EU.
 */
const UPDATED = "19 August 2026";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <div className="mt-2 space-y-3 text-[15px] leading-[1.6] text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

export default async function PrivacyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold">Privacy Policy</h1>
      <p className="mt-2 text-sm text-muted-foreground">Last updated {UPDATED}</p>

      <p className="mt-4 text-[15px] leading-[1.6] text-muted-foreground">
        This policy covers the registration platform at register.strawberryagency.com,
        operated by Strawberry Agency for its events. It describes what we hold,
        why, who else sees it, and how long we keep it.
      </p>

      <Section title="What we collect">
        <p>When you register we ask for your name, email address and phone number.
        Depending on the event we may also ask for your company or organisation and
        whether you are attending as a student, a company representative or a
        freelancer. Some events add their own questions; those are shown to you at
        the time and stored with your registration.</p>
        <p>We also record the date and time you agreed to this policy and the terms,
        and whether you registered through the website or were added by our staff at
        a desk.</p>
        <p>We do not ask for, and do not store, payment card details. We do not use
        advertising or analytics trackers on this site.</p>
      </Section>

      <Section title="Why we hold it">
        <ul className="list-disc space-y-1 ps-5">
          <li><strong>To register you and admit you.</strong> Your name and company
          are printed on your badge. Your ticket is issued against your email
          address.</li>
          <li><strong>To contact you about the event you registered for</strong> —
          your ticket, changes to times or venue, and practical instructions.</li>
          <li><strong>To operate the door.</strong> We record when a ticket is
          checked in, and when a badge is printed or reprinted.</li>
          <li><strong>To keep the platform secure and accountable</strong> — an
          audit record of administrative actions taken on your registration.</li>
        </ul>
        <p>We do not sell your data. We do not share it with sponsors or exhibitors.
        We do not add you to a marketing list on the basis of having registered for
        an event.</p>
      </Section>

      <Section title="Who else sees it">
        <ul className="list-disc space-y-1 ps-5">
          <li><strong>pretix</strong>, the ticketing system, which holds your order
          and your ticket. It runs on our own server.</li>
          <li><strong>Our email provider</strong>, which delivers your ticket and any
          messages about the event.</li>
          <li><strong>Event staff</strong>, who can see the registration list in
          order to run approvals, the door and the help desk.</li>
        </ul>
        <p>Those are the only third parties your details are passed to in the
        ordinary course of running an event.</p>
      </Section>

      <Section title="Your badge and its QR code">
        <p>Your event badge carries a QR code. Scanning it opens a page showing your
        name, your company or whether you are a freelancer or student, and the email
        address and phone number you registered with, so that people you meet can save
        your contact details.</p>
        <p><strong>That page is public.</strong> It is not listed by search engines,
        and the code in it cannot be guessed, but anyone who scans or photographs your
        badge can open it. If you would rather it did not exist, email us and we will
        take your page down &mdash; your ticket and your entry to the event are not
        affected.</p>
      </Section>

      <Section title="How long we keep it">
        <p>We keep your registration for as long as we are running the event and for
        a reasonable period afterwards, for accounting and for answering questions
        about attendance.</p>
        <p>When a registration is deleted it goes to a recovery queue for 14 days —
        so a mistake can be undone — and is then removed permanently.</p>
      </Section>

      <Section title="Your ticket link">
        <p>Your ticket is reachable through a private link we email you. Anyone with
        that link can see your ticket and the QR code used to admit you, so treat it
        like a boarding pass. If you think the link has been shared or lost, contact
        us and we will invalidate it and send you a new one.</p>
      </Section>

      <Section title="Your choices">
        <p>You can ask us to show you what we hold about you, correct anything that
        is wrong, or delete your registration. If you delete it before the event you
        will not be able to attend on that ticket.</p>
        <p>To make any of these requests, contact the organiser using the details on
        the event page. We will confirm your identity before acting, so that nobody
        else can make these requests about you.</p>
      </Section>

      <Section title="Changes to this policy">
        <p>If we change how we use your details in a way that goes beyond what is
        described here, we will tell you rather than quietly update this page. The
        date at the top of this policy shows when it last changed.</p>
      </Section>

      <p className="mt-10 text-sm text-muted-foreground">
        Questions about this policy, or a request about your data, go to the
        organiser contact shown on your{" "}
        <Link className="underline" href={`/${locale}/events`}>
          event page
        </Link>
        .
      </p>
    </main>
  );
}
