import { QrCodeDisplay } from "@/components/public/qr-code-display";

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
  qrValue: string;
}

/**
 * A 4×6 thermal badge. Print CSS sizes the page to 4in × 6in. The role tag sits
 * on top with a tag-specific color; name, company, and QR below.
 */
export function BadgeTemplate({ badge }: { badge: BadgeData }) {
  return (
    <div className="badge-sheet">
      <div className="badge-tag" style={{ background: TAG_COLOR[badge.tag] }}>
        {badge.tag.toUpperCase()}
      </div>
      <div className="badge-name">{badge.fullName}</div>
      {badge.company && <div className="badge-company">{badge.company}</div>}
      <div className="badge-qr">
        <QrCodeDisplay value={badge.qrValue} />
      </div>

      <style>{`
        @media print { @page { size: 4in 6in; margin: 0; } }
        .badge-sheet {
          width: 4in; height: 6in; box-sizing: border-box;
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
