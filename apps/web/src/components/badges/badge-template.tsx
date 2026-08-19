
export type BadgeTag = "media" | "partner" | "staff" | "speaker" | "visitor";

const TAG_COLOR: Record<BadgeTag, string> = {
  media: "#7c3aed",
  partner: "#0891b2",
  staff: "#16a34a",
  speaker: "#e8375a",
  visitor: "#475569",
};

export interface BadgeData {
  tag: BadgeTag;
  fullName: string;
  company: string | null;
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
        {badge.tag.toUpperCase()}
      </div>
      <div className="badge-name">{badge.fullName}</div>
      {badge.company && <div className="badge-company">{badge.company}</div>}
      <style>{`
        /* Every length is in mm, because the media is 60x40mm and nothing else
           fits in the head. The previous rules mixed a 60x40mm @page with 0.3in
           padding and a 0.4in name margin left over from the 4x6in layout —
           roughly 18mm of whitespace on a 40mm label, before a single glyph.
           The content overflowed and this fallback could not produce a usable
           badge. It matters now: with on-site printing there is no pre-printed
           badge to fall back on, so this IS the fallback when QZ Tray is
           unreachable. */
        @media print { @page { size: 60mm 40mm; margin: 0; } }
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
        /* Two lines of name at most; a third would push the company off. */
        .badge-name {
          margin-top: 2.6mm; font-size: 5mm; font-weight: 700; line-height: 1.15;
          max-height: 11.5mm; overflow: hidden;
        }
        .badge-company {
          margin-top: 1.4mm; font-size: 3.2mm; line-height: 1.2; color: #555;
          max-height: 4mm; overflow: hidden;
        }
      `}</style>
    </div>
  );
}
