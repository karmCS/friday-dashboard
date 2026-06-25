"use client";

import { CSSProperties } from "react";
import { t } from "@/components/dashboard/tokens";

// The channels that light up at launch (matches design/Friday.dc.html lines 721–724).
const CHANNELS: readonly string[] = ["X / Twitter", "YouTube", "Instagram", "TikTok"];

const chip: CSSProperties = {
  fontFamily: t.font.body,
  fontWeight: 700,
  fontSize: 12,
  color: t.textMuted,
  background: "rgba(120,170,200,.06)",
  boxShadow: `inset 0 0 0 1px ${t.frame}`,
  borderRadius: 99,
  padding: "9px 18px",
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
        boxShadow: `inset 0 0 0 2px ${t.frame}`,
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
          boxShadow: `inset 0 0 0 2px ${t.frame}`,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 30,
        }}
        aria-hidden="true"
      >
        🔒
      </div>

      <div style={{ fontFamily: t.font.display, fontSize: 34, color: t.text, letterSpacing: ".04em" }}>
        COMING SOON{" "}
        <span style={{ fontFamily: t.font.jp, fontWeight: 700, fontSize: 24, color: t.accent2 }}>
          （準備中）
        </span>
      </div>

      <div
        style={{
          fontFamily: t.font.body,
          fontSize: 14,
          color: t.textBody,
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
          <span key={name} style={chip}>
            {name}
          </span>
        ))}
      </div>
    </div>
  );
}
