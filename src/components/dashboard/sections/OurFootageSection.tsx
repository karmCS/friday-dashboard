"use client";

import { CSSProperties } from "react";

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

const DISPLAY = "'Black Han Sans',sans-serif";
const BODY = "'Barlow',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// Questism teal frame, shared by both panels.
const TEAL_FRAME = "linear-gradient(160deg,#163a55,#0b2033)";
const EASE = "cubic-bezier(0.23,1,0.32,1)";

const fmtNum = (n: number): string => n.toLocaleString("en-US");

/** A teal Questism card frame with the angled clip-path corner. */
const card = (extra?: CSSProperties): CSSProperties => ({
  background: TEAL_FRAME,
  clipPath:
    "polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))",
  boxShadow: "inset 0 0 0 2px rgba(150,212,236,.42)",
  padding: "26px 28px",
  ...extra,
});

const kicker: CSSProperties = {
  fontFamily: BODY,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".14em",
  color: "#7fb0d2",
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

  const statusColor = isDown ? "#ff9a8a" : "#7dffb0";
  const statusGlow = isDown ? "rgba(255,120,100,.55)" : "rgba(80,255,160,.55)";
  const statusLabel = isDown ? "DOWN" : "ONLINE";
  const statusSub = isDown ? "our-footage.com is unreachable" : "our-footage.com is reachable";

  const pvPerVisit =
    footage.visitors_7d > 0 ? (footage.pageviews_7d / footage.visitors_7d).toFixed(1) : "—";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .ofs-panel { transition: none !important; }
        }
      `}</style>

      {/* STATUS — the headline answer: up or down. */}
      <div
        className="ofs-panel"
        style={card({
          display: "flex",
          alignItems: "center",
          gap: 22,
          transition: `transform 180ms ${EASE}, box-shadow 180ms ${EASE}`,
        })}
        onMouseEnter={(e) => {
          e.currentTarget.style.boxShadow = `inset 0 0 0 2px rgba(150,212,236,.7),0 0 26px ${statusGlow}`;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.boxShadow = "inset 0 0 0 2px rgba(150,212,236,.42)";
        }}
      >
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
              fontFamily: DISPLAY,
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
          <div style={{ fontFamily: MONO, fontSize: 11, color: "#7fb0d2" }}>{statusSub}</div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: "#5d7785", marginTop: 5 }}>
            {isDown ? "VIA KUMA MONITOR" : "ALL MONITORS ✓"}
          </div>
        </div>
      </div>

      {/* VISITORS — the only other thing Mark wants. */}
      <div style={{ display: "flex", gap: 13 }}>
        <div
          className="ofs-panel"
          style={card({
            flex: 1.4,
            transition: `transform 180ms ${EASE}, box-shadow 180ms ${EASE}`,
          })}
          onMouseEnter={(e) => {
            e.currentTarget.style.boxShadow =
              "inset 0 0 0 2px rgba(150,212,236,.7),0 0 22px rgba(80,200,255,.3)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.boxShadow = "inset 0 0 0 2px rgba(150,212,236,.42)";
          }}
        >
          <div style={kicker}>VISITORS · 7D</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 80, lineHeight: 1, color: "#fff", marginTop: 6 }}>
            {fmtNum(footage.visitors_7d)}
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 12, color: "#7fb0d2", marginTop: 6 }}>
            UNIQUE VISITORS · LAST 7 DAYS
          </div>
        </div>

        <div style={card({ flex: 1, display: "flex", flexDirection: "column" })}>
          <div style={kicker}>PAGEVIEWS · 7D</div>
          <div style={{ fontFamily: DISPLAY, fontSize: 56, lineHeight: 1, color: "#8fe3ff", marginTop: 6 }}>
            {fmtNum(footage.pageviews_7d)}
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: "#7fb0d2", marginTop: "auto", paddingTop: 12 }}>
            {pvPerVisit === "—" ? "NO TRAFFIC YET" : `${pvPerVisit} / VISIT`}
          </div>
        </div>
      </div>
    </div>
  );
}
