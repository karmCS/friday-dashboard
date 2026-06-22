"use client";

import { CSSProperties } from "react";

const DISPLAY = "'Black Han Sans',sans-serif";
const BODY = "'Barlow',sans-serif";
const JP = "'Zen Kaku Gothic New',sans-serif";

// Emil-style craft: one custom ease, short transform/opacity-only transitions.
const EASE = "cubic-bezier(0.23,1,0.32,1)";

// The channels that light up at launch (matches design/Friday.dc.html lines 721–724).
const CHANNELS: readonly string[] = ["X / Twitter", "YouTube", "Instagram", "TikTok"];

const chip: CSSProperties = {
  fontFamily: BODY,
  fontWeight: 700,
  fontSize: 12,
  color: "#5f7c8c",
  background: "rgba(120,170,200,.06)",
  boxShadow: "inset 0 0 0 1px rgba(120,170,200,.2)",
  borderRadius: 99,
  padding: "9px 18px",
  transition: `box-shadow 180ms ${EASE}, color 180ms ${EASE}`,
};

export function SocialSection() {
  return (
    <div
      data-social
      style={{
        maxWidth: 760,
        margin: "40px auto 0",
        textAlign: "center",
        background: "linear-gradient(160deg,#11202e,#0a141d)",
        clipPath: "polygon(0 0,calc(100% - 22px) 0,100% 22px,100% 100%,22px 100%,0 calc(100% - 22px))",
        boxShadow: "inset 0 0 0 2px rgba(120,170,200,.32)",
        padding: "48px 44px",
      }}
    >
      {/* lock badge */}
      <div
        style={{
          width: 64,
          height: 64,
          margin: "0 auto 22px",
          borderRadius: "50%",
          background: "rgba(120,170,200,.08)",
          boxShadow: "inset 0 0 0 2px rgba(120,170,200,.3)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 30,
        }}
        aria-hidden="true"
      >
        🔒
      </div>

      <div style={{ fontFamily: DISPLAY, fontSize: 34, color: "#cfe2ee", letterSpacing: ".04em" }}>
        COMING SOON{" "}
        <span style={{ fontFamily: JP, fontWeight: 700, fontSize: 24, color: "#6f97ac" }}>（準備中）</span>
      </div>

      <div
        style={{
          fontFamily: BODY,
          fontSize: 14,
          color: "#7f9fb6",
          marginTop: 14,
          lineHeight: 1.6,
          maxWidth: 480,
          marginLeft: "auto",
          marginRight: "auto",
        }}
      >
        Social isn&apos;t tracked yet. When the accounts go live at launch, this section lights up with
        reach, engagement, and follower growth across channels.
      </div>

      <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap", marginTop: 26 }}>
        {CHANNELS.map((name) => (
          <span
            key={name}
            style={chip}
            onMouseEnter={(e) => {
              e.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(120,170,200,.45)";
              e.currentTarget.style.color = "#9fc4dc";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.boxShadow = "inset 0 0 0 1px rgba(120,170,200,.2)";
              e.currentTarget.style.color = "#5f7c8c";
            }}
          >
            {name}
          </span>
        ))}
      </div>

      {/* reduced-motion guard (scoped to this section). */}
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          [data-social] * { transition: none !important; }
        }
      `}</style>
    </div>
  );
}
