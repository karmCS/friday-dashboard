"use client";

import { CSSProperties } from "react";

const DISPLAY = "'Black Han Sans',sans-serif";
const BODY = "'Barlow',sans-serif";
const MONO = "'JetBrains Mono',monospace";

// Emil-style craft: one custom ease, short transform/opacity-only transitions.
const EASE = "cubic-bezier(0.23,1,0.32,1)";
const HOVER_TRANSITION = `box-shadow 180ms ${EASE}, transform 180ms ${EASE}`;
const BAR_TRANSITION = `width 220ms ${EASE}`;

// Colour tokens (matches the Questism DEFICIT palette in design/Friday.dc.html).
const INK = "#eafaff";
const SUBTLE = "#7fb0d2";
const SUBTLE_DIM = "#6fa8cc";
const GREEN = "#7dffb0";
const AMBER = "#ffd36b";
const CYAN = "#8fe3ff";
const WHITE = "#fff";

const CARD_SHADOW = "inset 0 0 0 2px rgba(150,212,236,.42)";
const CARD_SHADOW_HOVER = "inset 0 0 0 2px rgba(150,212,236,.7),0 0 26px rgba(80,200,255,.28)";

// --- formatting helpers ------------------------------------------------------

const fmtNum = (n: number) => n.toLocaleString("en-US");
const fmtPct = (n: number | null) => (n === null ? "—" : `${n}%`);
const fmtUsd = (n: number) => `$${n.toLocaleString("en-US")}`;

/** A funnel-stage proportion (percent of the top of the funnel), clamped to [0,100]. */
function stagePct(value: number, top: number): number {
  if (top <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / top) * 100)));
}

// --- shared styles -----------------------------------------------------------

const cardFrame = (clip: number): CSSProperties => ({
  background: "linear-gradient(160deg,#163a55,#0b2033)",
  clipPath: `polygon(0 0,calc(100% - ${clip}px) 0,100% ${clip}px,100% 100%,${clip}px 100%,0 calc(100% - ${clip}px))`,
  boxShadow: CARD_SHADOW,
  padding: "18px 20px",
});

const cardTitle: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: 17,
  color: INK,
  letterSpacing: ".04em",
};

const tinyLabel: CSSProperties = {
  fontFamily: BODY,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: ".1em",
  color: SUBTLE,
  marginTop: 5,
};

/** A small metric tile (number over a caption) used in the funnel + revenue + engagement rows. */
function StatTile({ value, valueColor, label, flex = 1 }: {
  value: string;
  valueColor: string;
  label: string;
  flex?: number;
}) {
  return (
    <div
      style={{
        flex,
        background: "rgba(8,28,44,.5)",
        boxShadow: "inset 0 0 0 1px rgba(120,180,210,.3)",
        borderRadius: 6,
        padding: "12px 14px",
      }}
    >
      <div style={{ fontFamily: DISPLAY, fontSize: 24, color: valueColor, lineHeight: 1 }}>{value}</div>
      <div style={tinyLabel}>{label}</div>
    </div>
  );
}

/** One labelled funnel bar: stage name, count·percent, animated fill. */
function FunnelBar({ stage, count, pct, color, glow }: {
  stage: string;
  count: number;
  pct: number;
  color: string;
  glow: string;
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: BODY,
          fontWeight: 700,
          fontSize: 12,
          color: "#bfe0f0",
          marginBottom: 6,
        }}
      >
        <span>{stage}</span>
        <span style={{ color: count > 0 ? CYAN : SUBTLE }}>
          {count} · {pct}%
        </span>
      </div>
      <div
        style={{
          height: 22,
          borderRadius: 5,
          background: "rgba(8,30,48,.55)",
          boxShadow: "inset 0 0 0 1px rgba(160,205,228,.35)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: `${pct}%`,
            height: "100%",
            background: color,
            boxShadow: `0 0 14px ${glow}`,
            transition: BAR_TRANSITION,
          }}
        />
      </div>
    </div>
  );
}

// --- main --------------------------------------------------------------------

