"use client";

import { t } from "@/components/dashboard/tokens";

interface StubSectionProps {
  title: string;
}

/**
 * Placeholder for sections not yet ported in this spine pass (Deficit, Inspector, Fitness,
 * Tacos, Infra, Landing, Our Footage, Portfolio, Social). Uses the design's "OTHER" fallback
 * frame so navigation is fully wired and each lands somewhere on-brand until its real port.
 * Reads as an honest empty/pending state — deliberately not styled like live data.
 */
export function StubSection({ title }: StubSectionProps) {
  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        background: "linear-gradient(160deg,#163a55,#0b2033)",
        clipPath: t.clipCard,
        boxShadow: `inset 0 0 0 2px ${t.frame}`,
        padding: "34px 38px",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontFamily: t.font.display,
          fontSize: 18,
          color: t.accent,
          letterSpacing: ".1em",
        }}
      >
        {title}
        <span
          style={{
            fontFamily: t.font.mono,
            fontSize: 10,
            letterSpacing: ".18em",
            color: t.textMuted,
            border: `1px solid ${t.frame}`,
            borderRadius: 2,
            padding: "2px 7px",
            textTransform: "uppercase",
          }}
        >
          Not Yet Wired
        </span>
      </div>
      <div
        style={{
          fontFamily: t.font.body,
          fontSize: 14,
          color: t.textMuted,
          marginTop: 10,
          lineHeight: 1.6,
          maxWidth: 560,
        }}
      >
        This section follows the same card → full pattern. Full build lands in the next pass —
        the Overview is wired to live data now.
      </div>
    </div>
  );
}
