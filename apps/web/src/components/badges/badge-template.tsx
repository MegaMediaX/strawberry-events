
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
        @media print { @page { size: 60mm 40mm; margin: 0; } }
        .badge-sheet {
          width: 60mm; height: 40mm; box-sizing: border-box;
          display: flex; flex-direction: column; align-items: center;
          padding: 0.3in 0.25in; text-align: center; color: #111; background: #fff;
        }
        .badge-tag {
          width: 100%; color: #fff; font-weight: 800; letter-spacing: 0.1em;
          font-size: 28px; padding: 14px 0; border-radius: 8px;
        }
        .badge-name { margin-top: 0.4in; font-size: 30px; font-weight: 700; line-height: 1.1; }
        .badge-company { margin-top: 8px; font-size: 18px; color: #555; }
        .badge-qr { margin-top: auto; }
      `}</style>
    </div>
  );
}
