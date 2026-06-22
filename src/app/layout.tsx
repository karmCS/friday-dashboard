import type { Metadata } from "next";

import "./globals.css";

export const metadata: Metadata = {
  title: "Friday — Status Window",
  description: "Single-pane command center for the Friday homelab.",
};

// The "Questism" type system: Black Han Sans (display), Barlow (body), JetBrains Mono
// (labels), Zen Kaku Gothic New (JP accents). Loaded via <link> — the design's own font set.
const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Black+Han+Sans&family=Barlow:wght@400;500;600;700;800&family=Zen+Kaku+Gothic+New:wght@400;500;700&family=JetBrains+Mono:wght@400;500;700&display=swap";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href={FONTS_HREF} rel="stylesheet" />
      </head>
      <body>{children}</body>
    </html>
  );
}
