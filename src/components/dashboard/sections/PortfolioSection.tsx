"use client";

import { CSSProperties } from "react";

import { t, tabularNum } from "@/components/dashboard/tokens";
import { fmtNum } from "@/lib/format";
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
      {/* KPI strip — real values where we have them, honest placeholders where we don't. */}
      <div className="fr-row" style={{ gap: 13 }}>
        {/* VISITORS · 7D — real. WoW comparison isn't in the snapshot. */}
        <KpiCard
          label="VISITORS · 7D"
          value={fmtNum(portfolio.visitors_7d)}
          valueColor={t.text}
          sub={<span style={pendingTag}>WoW — · not yet wired</span>}
        />

        {/* PAGEVIEWS — real, plus a safe derived per-visit ratio. */}
        <KpiCard
          label="PAGEVIEWS · 7D"
          value={fmtNum(portfolio.pageviews_7d)}
          valueColor={t.text}
          sub={pvPerVisit === "—" ? "NO TRAFFIC YET" : `${pvPerVisit} / VISIT`}
        />

        {/* TOP PAGE — real (nullable → "—"). Replaces the design's invented "contact clicks". */}
        <KpiCard
          label="TOP PAGE"
          value={portfolio.top_page ?? "—"}
          valueColor={t.text}
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
          valueColor={t.accent}
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
          full ranked list + counts as a clearly pending region (no faux rank). */}
      <div style={card()}>
        <div style={{ ...sectionTitle, marginBottom: 14 }}>TOP PAGES</div>
        {portfolio.top_page === null ? (
          <div style={pendingTag}>top page — · not yet wired</div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ flex: 1, fontFamily: t.font.body, fontWeight: 700, fontSize: 13, color: t.textBody }}>
              {portfolio.top_page}
            </span>
            {/* Honest empty state: per-page ranking/counts aren't wired, so no faux "#1" rank chip. */}
            <span
              style={{
                fontFamily: t.font.mono,
                fontSize: 9,
                letterSpacing: ".12em",
                color: t.textDim,
                border: `1px dashed ${t.frame}`,
                borderRadius: 3,
                padding: "2px 7px",
              }}
            >
              PENDING
            </span>
          </div>
        )}
        <div style={{ ...pendingTag, marginTop: 12 }}>
          full ranked list + per-page hit counts — · not yet wired
        </div>
      </div>
    </div>
  );
}
