import type { Metadata } from "next";
import { Barlow, Black_Han_Sans, JetBrains_Mono, Zen_Kaku_Gothic_New } from "next/font/google";

import "./globals.css";

export const metadata: Metadata = {
  title: "Friday — Status Window",
  description: "Single-pane command center for the Friday homelab.",
};

/**
 * The "Questism" type system, self-hosted via next/font: Black Han Sans (display),
 * Barlow (body), JetBrains Mono (labels), Zen Kaku Gothic New (JP accents). next/font
 * preloads the used subsets and injects a size-adjusted fallback, so the hero wordmark
 * and big numerals don't FOUT/reflow — and there's no runtime dependency on Google's CDN
 * (the box sits behind Cloudflare Access). Families are exposed as CSS variables consumed
 * by globals.css `--font-*`.
 */
const display = Black_Han_Sans({ weight: "400", subsets: ["latin"], display: "swap", variable: "--font-black-han-sans" });
const body = Barlow({ weight: ["400", "500", "600", "700", "800"], subsets: ["latin"], display: "swap", variable: "--font-barlow" });
const mono = JetBrains_Mono({ weight: ["400", "500", "700"], subsets: ["latin"], display: "swap", variable: "--font-jetbrains-mono" });
const jp = Zen_Kaku_Gothic_New({ weight: ["400", "500", "700"], subsets: ["latin"], display: "swap", variable: "--font-zen-kaku" });

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable} ${jp.variable}`}>
      <body>{children}</body>
    </html>
  );
}
