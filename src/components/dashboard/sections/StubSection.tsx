"use client";

interface StubSectionProps {
  title: string;
}

/**
 * Placeholder for sections not yet ported in this spine pass (Deficit, Inspector, Fitness,
 * Tacos, Infra, Landing, Our Footage, Portfolio, Social). Uses the design's "OTHER" fallback
 * frame so navigation is fully wired and each lands somewhere on-brand until its real port.
 */
export function StubSection({ title }: StubSectionProps) {
  return (
    <div
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        background: "linear-gradient(160deg,#163a55,#0b2033)",
        clipPath:
          "polygon(0 0,calc(100% - 22px) 0,100% 22px,100% calc(100% - 22px),calc(100% - 22px) 100%,22px 100%,0 calc(100% - 22px),0 22px)",
        boxShadow: "inset 0 0 0 2px rgba(150,212,236,.4)",
        padding: "34px 38px",
      }}
    >
      <div style={{ fontFamily: "'Black Han Sans',sans-serif", fontSize: 18, color: "#7fd2ff", letterSpacing: ".1em" }}>
        {title}
      </div>
      <div
        style={{
          fontFamily: "'Barlow',sans-serif",
          fontSize: 14,
          color: "#8fb6d2",
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
