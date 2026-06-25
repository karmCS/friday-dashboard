"use client";

import { CSSProperties } from "react";

import { t, tabularNum } from "@/components/dashboard/tokens";
import { fmtNum, fmtPct } from "@/lib/format";

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
 * clearly-labelled placeholders ("— · not yet wired", honest empty states) — never fabricated.
 *
 * Real fields render real values. Pageviews-per-visit is a safe derived value (pageviews/visitors),
 * not an invented number. Everything else is honestly marked pending.
 */

// Questism teal frame, shared by every card.
const TEAL_FRAME = "linear-gradient(160deg,#163a55,#0b2033)";

/** A teal Questism card frame with the angled clip-path corner. */
const card = (extra?: CSSProperties): CSSProperties => ({
  background: TEAL_FRAME,
  clipPath: t.clipCard,
  boxShadow: `inset 0 0 0 2px ${t.frame}`,
  padding: "18px 20px",
  ...extra,
});

const kicker: CSSProperties = {
  fontFamily: t.font.body,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".14em",
  color: t.textMuted,
};

const kpiNum = (color: string): CSSProperties => ({
  fontFamily: t.font.display,
  fontSize: 40,
  lineHeight: 1,
  color,
  marginTop: 4,
  ...tabularNum,
});

const kpiSub: CSSProperties = {
  fontFamily: t.font.body,
  fontWeight: 700,
  fontSize: 11,
  color: t.textMuted,
  marginTop: 4,
};

const sectionTitle: CSSProperties = {
  fontFamily: t.font.display,
  fontSize: 17,
  color: t.text,
  letterSpacing: ".03em",
};

/** Muted "not yet wired" tag — the consistent honesty marker across placeholder regions. */
const pendingTag: CSSProperties = {
  fontFamily: t.font.mono,
  fontSize: 10,
  color: t.textDim,
  letterSpacing: ".04em",
};

/** A KPI card that brightens its frame on hover/focus (handled by the shared `fr-card` class). */
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
      className="fr-card"
      style={card({
        flex: flex ?? 1,
        display: "flex",
        flexDirection: "column",
      })}
    >
      <div style={kicker}>{label}</div>
      <div style={kpiNum(valueColor)}>{value}</div>
      <div style={kpiSub}>{sub}</div>
    </div>
  );
}

/**
 * Landing section — KPI strip (visitors, pageviews + derived per-visit, bounce/avg-time,
 * visit→signup placeholder), an honest empty traffic region, and SOURCES + TOP PAGES panels.
 */
export function LandingSection({ landing }: { landing: DeficitLanding }) {
  const pvPerVisit =
    landing.visitors_7d > 0
      ? (landing.pageviews_7d / landing.visitors_7d).toFixed(1)
      : "—";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      {/* KPI strip — real values where we have them, honest placeholders where we don't. */}
      <div style={{ display: "flex", gap: 13 }}>
        {/* VISITORS · 7D — real. WoW comparison isn't in the snapshot, so it's marked pending. */}
        <KpiCard
          label="VISITORS · 7D"
          value={fmtNum(landing.visitors_7d)}
          valueColor={t.text}
          sub={<span style={pendingTag}>WoW — · not yet wired</span>}
        />

        {/* PAGEVIEWS — real, plus a safe derived per-visit ratio (not fabricated). */}
        <KpiCard
          label="PAGEVIEWS · 7D"
          value={fmtNum(landing.pageviews_7d)}
          valueColor={t.text}
          sub={pvPerVisit === "—" ? "NO TRAFFIC YET" : `${pvPerVisit} / VISIT`}
        />

        {/* BOUNCE — real (nullable → "—"). Avg-time has no source, so it's a labelled placeholder. */}
        <KpiCard
          label="BOUNCE RATE · 7D"
          value={fmtPct(landing.bounce_rate)}
          valueColor={t.accent}
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
          valueColor={t.amber}
          sub={<span style={pendingTag}>visit→signup — · not yet wired</span>}
        />
      </div>

      <div style={{ display: "flex", gap: 13, alignItems: "stretch" }}>
        {/* TRAFFIC — 14-day daily breakdown is NOT in the snapshot. Honest empty state: no faux
            bars, just a dashed frame and a clear PENDING label so nothing reads as real data. */}
        <div style={card({ flex: 1.5, display: "flex", flexDirection: "column" })}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
            <div style={sectionTitle}>TRAFFIC · GETDEFICIT.COM</div>
            <div style={pendingTag}>14-DAY · NOT YET WIRED</div>
          </div>
          <div
            style={{
              flex: 1,
              minHeight: 130,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              border: `1px dashed ${t.frame}`,
              borderRadius: 4,
            }}
          >
            <div style={{ fontFamily: t.font.mono, fontSize: 12, color: t.textMuted, letterSpacing: ".08em" }}>
              PENDING — NOT YET WIRED
            </div>
            <div style={{ ...pendingTag, textAlign: "center" }}>
              Daily traffic series isn&apos;t in the snapshot yet.
            </div>
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
                <span style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 13, color: t.textBody }}>Top source</span>
                <span style={{ fontFamily: t.font.mono, fontSize: 11, color: t.accent }}>{landing.top_source}</span>
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
