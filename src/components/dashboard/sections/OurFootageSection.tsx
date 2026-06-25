"use client";

import { CSSProperties } from "react";

import { t, tabularNum } from "@/components/dashboard/tokens";
import { fmtNum } from "@/lib/format";
import type { Infra, OurFootage } from "@/lib/types";

/**
 * Our Footage (our-footage.com) — deliberately minimal (decided 2026-06-21). Mark only wants
 * two things from this property:
 *   (a) is the site up or down, and
 *   (b) how many visitors.
 *
 * Up/down is derived from the Kuma monitor names in {@link Infra.down}: DOWN if any down-service
 * name mentions "footage", else UP. Visitor counts come from the {@link OurFootage} slice (Umami).
 *
 * The OLD design framed this around video plays / downloads / watch-time — that was a mistake
 * (not a real data source for this property), so none of that is rendered here.
 */

// Questism teal frame, shared by both panels.
const TEAL_FRAME = "linear-gradient(160deg,#163a55,#0b2033)";

/** A teal Questism card frame with the angled clip-path corner. */
const card = (extra?: CSSProperties): CSSProperties => ({
  background: TEAL_FRAME,
  clipPath: t.clipCard,
  boxShadow: `inset 0 0 0 2px ${t.frame}`,
  padding: "26px 28px",
  ...extra,
});

const kicker: CSSProperties = {
  fontFamily: t.font.body,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".14em",
  color: t.textMuted,
};

interface OurFootageSectionProps {
  footage: OurFootage;
  infra: Infra;
}

/**
 * Our Footage section — a big up/down status badge plus the two visitor metrics. Sparse by
 * design: this is the whole property at a glance, nothing more.
 */
export function OurFootageSection({ footage, infra }: OurFootageSectionProps) {
  // DOWN if any currently-down service name mentions "footage" (case-insensitive), else UP.
  const isDown = infra.down.some((name) => /footage/i.test(name));

  const statusColor = isDown ? t.down : t.up;
  const statusGlow = isDown ? "rgba(255,120,100,.55)" : "rgba(80,255,160,.55)";
  const statusLabel = isDown ? "DOWN" : "ONLINE";
  const statusSub = isDown ? "our-footage.com is unreachable" : "our-footage.com is reachable";

  const pvPerVisit =
    footage.visitors_7d > 0 ? (footage.pageviews_7d / footage.visitors_7d).toFixed(1) : "—";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      {/* STATUS — the headline answer: up or down. */}
      <div
        className="fr-card"
        style={card({ display: "flex", alignItems: "center", gap: 22 })}
      >
        {/* Decorative state glyph — meaning carried by the adjacent ONLINE/DOWN text + color. */}
        <span
          aria-hidden="true"
          style={{
            fontSize: 46,
            lineHeight: 1,
            color: statusColor,
            filter: `drop-shadow(0 0 14px ${statusGlow})`,
          }}
        >
          ◆
        </span>
        <div style={{ flex: 1 }}>
          <div style={kicker}>OUR-FOOTAGE.COM · STATUS</div>
          <div
            style={{
              fontFamily: t.font.display,
              fontSize: 56,
              lineHeight: 0.95,
              color: statusColor,
              textShadow: `0 0 22px ${statusGlow}`,
              marginTop: 4,
            }}
          >
            {statusLabel}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontFamily: t.font.mono, fontSize: 11, color: t.textMuted }}>{statusSub}</div>
          <div style={{ fontFamily: t.font.mono, fontSize: 10, color: t.textDim, marginTop: 5 }}>
            {isDown ? "VIA KUMA MONITOR" : (
              <>
                ALL MONITORS <span aria-hidden="true">✓</span>
              </>
            )}
          </div>
        </div>
      </div>

      {/* VISITORS — the only other thing Mark wants. */}
      <div style={{ display: "flex", gap: 13 }}>
        <div className="fr-card" style={card({ flex: 1.4 })}>
          <div style={kicker}>VISITORS · 7D</div>
          <div
            style={{
              fontFamily: t.font.display,
              fontSize: 80,
              lineHeight: 1,
              color: t.text,
              marginTop: 6,
              ...tabularNum,
            }}
          >
            {fmtNum(footage.visitors_7d)}
          </div>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 12, color: t.textMuted, marginTop: 6 }}>
            UNIQUE VISITORS · LAST 7 DAYS
          </div>
        </div>

        <div style={card({ flex: 1, display: "flex", flexDirection: "column" })}>
          <div style={kicker}>PAGEVIEWS · 7D</div>
          <div
            style={{
              fontFamily: t.font.display,
              fontSize: 56,
              lineHeight: 1,
              color: t.accent,
              marginTop: 6,
              ...tabularNum,
            }}
          >
            {fmtNum(footage.pageviews_7d)}
          </div>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 11, color: t.textMuted, marginTop: "auto", paddingTop: 12 }}>
            {pvPerVisit === "—" ? "NO TRAFFIC YET" : `${pvPerVisit} / VISIT`}
          </div>
        </div>
      </div>
    </div>
  );
}
