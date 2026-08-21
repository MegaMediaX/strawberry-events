import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { prisma } from "@/lib/db/client";
import { isBadgeSlug } from "@/lib/checkin/badge-slug";
import { badgeProfilesEnabled } from "@/lib/checkin/badge-profile-flag";
import { badgeProfileUrl } from "@/lib/checkin/badge-slug";
import { formatPhone } from "@/lib/checkin/vcard";
import { SaveContactButton } from "@/components/public/save-contact-button";

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
 * Deliberately NOT a contact dump. The page shows exactly what is already
 * printed on the badge and visible to anyone standing in the room — name,
 * company, role — and nothing more. Email and phone are not published here:
 * a scan is unauthenticated, so putting them on this page would publish 812
 * people's contact details to anyone who photographs a lanyard. The attendee
 * never consented to that, and it is not the consent they gave at registration.
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
      attendeeType: true,
      roleTag: true,
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
  const role = order.attendeeType?.trim() || null;
  const email = order.email?.trim() || null;
  const phone = formatPhone(order.phone, order.phoneCC);

  const contact = {
    fullName: name,
    company,
    role,
    email,
    phone,
    url: badgeProfileUrl(normalized).replace("HTTPS://", "https://").toLowerCase(),
    note: "Met at LEBTECH 2026, Beirut - 28-30 August.",
  };

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-12">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <p className="text-[11px] font-semibold tracking-[0.18em] text-muted-foreground uppercase">
          LEBTECH 2026 &middot; 6th Edition
        </p>

        <h1 className="mt-5 font-[family-name:var(--font-heading)] text-3xl leading-tight text-foreground">
          {name}
        </h1>

        {company ? <p className="mt-2 text-base text-foreground/80">{company}</p> : null}

        {role ? (
          <p className="mt-4 inline-flex rounded-full bg-primary/10 px-3 py-1 text-[12px] font-semibold tracking-[0.08em] text-primary uppercase">
            {role}
          </p>
        ) : null}

        {email || phone ? (
          <>
            <hr className="my-7 border-border" />
            <dl className="space-y-3">
              {email ? (
                <div>
                  <dt className="text-[11px] font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                    Email
                  </dt>
                  <dd className="mt-0.5 text-[15px] break-all">
                    <a className="underline underline-offset-2" href={`mailto:${email}`}>
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
                  <dd className="mt-0.5 text-[15px]">
                    {/* tel: strips spaces — some diallers choke on them. */}
                    <a
                      className="underline underline-offset-2"
                      href={`tel:${phone.replace(/[^+\d]/g, "")}`}
                    >
                      {phone}
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>

            <SaveContactButton contact={contact} />
          </>
        ) : null}

        <hr className="my-7 border-border" />

        <p className="text-[15px] leading-[1.6] text-muted-foreground">
          Thank you for joining us at LEBTECH 2026 in Beirut, 28&ndash;30 August. We hope to
          see you at the next edition.
        </p>

        <p className="mt-6 text-[13px] text-muted-foreground">
          Presented by{" "}
          <span className="font-semibold text-foreground">Strawberry Agency</span>
        </p>
      </div>

      <p className="mt-6 px-2 text-center text-[12px] leading-[1.5] text-muted-foreground">
        This page shows only what appears on the printed badge. To have it taken down,
        contact{" "}
        <a className="underline underline-offset-2" href="mailto:events@strawberryagency.com">
          events@strawberryagency.com
        </a>
        .
      </p>
    </main>
  );
}
