"use client";

import { CSSProperties } from "react";

import type { DeficitLanding } from "@/lib/types";

/**
 * Landing (getdeficit.com) — full section.
 *
 * HONESTY RULE: only five fields are real (from the snapshot / Umami):
 *   visitors_7d, pageviews_7d, bounce_rate, top_source, ad_spend_7d.
 *
 * The original Questism design (Friday.dc.html, LANDING) also showed: an avg-time KPI, a
 * visit→signup conversion + signup count, a 14-day traffic bar chart, a per-source % breakdown,
 * and a per-page hit-count list. NONE of those are in the snapshot, so they are rendered as
 * clearly-labelled placeholders ("— · not yet wired", muted sample bars) — never fabricated.
 *
 * Real fields render real values. Pageviews-per-visit is a safe derived value (pageviews/visitors),
 * not an invented number. Everything else is honestly marked pending.
 */

const DISPLAY = "'Black Han Sans',sans-serif";
const BODY = "'Barlow',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// Questism teal frame, shared by every card.
const TEAL_FRAME = "linear-gradient(160deg,#163a55,#0b2033)";
const EASE = "cubic-bezier(0.23,1,0.32,1)";

// Muted sample-bar heights for the not-yet-wired 14-day traffic chart. Deliberately flat-ish and
// low-contrast so they read as a placeholder, not as data.
const SAMPLE_BAR_HEIGHTS = [38, 44, 34, 47, 40, 36, 30, 45, 42, 39, 33, 48, 41, 37];

const fmtNum = (n: number): string => n.toLocaleString("en-US");

/** A teal Questism card frame with the angled clip-path corner. */
const card = (extra?: CSSProperties): CSSProperties => ({
  background: TEAL_FRAME,
  clipPath:
    "polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))",
  boxShadow: "inset 0 0 0 2px rgba(150,212,236,.42)",
  padding: "18px 20px",
  ...extra,
});

const kicker: CSSProperties = {
  fontFamily: BODY,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".14em",
  color: "#7fb0d2",
};

const kpiNum = (color: string): CSSProperties => ({
  fontFamily: DISPLAY,
  fontSize: 40,
  lineHeight: 1,
  color,
  marginTop: 4,
});

const kpiSub: CSSProperties = {
  fontFamily: BODY,
  fontWeight: 700,
  fontSize: 11,
  color: "#7fb0d2",
  marginTop: 4,
};

const sectionTitle: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: 17,
  color: "#eafaff",
  letterSpacing: ".03em",
};

/** Muted "not yet wired" tag — the consistent honesty marker across placeholder regions. */
const pendingTag: CSSProperties = {
  fontFamily: MONO,
  fontSize: 10,
  color: "#5d7785",
  letterSpacing: ".04em",
};

/** A KPI card that brightens its frame on hover (transform/opacity-safe transition only). */
function KpiCard({
  label,
  value,
  valueColor,
  sub,
  flex,
}: {
  label: string;
  value: string;
  valueColor: string;
  sub: React.ReactNode;
  flex?: number;
}) {
  return (
    <div
      className="ls-card"
      style={card({
        flex: flex ?? 1,
        display: "flex",
        flexDirection: "column",
        transition: `transform 160ms ${EASE}, box-shadow 160ms ${EASE}`,
      })}
      onMouseEnter={(e) => {
        e.currentTarget.style.boxShadow =
          "inset 0 0 0 2px rgba(150,212,236,.7),0 0 22px rgba(80,200,255,.3)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.boxShadow = "inset 0 0 0 2px rgba(150,212,236,.42)";
      }}
    >
      <div style={kicker}>{label}</div>
      <div style={kpiNum(valueColor)}>{value}</div>
      <div style={kpiSub}>{sub}</div>
    </div>
  );
}

/**
 * Landing section — KPI strip (visitors, pageviews + derived per-visit, bounce/avg-time,
 * visit→signup placeholder), a placeholder traffic chart, and SOURCES + TOP PAGES panels.
 */
