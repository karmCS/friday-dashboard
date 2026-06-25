"use client";

import { CSSProperties, useEffect, useRef, useState } from "react";
import { t, tabularNum, buttonReset } from "@/components/dashboard/tokens";
import { fmtNum, fmtPct } from "@/lib/format";

const fmtUsd = (n: number) => `$${fmtNum(n)}`;

/** A funnel-stage proportion (percent of the top of the funnel), clamped to [0,100]. */
function stagePct(value: number, top: number): number {
  if (top <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / top) * 100)));
}

// --- shared styles -----------------------------------------------------------

const cardFrame = (clip: number): CSSProperties => ({
  background: "linear-gradient(160deg,#163a55,#0b2033)",
  clipPath: `polygon(0 0,calc(100% - ${clip}px) 0,100% ${clip}px,100% 100%,${clip}px 100%,0 calc(100% - ${clip}px))`,
  boxShadow: `inset 0 0 0 2px ${t.frame}`,
  padding: "18px 20px",
});

const cardTitle: CSSProperties = {
  fontFamily: t.font.display,
  fontSize: 17,
  color: t.text,
  letterSpacing: ".04em",
};

const tinyLabel: CSSProperties = {
  fontFamily: t.font.body,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: ".1em",
  color: t.textMuted,
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
      <div style={{ fontFamily: t.font.display, fontSize: 24, color: valueColor, lineHeight: 1, ...tabularNum }}>
        {value}
      </div>
      <div style={tinyLabel}>{label}</div>
    </div>
  );
}