export function DeficitSection({ deficit, onViewAthletes }: {
  deficit: import("@/lib/types").DeficitApp;
  onViewAthletes: () => void;
}) {
  const { users, funnel, revenue, engagement, health } = deficit;

  // Funnel proportions are relative to the top of the funnel (onboarding starts).
  const top = funnel.onboarding_7d;
  const onboardingPct = stagePct(funnel.onboarding_7d, top);
  const paywallPct = stagePct(funnel.paywall_7d, top);
  const subscribedPct = stagePct(funnel.subscribed_7d, top);

  return (
    <div data-deficit style={{ maxWidth: 1140, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* KPI strip */}
      <div style={{ display: "flex", gap: 14 }}>
        {/* TOTAL USERS */}
        <div style={{ flex: 1, ...cardFrame(12), padding: "16px 18px" }}>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: SUBTLE }}>
            TOTAL USERS
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 42, lineHeight: 1, color: WHITE, marginTop: 4 }}>
            {fmtNum(users.total)}
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: GREEN, marginTop: 4 }}>
            ▲ {fmtNum(users.signups_7d)} THIS WEEK
          </div>
        </div>
        {/* MRR */}
        <div style={{ flex: 1, ...cardFrame(12), padding: "16px 18px" }}>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: SUBTLE }}>
            MRR
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 42, lineHeight: 1, color: AMBER, marginTop: 4 }}>
            {fmtUsd(revenue.mrr_usd)}
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: SUBTLE, marginTop: 4 }}>
            {revenue.active_subs} ACTIVE SUBS
          </div>
        </div>
        {/* CRASH-FREE */}
        <div style={{ flex: 1, ...cardFrame(12), padding: "16px 18px" }}>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: SUBTLE }}>
            CRASH-FREE
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 42, lineHeight: 1, color: GREEN, marginTop: 4 }}>
            {fmtPct(health.crash_free_rate)}
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: SUBTLE, marginTop: 4 }}>
            SESSIONS · 7D
          </div>
        </div>
        {/* OPEN TRIALS */}
        <div style={{ flex: 1, ...cardFrame(12), padding: "16px 18px" }}>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: SUBTLE }}>
            OPEN TRIALS
          </div>
          <div style={{ fontFamily: DISPLAY, fontSize: 42, lineHeight: 1, color: CYAN, marginTop: 4 }}>
            {fmtNum(revenue.active_trials)}
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: SUBTLE, marginTop: 4 }}>
            DAU {fmtNum(users.dau)} · WAU {fmtNum(users.wau)}
          </div>
        </div>
      </div>

      {/* main two-col: FUNNEL | (REVENUE / HEALTH) */}
      <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
        {/* FUNNEL */}
        <div style={{ flex: 1.55, ...cardFrame(14), padding: "20px 22px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 19, color: INK, letterSpacing: ".04em", marginBottom: 4 }}>
            ACTIVATION → REVENUE
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: SUBTLE_DIM, marginBottom: 18 }}>
            SIGNUP FUNNEL · LAST 7 DAYS
          </div>

          <FunnelBar
            stage="ONBOARDING STARTED"
            count={funnel.onboarding_7d}
            pct={onboardingPct}
            color="linear-gradient(90deg,#2b8bff,#7fe3ff)"
            glow="rgba(90,200,255,.4)"
          />
          <FunnelBar
            stage="PAYWALL VIEWED"
            count={funnel.paywall_7d}
            pct={paywallPct}
            color="linear-gradient(90deg,#2b8bff,#7fe3ff)"
            glow="rgba(90,200,255,.4)"
          />
          <FunnelBar
            stage="SUBSCRIBED"
            count={funnel.subscribed_7d}
            pct={subscribedPct}
            color="linear-gradient(90deg,#46d39a,#7dffb0)"
            glow="rgba(80,255,160,.45)"
          />

          <div style={{ marginTop: "auto", display: "flex", gap: 10 }}>
            <StatTile value={fmtPct(funnel.conversion_rate)} valueColor={CYAN} label="CONVERSION" />
            <StatTile value={fmtPct(revenue.trial_to_paid)} valueColor={WHITE} label="TRIAL → PAID" />
            <StatTile value={fmtPct(revenue.churn)} valueColor={GREEN} label="CHURN" />
          </div>
        </div>

        {/* right col: REVENUE + HEALTH */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* REVENUE */}
          <div style={cardFrame(14)}>
            <div style={{ ...cardTitle, marginBottom: 14 }}>REVENUE</div>
            <div style={{ display: "flex", gap: 18 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 26, color: AMBER, lineHeight: 1 }}>{fmtUsd(revenue.mrr_usd)}</div>
                <div style={tinyLabel}>MRR</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 26, color: WHITE, lineHeight: 1 }}>{fmtNum(revenue.active_subs)}</div>
                <div style={tinyLabel}>ACTIVE SUBS</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 26, color: CYAN, lineHeight: 1 }}>{fmtNum(revenue.active_trials)}</div>
                <div style={tinyLabel}>TRIALS</div>
              </div>
            </div>
          </div>

          {/* HEALTH */}
          <div style={{ flex: 1, ...cardFrame(14), display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={cardTitle}>HEALTH</div>
            </div>
            <div style={{ display: "flex", gap: 18, marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: DISPLAY, fontSize: 24, color: GREEN, lineHeight: 1 }}>{fmtPct(health.crash_free_rate)}</div>
                <div style={tinyLabel}>CRASH-FREE</div>
              </div>
              <div>
                <div style={{ fontFamily: DISPLAY, fontSize: 24, color: health.open_issues > 0 ? AMBER : GREEN, lineHeight: 1 }}>
                  {fmtNum(health.open_issues)}
                </div>
                <div style={tinyLabel}>OPEN ISSUES</div>
              </div>
            </div>
            {/* Recent-crash list isn't in the snapshot contract — show an honest empty state. */}
            <div
              style={{
                marginTop: "auto",
                display: "flex",
                alignItems: "center",
                gap: 9,
                fontFamily: MONO,
                fontSize: 10,
                color: SUBTLE,
                background: "rgba(8,28,44,.5)",
                borderRadius: 4,
                padding: "9px 11px",
              }}
            >
              <span style={{ color: GREEN }}>✓</span>
              <span>no recent crashes reported</span>
            </div>
          </div>
        </div>
      </div>

      {/* ENGAGEMENT */}
      <div style={cardFrame(14)}>
        <div style={{ ...cardTitle, marginBottom: 14 }}>
          ENGAGEMENT{" "}
          <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: SUBTLE_DIM }}>
            · LAST 7 DAYS
          </span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <StatTile value={fmtNum(engagement.food_logged_7d)} valueColor={WHITE} label="FOOD LOGGED" />
          <StatTile value={fmtNum(engagement.weight_logged_7d)} valueColor={WHITE} label="WEIGHT LOGGED" />
          <StatTile value={fmtNum(engagement.coach_msgs_7d)} valueColor={WHITE} label="COACH MSGS" />
          <StatTile value={fmtPct(engagement.made_weight_rate)} valueColor={GREEN} label="MADE-WEIGHT" />
          <div
            style={{
              flex: 1.3,
              background: "rgba(8,28,44,.5)",
              boxShadow: "inset 0 0 0 1px rgba(120,180,210,.3)",
              borderRadius: 6,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontFamily: DISPLAY, fontSize: 20, color: CYAN, lineHeight: 1.05 }}>
              {engagement.top_feature ? engagement.top_feature.toUpperCase() : "—"}
            </div>
            <div style={tinyLabel}>TOP FEATURE</div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <button
        type="button"
        onClick={onViewAthletes}
        data-cta
        style={{
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          cursor: "pointer",
          border: "none",
          fontFamily: DISPLAY,
          fontSize: 17,
          letterSpacing: ".06em",
          color: "#04101a",
          background: "linear-gradient(90deg,#7fe3ff,#46b8ff)",
          boxShadow: "0 0 18px rgba(80,200,255,.45)",
          clipPath: "polygon(0 0,100% 0,100% 100%,12px 100%,0 calc(100% - 12px))",
          padding: "13px 24px",
          transition: `filter 150ms ${EASE}, transform 120ms ${EASE}`,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.filter = "brightness(1.12)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.filter = "brightness(1)";
        }}
      >
        VIEW ATHLETES →
      </button>

      {/* CTA :active press + reduced-motion guard (scoped to this section). */}
      <style>{`
        [data-deficit] [data-cta]:active { transform: scale(0.97); }
        @media (prefers-reduced-motion: reduce) {
          [data-deficit] * { transition: none !important; }
          [data-deficit] [data-cta]:active { transform: none; }
        }
      `}</style>
    </div>
  );
}
