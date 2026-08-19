import type { Metadata } from "next";
import { Space_Grotesk, Instrument_Serif } from "next/font/google";

import "../globals.css";

const spaceGrotesk = Space_Grotesk({ subsets: ["latin"], variable: "--font-sans" });
const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-heading",
});

/**
 * Badge-profile pages sit OUTSIDE `[locale]`, so they need their own root
 * layout. The URL is printed onto a physical badge and has to stay as short as
 * the QR allows — `/c/ABC12345` is 8 characters of payload, `/en/c/ABC12345`
 * would be three more, and at this symbol size three characters is real
 * millimetres. A static `c` segment also outranks the `[locale]` pattern, so
 * "c" is never mistaken for a language.
 *
 * `robots` is set here rather than per-page so a page added under `/c/` later
 * cannot forget it. These carry attendee names; they must never be indexed.
 */
export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function BadgeProfileLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${spaceGrotesk.variable} ${instrumentSerif.variable}`}>
      <body className="min-h-screen bg-background text-foreground antialiased">{children}</body>
    </html>
  );
}