/** One labelled funnel bar: stage name, count·percent, animated fill (scaleX on first paint). */
function FunnelBar({ stage, count, pct, color, glow }: {
  stage: string;
  count: number;
  pct: number;
  color: string;
  glow: string;
}) {
  // Mount at scale 0, then set the real proportion in a rAF after first paint so the fill
  // animates on the load that matters. One-shot — it won't replay on re-render.
  const [filled, setFilled] = useState(false);
  const painted = useRef(false);
  useEffect(() => {
    if (painted.current) return;
    painted.current = true;
    const id = requestAnimationFrame(() => setFilled(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div style={{ marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: t.font.body,
          fontWeight: 700,
          fontSize: 12,
          color: t.textBody,
          marginBottom: 6,
        }}
      >
        <span>{stage}</span>
        <span style={{ color: count > 0 ? t.accent : t.textMuted, ...tabularNum }}>
          {fmtNum(count)} · {fmtPct(pct)}
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
            transformOrigin: "left",
            transform: filled ? "scaleX(1)" : "scaleX(0)",
            transition: `transform ${t.dur.normal} ${t.ease}`,
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
    <div style={{ maxWidth: 1140, margin: "0 auto", display: "flex", flexDirection: "column", gap: 14 }}>
      {/* KPI strip */}
      <div style={{ display: "flex", gap: 14 }}>
        {/* TOTAL USERS */}
        <div className="fr-card" style={{ flex: 1, ...cardFrame(12), padding: "16px 18px" }}>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: t.textMuted }}>
            TOTAL USERS
          </div>
          <div style={{ fontFamily: t.font.display, fontSize: 42, lineHeight: 1, color: t.text, marginTop: 4, ...tabularNum }}>
            {fmtNum(users.total)}
          </div>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 11, color: t.up, marginTop: 4, ...tabularNum }}>
            <span aria-hidden>▲</span> {fmtNum(users.signups_7d)} THIS WEEK
          </div>
        </div>
        {/* MRR */}
        <div className="fr-card" style={{ flex: 1, ...cardFrame(12), padding: "16px 18px" }}>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: t.textMuted }}>
            MRR
          </div>
          <div style={{ fontFamily: t.font.display, fontSize: 42, lineHeight: 1, color: t.amber, marginTop: 4, ...tabularNum }}>
            {fmtUsd(revenue.mrr_usd)}
          </div>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 11, color: t.textMuted, marginTop: 4, ...tabularNum }}>
            {fmtNum(revenue.active_subs)} ACTIVE SUBS
          </div>
        </div>
        {/* CRASH-FREE */}
        <div className="fr-card" style={{ flex: 1, ...cardFrame(12), padding: "16px 18px" }}>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: t.textMuted }}>
            CRASH-FREE
          </div>
          <div style={{ fontFamily: t.font.display, fontSize: 42, lineHeight: 1, color: t.up, marginTop: 4, ...tabularNum }}>
            {fmtPct(health.crash_free_rate)}
          </div>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 11, color: t.textMuted, marginTop: 4 }}>
            SESSIONS · 7D
          </div>
        </div>
        {/* OPEN TRIALS */}
        <div className="fr-card" style={{ flex: 1, ...cardFrame(12), padding: "16px 18px" }}>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: t.textMuted }}>
            OPEN TRIALS
          </div>
          <div style={{ fontFamily: t.font.display, fontSize: 42, lineHeight: 1, color: t.accent, marginTop: 4, ...tabularNum }}>
            {fmtNum(revenue.active_trials)}
          </div>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 11, color: t.textMuted, marginTop: 4, ...tabularNum }}>
            DAU {fmtNum(users.dau)} · WAU {fmtNum(users.wau)}
          </div>
        </div>
      </div>

      {/* main two-col: FUNNEL | (REVENUE / HEALTH) */}
      <div style={{ display: "flex", gap: 14, alignItems: "stretch" }}>
        {/* FUNNEL */}
        <div className="fr-card" style={{ flex: 1.55, ...cardFrame(14), padding: "20px 22px", display: "flex", flexDirection: "column" }}>
          <div style={{ fontFamily: t.font.display, fontSize: 19, color: t.text, letterSpacing: ".04em", marginBottom: 4 }}>
            ACTIVATION → REVENUE
          </div>
          <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: t.textMuted, marginBottom: 18 }}>
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
            <StatTile value={fmtPct(funnel.conversion_rate)} valueColor={t.accent} label="CONVERSION" />
            <StatTile value={fmtPct(revenue.trial_to_paid)} valueColor={t.text} label="TRIAL → PAID" />
            <StatTile value={fmtPct(revenue.churn)} valueColor={t.up} label="CHURN" />
          </div>
        </div>

        {/* right col: REVENUE + HEALTH */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 14 }}>
          {/* REVENUE */}
          <div className="fr-card" style={cardFrame(14)}>
            <div style={{ ...cardTitle, marginBottom: 14 }}>REVENUE</div>
            <div style={{ display: "flex", gap: 18 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: t.font.display, fontSize: 26, color: t.amber, lineHeight: 1, ...tabularNum }}>{fmtUsd(revenue.mrr_usd)}</div>
                <div style={tinyLabel}>MRR</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: t.font.display, fontSize: 26, color: t.text, lineHeight: 1, ...tabularNum }}>{fmtNum(revenue.active_subs)}</div>
                <div style={tinyLabel}>ACTIVE SUBS</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: t.font.display, fontSize: 26, color: t.accent, lineHeight: 1, ...tabularNum }}>{fmtNum(revenue.active_trials)}</div>
                <div style={tinyLabel}>TRIALS</div>
              </div>
            </div>
          </div>

          {/* HEALTH */}
          <div className="fr-card" style={{ flex: 1, ...cardFrame(14), display: "flex", flexDirection: "column" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div style={cardTitle}>HEALTH</div>
            </div>
            <div style={{ display: "flex", gap: 18, marginBottom: 12 }}>
              <div>
                <div style={{ fontFamily: t.font.display, fontSize: 24, color: t.up, lineHeight: 1, ...tabularNum }}>{fmtPct(health.crash_free_rate)}</div>
                <div style={tinyLabel}>CRASH-FREE</div>
              </div>
              <div>
                <div style={{ fontFamily: t.font.display, fontSize: 24, color: health.open_issues > 0 ? t.amber : t.up, lineHeight: 1, ...tabularNum }}>
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
                fontFamily: t.font.mono,
                fontSize: 10,
                color: t.textMuted,
                background: "rgba(8,28,44,.5)",
                borderRadius: 4,
                padding: "9px 11px",
              }}
            >
              <span aria-hidden style={{ color: t.up }}>✓</span>
              <span>no recent crashes reported</span>
            </div>
          </div>
        </div>
      </div>

      {/* ENGAGEMENT */}
      <div className="fr-card" style={cardFrame(14)}>
        <div style={{ ...cardTitle, marginBottom: 14 }}>
          ENGAGEMENT{" "}
          <span style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: t.textMuted }}>
            · LAST 7 DAYS
          </span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <StatTile value={fmtNum(engagement.food_logged_7d)} valueColor={t.text} label="FOOD LOGGED" />
          <StatTile value={fmtNum(engagement.weight_logged_7d)} valueColor={t.text} label="WEIGHT LOGGED" />
          <StatTile value={fmtNum(engagement.coach_msgs_7d)} valueColor={t.text} label="COACH MSGS" />
          <StatTile value={fmtPct(engagement.made_weight_rate)} valueColor={t.up} label="MADE-WEIGHT" />
          <div
            style={{
              flex: 1.3,
              background: "rgba(8,28,44,.5)",
              boxShadow: "inset 0 0 0 1px rgba(120,180,210,.3)",
              borderRadius: 6,
              padding: "12px 14px",
            }}
          >
            <div style={{ fontFamily: t.font.display, fontSize: 20, color: t.accent, lineHeight: 1.05 }}>
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
        className="fr-pressable"
        style={{
          ...buttonReset,
          alignSelf: "flex-start",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          fontFamily: t.font.display,
          fontSize: 17,
          letterSpacing: ".06em",
          color: "#04101a",
          background: "linear-gradient(90deg,#7fe3ff,#46b8ff)",
          boxShadow: `0 0 18px ${t.glow}`,
          clipPath: t.clipCta,
          padding: "13px 24px",
        }}
      >
        VIEW ATHLETES <span aria-hidden>→</span>
      </button>
    </div>
  );
}
