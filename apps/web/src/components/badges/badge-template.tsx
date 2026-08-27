
import { badgeBandText, type BadgeTagValue } from "@/lib/badges/tags";

export type BadgeTag = BadgeTagValue;

// Screen only: the thermal badge is monochrome and prints the band solid black.
const TAG_COLOR: Record<BadgeTag, string> = {
  media: "#7c3aed",
  partner: "#0891b2",
  staff: "#16a34a",
  speaker: "#e8375a",
  visitor: "#475569",
  exhibitor: "#ea580c",
  organising_committee: "#4338ca",
  organiser: "#0d9488",
  cofounder: "#9333ea",
  // Deliberately NOT a near-neighbour of speaker's rose: the two roles sit
  // side by side on a panel, and the band is what tells them apart across a
  // room.
  moderator: "#a16207",
  // Thirteen roles is more than a palette can keep comfortably distinct, and
  // the thermal band is monochrome regardless — these are picked for
  // separation from their nearest neighbour on screen, nothing more.
  investor: "#831843",
  startup: "#1d4ed8",
  government: "#78350f",
  // The agency's own brand red, --primary in globals.css. The one role where
  // the colour is not an arbitrary pick for separation: it is the mark.
  strawberry: "#b10b0b",
};

export interface BadgeData {
  tag: BadgeTag;
  fullName: string;
  company: string | null;
  /**
   * Job title, printed under the company. Null for every registration taken
   * before the field existed, and for anyone who skipped it — so the badge must
   * be unchanged when it is absent, not merely tolerant of it.
   *
   * REQUIRED and nullable, exactly like `company`, rather than optional. Both
   * come from equally nullable columns, so "absent" is always expressible as
   * null and the optional `?` bought nothing — it only stopped the compiler
   * from forcing the NEXT construction site to carry the field. A badge preview
   * or a bulk-print tool added later would have compiled clean while silently
   * dropping the title, which is the same shape as the bug that made the
   * walk-in Company field untypeable.
   */
  jobTitle: string | null;
  /**
   * Opaque code behind the printed contact-profile QR. Optional: test badges
   * and orders predating the column have none, and must still print.
   *
   * This is NOT the pretix secret. It resolves to a public page showing only
   * what is already printed on the badge — see `lib/checkin/badge-slug.ts`.
   */
  badgeSlug?: string | null;
}

/**
 * The on-screen fallback badge, used when QZ Tray cannot be reached.
 *
 * It carries NO QR. It used to render `qrValue`, which the check-in panel set to
 * the pretix secret — the live check-in credential — putting a re-entry pass on
 * an attendee's chest, photographable all day, every time thermal printing
 * failed. `(public)/t/[token]` is the only surface allowed to render that
 * secret, and this path quietly broke that rule.
 *
 * Sized 60 × 40 mm to match the actual label stock. It was 4in × 6in, a leftover
 * from before the media was known — so this fallback could never have produced a
 * usable badge either.
 */
export function BadgeTemplate({ badge }: { badge: BadgeData }) {
  return (
    <div className="badge-sheet">
      <div className="badge-tag" style={{ background: TAG_COLOR[badge.tag] }}>
        {badgeBandText(badge.tag)}
      </div>
      <div className="badge-name">{badge.fullName}</div>
      {badge.company && <div className="badge-company">{badge.company}</div>}
      {/* Below the company, matching the printed layout. Without this the
          fallback and the thermal badge disagree, and the fallback is exactly
          when nobody can compare them. */}
      {badge.jobTitle?.trim() && <div className="badge-job-title">{badge.jobTitle}</div>}
      <style>{`
        /* ---- What actually gets printed ----
           window.print() prints the WHOLE DOCUMENT. Setting @page alone only
           changed the paper size, so the entire check-in screen was sliced into
           60x40mm pages - observed in production as an 8-page print job with
           the nav, the heading and the counters on it, and no badge.

           Hide everything, then reveal just the badge. visibility rather than
           display, so the badge's ancestors keep their boxes and it can still be
           positioned; display:none on an ancestor would take the badge with it. */
        @media print {
          @page { size: 60mm 40mm; margin: 0; }
          html, body {
            margin: 0 !important; padding: 0 !important;
            background: #fff !important; height: auto !important;
          }
          body * { visibility: hidden !important; }
          .badge-sheet, .badge-sheet * { visibility: visible !important; }
          .badge-sheet {
            position: fixed !important; left: 0 !important; top: 0 !important;
            margin: 0 !important; border: 0 !important; box-shadow: none !important;
            page-break-after: avoid; break-after: avoid;
          }
        }

        /* ---- The badge itself ----
           Every length in mm, because the media is 60x40mm. These were inches
           left over from a 4x6in layout - 0.3in padding plus a 0.4in name
           margin is ~18mm of whitespace on a 40mm label, before a single glyph,
           so the content overflowed the label it was supposed to fit. */
        .badge-sheet {
          width: 60mm; height: 40mm; box-sizing: border-box;
          display: flex; flex-direction: column; align-items: center;
          padding: 2mm; text-align: center; color: #111; background: #fff;
          overflow: hidden;
        }
        .badge-tag {
          width: 100%; color: #fff; font-weight: 800; letter-spacing: 0.08em;
          font-size: 5mm; line-height: 1.2; padding: 1.4mm 0; border-radius: 1mm;
        }
        /* Clamped: a long name must not push the company off the label. */
        .badge-name {
          margin-top: 2.6mm; font-size: 5mm; font-weight: 700; line-height: 1.15;
          max-height: 11.5mm; overflow: hidden;
        }
        .badge-company {
          margin-top: 1.4mm; font-size: 3.2mm; line-height: 1.2; color: #555;
          max-height: 4mm; overflow: hidden;
        }
        .badge-job-title {
          margin-top: 0.8mm; font-size: 3mm; line-height: 1.2; color: #555;
          max-height: 4mm; overflow: hidden;
        }
      `}</style>
    </div>
  );
}
