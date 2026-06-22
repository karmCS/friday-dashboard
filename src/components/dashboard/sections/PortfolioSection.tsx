"use client";

import { CSSProperties } from "react";

import type { Portfolio } from "@/lib/types";

/**
 * Portfolio (markcalip.com) — full section.
 *
 * HONESTY RULE: only four fields are real (from the snapshot / Umami):
 *   visitors_7d, pageviews_7d, top_page, top_referrer.
 *
 * The original Questism design (Friday.dc.html, PORTFOLIO) also showed: contact-click counts +
 * inbound count, an avg-time + bounce KPI, a "top project" with view count, and a TOP PAGES list
 * with per-page hit counts and bars. NONE of those are in the snapshot, so they render as
 * clearly-labelled placeholders ("— · not yet wired") — never fabricated.
 *
 * Real fields render real values. Pageviews-per-visit is a safe derived value, not invented.
 */

const DISPLAY = "'Black Han Sans',sans-serif";
const BODY = "'Barlow',sans-serif";
const MONO = "'JetBrains Mono',monospace";

const TEAL_FRAME = "linear-gradient(160deg,#163a55,#0b2033)";
const EASE = "cubic-bezier(0.23,1,0.32,1)";

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
      className="ps-card"
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
 * Portfolio section — KPI strip (visitors, pageviews + derived per-visit, top page, top referrer)
 * plus a TOP PAGES panel. Per-page hit counts / contact clicks / avg-time are honest placeholders.
 */
export function PortfolioSection({ portfolio }: { portfolio: Portfolio }) {
  const pvPerVisit =
    portfolio.visitors_7d > 0
      ? (portfolio.pageviews_7d / portfolio.visitors_7d).toFixed(1)
      : "—";

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      <style>{`
        @media (prefers-reduced-motion: reduce) {
          .ps-card { transition: none !important; }
        }
      `}</style>

      {/* KPI strip — real values where we have them, honest placeholders where we don't. */}
      <div style={{ display: "flex", gap: 13 }}>
        {/* VISITORS · 7D — real. WoW comparison isn't in the snapshot. */}
        <KpiCard
          label="VISITORS · 7D"
          value={fmtNum(portfolio.visitors_7d)}
          valueColor="#fff"
          sub={<span style={pendingTag}>WoW — · not yet wired</span>}
        />

        {/* PAGEVIEWS — real, plus a safe derived per-visit ratio. */}
        <KpiCard
          label="PAGEVIEWS · 7D"
          value={fmtNum(portfolio.pageviews_7d)}
          valueColor="#fff"
          sub={pvPerVisit === "—" ? "NO TRAFFIC YET" : `${pvPerVisit} / VISIT`}
        />

        {/* TOP PAGE — real (nullable → "—"). Replaces the design's invented "contact clicks". */}
        <KpiCard
          label="TOP PAGE"
          value={portfolio.top_page ?? "—"}
          valueColor="#fff"
          sub={
            portfolio.top_page === null ? (
              <span style={pendingTag}>no page data yet</span>
            ) : (
              "MOST-VISITED PATH · 7D"
            )
          }
        />

        {/* TOP REFERRER — real (nullable → "—"). Replaces the design's invented avg-time/bounce. */}
        <KpiCard
          label="TOP REFERRER"
          value={portfolio.top_referrer ?? "—"}
          valueColor="#8fe3ff"
          sub={
            portfolio.top_referrer === null ? (
              <span style={pendingTag}>no referrer data yet</span>
            ) : (
              "BIGGEST TRAFFIC SOURCE · 7D"
            )
          }
        />
      </div>

      {/* TOP PAGES — the design listed per-page hit counts with bars. Per-page counts are NOT in
          the snapshot; only the single top_page string is. We surface that real value and mark the
          full ranked list + counts as pending. */}
      <div style={card()}>
        <div style={{ ...sectionTitle, marginBottom: 14 }}>TOP PAGES</div>
        {portfolio.top_page === null ? (
          <div style={pendingTag}>top page — · not yet wired</div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ flex: 1, fontFamily: BODY, fontWeight: 700, fontSize: 13, color: "#cfe2ee" }}>
              {portfolio.top_page}
            </span>
            <span style={{ fontFamily: MONO, fontSize: 11, color: "#8fe3ff" }}>#1</span>
          </div>
        )}
        <div style={{ ...pendingTag, marginTop: 12 }}>
          full ranked list + per-page hit counts — · not yet wired
        </div>
      </div>
    </div>
  );
}
