import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/client";
import { isBadgeSlug } from "@/lib/checkin/badge-slug";
import { badgeProfilesEnabled } from "@/lib/checkin/badge-profile-flag";
import { badgeProfileUrl } from "@/lib/checkin/badge-slug";
import { formatPhone } from "@/lib/checkin/vcard";
import { ContactCard } from "@/components/public/contact-card";

export const dynamic = "force-dynamic";

/**
 * Never let an attendee's name reach a link preview or a search result. The
 * page itself is noindex via the layout; this keeps the title generic too, so
 * a badge photographed and shared in a group chat does not unfurl as a name.
 */
export const metadata: Metadata = {
  title: "LEBTECH 2026",
  // noindex lived on the old dedicated /c root layout. That layout had to go —
  // the route was unreachable outside [locale] — so the directive moves here.
  // These pages carry attendee names and must never be indexed.
  robots: { index: false, follow: false, nocache: true },
};

/**
 * What the badge QR resolves to.
 *
 * This is a contact card, addressed to the STRANGER who scanned the badge —
 * not to the person wearing it. Name and affiliation lead; Save contact is the
 * page's only conversion goal and is the last thing before the footer.
 *
 * It publishes name, affiliation, email and phone. That is a deliberate
 * product decision and a real disclosure: a scan is unauthenticated, so these
 * details are readable by anyone who photographs a lanyard, which is not the
 * consent given at registration. Two controls exist — `badgeProfileRevokedAt`
 * takes one person's page down without touching their ticket, and
 * BADGE_PROFILES_ENABLED takes every page down without a deploy.
 *
 * Never widen the `select` beyond these fields. orderCode, pretixSecret and
 * magicLinkToken are credentials and must never reach this page.
 */
export default async function BadgeProfilePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  // A single env var takes every profile offline without a deploy. The badges
  // stay valid — check-in resolves slugs independently of this flag — so
  // pulling the pages during the event costs nothing at the door.
  if (!badgeProfilesEnabled()) notFound();

  const { slug } = await params;
  const normalized = slug.toUpperCase();

  // Shape-check before touching the database: an unbounded path segment should
  // not become a query.
  if (!isBadgeSlug(normalized)) notFound();

  const order = await prisma.attendeeOrder.findUnique({
    where: { badgeSlug: normalized },
    select: {
      attendeeName: true,
      company: true,
      jobTitle: true,
      attendeeType: true,
      status: true,
      badgeProfileRevokedAt: true,
      // Contact details, published so someone who scans the badge can save the
      // person. This is the ONLY reason these are selected — keep the list
      // narrow, and never add orderCode, pretixSecret or magicLinkToken here.
      email: true,
      phone: true,
      phoneCC: true,
    },
  });

  // One 404 for every failure mode — missing, revoked, or cancelled. Distinct
  // responses would let someone probing slugs tell "no such badge" from "that
  // badge exists but was taken down", which is itself information about a
  // person.
  if (!order || order.badgeProfileRevokedAt || order.status === "canceled") notFound();

  const name = order.attendeeName?.trim() || "LEBTECH Attendee";
  const company = order.company?.trim() || null;
  const jobTitle = order.jobTitle?.trim() || null;
  const email = order.email?.trim() || null;

  // attendeeType describes what the person DOES — company / freelancer /
  // student. It is not their event role (that is roleTag, the band on the
  // printed badge), which is why a red pill reading "COMPANY" under a company
  // name read as a bug rather than a label.
  const TYPE_LABEL: Record<string, string> = {
    company: "Company",
    freelancer: "Freelancer",
    student: "Student",
  };
  const typeKey = order.attendeeType?.trim().toLowerCase() ?? "";
  const typeLabel = TYPE_LABEL[typeKey] ?? null;

  // 53% of attendees give no company. Rather than leave the line blank, a
  // freelancer or student says who they are — which is the whole point of the
  // line. "Company" is not a fallback: it names no one.
  const affiliation = company ?? (typeKey === "company" ? null : typeLabel);

  // The pill only earns its place when it says something the affiliation line
  // does not. A freelancer who also gave a company name is worth marking; a
  // line that already reads "Freelancer" is not worth repeating.
  const showType = Boolean(company) && typeLabel !== null && typeKey !== "company";
  const phone = formatPhone(order.phone, order.phoneCC);

  const contact = {
    fullName: name,
    company,
    // TITLE gets the real job title when there is one — that is what the vCard
    // field means. It falls back to the display label, not the raw enum: a
    // contact saved with the title "freelancer" in lowercase looks like a data
    // leak in someone's phone.
    role: jobTitle ?? typeLabel,
    email,
    phone,
    url: badgeProfileUrl(normalized).replace("HTTPS://", "https://").toLowerCase(),
    note: "Met at LEBTECH 2026, Beirut - 28-30 August.",
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <ContactCard
        name={name}
        jobTitle={jobTitle}
        affiliation={affiliation}
        typeLabel={showType ? typeLabel : null}
        email={email}
        phone={phone}
        contact={contact}
      />

      <p className="mt-6 px-2 text-center text-[12px] leading-[1.5] text-muted-foreground">
        Shared from this attendee&rsquo;s LEBTECH badge, with their registration details.
        To have this page taken down, contact{" "}
        <a
          className="underline-offset-2 hover:underline"
          href="mailto:events@strawberryagency.com"
        >
          events@strawberryagency.com
        </a>
        .
      </p>
    </main>
  );
}