export function LandingSection({ landing }: { landing: DeficitLanding }) {
  const pvPerVisit =
    landing.visitors_7d > 0
      ? (landing.pageviews_7d / landing.visitors_7d).toFixed(1)
      : "—";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .ls-card { transition: none !important; }
        }
      `}</style>

      {/* KPI strip — real values where we have them, honest placeholders where we don't. */}
      <div style={{ display: "flex", gap: 13 }}>
        {/* VISITORS · 7D — real. WoW comparison isn't in the snapshot, so it's marked pending. */}
        <KpiCard
          label="VISITORS · 7D"
          value={fmtNum(landing.visitors_7d)}
          valueColor="#fff"
          sub={<span style={pendingTag}>WoW — · not yet wired</span>}
        />

        {/* PAGEVIEWS — real, plus a safe derived per-visit ratio (not fabricated). */}
        <KpiCard
          label="PAGEVIEWS · 7D"
          value={fmtNum(landing.pageviews_7d)}
          valueColor="#fff"
          sub={pvPerVisit === "—" ? "NO TRAFFIC YET" : `${pvPerVisit} / VISIT`}
        />

        {/* BOUNCE — real (nullable → "—"). Avg-time has no source, so it's a labelled placeholder. */}
        <KpiCard
          label="BOUNCE RATE · 7D"
          value={landing.bounce_rate === null ? "—" : `${landing.bounce_rate}%`}
          valueColor="#8fe3ff"
          sub={
            landing.bounce_rate === null ? (
              <span style={pendingTag}>no bounce data yet</span>
            ) : (
              <span style={pendingTag}>avg time — · not yet wired</span>
            )
          }
        />

        {/* AD SPEND · 7D — real. The design's "visit → signup" funnel isn't in the snapshot;
            ad spend is the real spend metric we do have, shown in its place. */}
        <KpiCard
          label="AD SPEND · 7D"
          value={`$${fmtNum(landing.ad_spend_7d)}`}
          valueColor="#ffd36b"
          sub={<span style={pendingTag}>visit→signup — · not yet wired</span>}
        />
      </div>

      <div style={{ display: "flex", gap: 13, alignItems: "stretch" }}>
        {/* TRAFFIC — 14-day daily breakdown is NOT in the snapshot. Muted sample bars, clearly
            labelled as a placeholder. No real per-day numbers are implied. */}
        <div style={card({ flex: 1.5, display: "flex", flexDirection: "column" })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div style={sectionTitle}>TRAFFIC · GETDEFICIT.COM</div>
            <div style={pendingTag}>14-DAY · NOT YET WIRED</div>
          </div>
          <div
            aria-hidden="true"
            style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 130, opacity: 0.45 }}
          >
            {SAMPLE_BAR_HEIGHTS.map((h, i) => (
              <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                <div
                  style={{
                    height: `${h}%`,
                    background: "linear-gradient(180deg,#3a6f90,#274a63)",
                    borderRadius: "3px 3px 0 0",
                    boxShadow: "inset 0 0 0 1px rgba(120,180,210,.2)",
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ ...pendingTag, marginTop: 12 }}>
            Sample shape only — daily traffic series isn&apos;t in the snapshot yet.
          </div>
        </div>

        {/* SOURCES + TOP PAGES */}
        <div style={card({ flex: 1, display: "flex", flexDirection: "column" })}>
          <div style={{ ...sectionTitle, marginBottom: 14 }}>SOURCES</div>

          {/* The ONLY real source field is top_source. The design's per-source % breakdown
              (Organic 46% / Direct 28% / …) is NOT in the snapshot — so we show just the one
              real value and mark the breakdown pending. */}
          {landing.top_source === null ? (
            <div style={pendingTag}>top source — · not yet wired</div>
          ) : (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 13, color: "#bfe0f0" }}>Top source</span>
                <span style={{ fontFamily: MONO, fontSize: 11, color: "#8fe3ff" }}>{landing.top_source}</span>
              </div>
              <div style={{ ...pendingTag, marginTop: 8 }}>
                per-source % breakdown — · not yet wired
              </div>
            </div>
          )}

          <div style={{ ...sectionTitle, fontSize: 15, margin: "18px 0 10px" }}>TOP PAGES</div>
          {/* Top-pages list with per-page hit counts is NOT in the snapshot. Honest placeholder. */}
          <div style={pendingTag}>per-page hit counts — · not yet wired</div>
        </div>
      </div>
    </div>
  );
}
