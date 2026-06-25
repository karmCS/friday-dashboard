"use client";

import { CSSProperties } from "react";

import type { Snapshot } from "@/lib/types";
import { SectionKey } from "../nav";
import { t, tabularNum, buttonReset } from "../tokens";
import { fmtNum, fmtPct, fmtClock } from "@/lib/format";
import { GradeBadge } from "./shared/GradeBadge";

interface OverviewProps {
  snapshot: Snapshot;
  onSelect: (key: SectionKey) => void;
}

const DISPLAY = t.font.display;
const BODY = t.font.body;

// On the bright inverse "hero" surface these dark inks clear AA against the light cyan.
const INK = "#0c2c40";
const INK_SUB = "#0d3a52";

/** Proportional fill count for a segmented bar (value vs a soft cap), clamped to [0,total]. */
function fillCount(value: number, cap: number, total: number): number {
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(total, Math.round((value / cap) * total)));
}

// --- shared inline styles ----------------------------------------------------

const panel: CSSProperties = {
  ...buttonReset,
  flex: 1,
  minWidth: 280,
  background: "linear-gradient(160deg,#163a55,#0b2033)",
  clipPath: "polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))",
  boxShadow: "inset 0 0 0 2px var(--frame)",
  padding: "16px 20px",
  display: "flex",
  flexDirection: "column",
};

const gradeLetter = (gradient: string, stroke: string, glow: string): CSSProperties => ({
  display: "inline-block",
  fontFamily: DISPLAY,
  fontSize: 40,
  lineHeight: 1,
  background: gradient,
  WebkitBackgroundClip: "text",
  backgroundClip: "text",
  WebkitTextFillColor: "transparent",
  color: "transparent",
  WebkitTextStroke: `1.6px ${stroke}`,
  paintOrder: "stroke fill",
  filter: `drop-shadow(0 0 6px ${glow})`,
});

const statLabel: CSSProperties = {
  fontFamily: BODY,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".12em",
  color: "#9fc6e2",
  marginTop: 5,
};

const metricNum: CSSProperties = { ...tabularNum, fontFamily: DISPLAY, fontSize: 36, lineHeight: 0.85 };

/** A small segmented progress bar (lit / unlit cells). Decorative. */
function SegBar({ total, lit, color }: { total: number; lit: number; color: string }) {
  return (
    <div
      aria-hidden
      style={{
        flex: 1,
        display: "flex",
        gap: 5,
        background: "rgba(8,30,48,.4)",
        padding: 5,
        borderRadius: 6,
        boxShadow: "inset 0 0 0 2px rgba(205,240,253,.6)",
      }}
    >
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: 18,
            borderRadius: 2,
            background: i < lit ? color : "rgba(14,42,62,.5)",
            boxShadow: i < lit ? "inset 0 2px 0 rgba(255,255,255,.5)" : "inset 0 0 0 1px rgba(160,205,228,.4)",
          }}
        />
      ))}
    </div>
  );
}

/** A clickable Web/Fitness/Tacos stat row — renders as a real button when onClick is given. */
function StatRow({
  title,
  sub,
  grade,
  bar,
  value,
  caption,
  onClick,
  i,
}: {
  title: string;
  sub: string;
  grade: React.ReactNode;
  bar: React.ReactNode;
  value: string;
  caption: string;
  onClick?: () => void;
  i: number;
}) {
  const inner = (
    <>
      <div style={{ width: 188, minWidth: 140 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 25, lineHeight: 0.95, color: INK, textShadow: "0 1px 0 rgba(255,255,255,.45)" }}>
          {title}
        </div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".1em", color: INK_SUB, marginTop: 2 }}>
          {sub}
        </div>
      </div>
      <div style={{ width: 88, display: "flex", justifyContent: "center", alignItems: "center" }}>{grade}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 14, minWidth: 200 }}>
        {bar}
        <div style={{ width: 172, textAlign: "right" }}>
          <div style={{ ...tabularNum, fontFamily: DISPLAY, fontSize: 26, lineHeight: 0.85, color: INK }}>{value}</div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".08em", color: INK_SUB, marginTop: 3 }}>
            {caption}
          </div>
        </div>
      </div>
    </>
  );

  const shared: CSSProperties = {
    display: "flex",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap",
    "--i": i,
  } as CSSProperties;

  if (!onClick) return <div style={shared}>{inner}</div>;
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${title}`}
      className="fr-card-enter fr-pressable"
      style={{ ...buttonReset, ...shared, width: "100%" }}
    >
      {inner}
    </button>
  );
}

/** Overview screen — bento of summary cards, each drilling into its full section. */
export function Overview({ snapshot, onSelect }: OverviewProps) {
  const { deficit_app: d, deficit_landing: landing, our_footage: footage, portfolio, infra, fitness, tacos, cafes, grades } = snapshot;

  const sites = [
    { name: "GETDEFICIT.COM", v: landing.visitors_7d },
    { name: "OUR-FOOTAGE.COM", v: footage.visitors_7d },
    { name: "MARKCALIP.COM", v: portfolio.visitors_7d },
  ];
  const webTotal = sites.reduce((s, x) => s + x.v, 0);
  const topSite = sites.reduce((a, b) => (b.v > a.v ? b : a)).name;

  const funnelLit = fillCount(d.funnel.conversion_rate ?? 0, 50, 8);
  const steps = fitness.steps_7d_avg;
  const bw = fitness.bodyweight_latest.weight;
  const lastWorkout = fitness.last_workout.label ? fitness.last_workout.label.toUpperCase() : "—";

  return (
    <div
      style={{
        maxWidth: 1140,
        margin: "0 auto",
        background: "linear-gradient(135deg,#bfe9f5 0%,#84c8e4 45%,#a9def0 100%)",
        clipPath:
          "polygon(46px 0,calc(100% - 18px) 0,100% 18px,100% calc(100% - 46px),calc(100% - 46px) 100%,18px 100%,0 calc(100% - 18px),0 46px)",
        boxShadow:
          "0 0 60px rgba(80,190,235,.3),inset 0 0 0 2px rgba(255,255,255,.75),inset 0 0 0 7px rgba(120,205,235,.5)",
        padding: 13,
      }}
    >
      <div
        style={{
          background: "linear-gradient(150deg,#9ed8ee 0%,#71bedf 42%,#8fd2ec 72%,#b8e7f6 100%)",
          clipPath:
            "polygon(36px 0,calc(100% - 12px) 0,100% 12px,100% calc(100% - 36px),calc(100% - 36px) 100%,12px 100%,0 calc(100% - 12px),0 36px)",
          boxShadow: "inset 0 0 0 2px rgba(238,251,255,.95),inset 0 0 0 4px rgba(70,150,190,.35)",
          padding: "30px 32px 26px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        {/* header row */}
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
          <div
            style={{
              flex: 1,
              minWidth: 240,
              maxWidth: 430,
              background: "linear-gradient(160deg,rgba(46,92,142,.62),rgba(30,64,116,.46))",
              clipPath: "polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))",
              boxShadow: "inset 0 0 0 2px rgba(190,230,248,.6)",
              padding: "16px 22px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontFamily: DISPLAY, fontSize: 38, lineHeight: 0.9, color: "#fff", textShadow: "0 2px 0 rgba(8,30,55,.55)" }}>
                MARK
              </div>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11.5, letterSpacing: ".16em", color: "#d6effb", marginTop: 6 }}>
                LV.41 · INDIE BUILDER
              </div>
            </div>
            <div style={{ textAlign: "center", flexShrink: 0 }}>
              <GradeBadge grade={grades.total} size={62} />
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 9, letterSpacing: ".14em", color: "#d6effb", marginTop: 2 }}>
                TOTAL POWER
              </div>
            </div>
          </div>
          <div
            style={{
              flex: 1,
              minWidth: 240,
              maxWidth: 430,
              background: "linear-gradient(160deg,#173a56,#0b2034)",
              clipPath: "polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))",
              boxShadow: "inset 0 0 0 2px var(--frame)",
              padding: "14px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <div style={{ fontFamily: DISPLAY, fontSize: 23, color: t.text }}>
              AS OF: <span suppressHydrationWarning style={{ ...tabularNum, color: t.accent }}>{fmtClock(snapshot.as_of)}</span>
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 23, color: t.text }}>
              SYSTEMS:{" "}
              <span style={{ color: infra.all_up ? t.up : t.down }}>
                {infra.all_up ? "ALL ONLINE" : `${infra.down.length} DOWN`}
              </span>
            </div>
          </div>
        </div>

        {/* primary panels: Deficit + Infra */}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {/* DEFICIT */}
          <button
            type="button"
            onClick={() => onSelect("deficit")}
            aria-label="Open Deficit"
            className="fr-card fr-card-enter"
            style={{ ...panel, "--i": 0 } as CSSProperties}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <span style={{ fontFamily: DISPLAY, fontSize: 25, color: t.text }}>DEFICIT</span>
                <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".16em", color: t.textMuted, marginLeft: 8 }}>PRODUCT</span>
              </div>
              <GradeBadge grade={grades.builder.grade} size={54} />
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 13 }}>
              <div style={{ flex: 1 }}>
                <div style={{ ...metricNum, color: "#fff" }}>{fmtNum(d.users.total)}</div>
                <div style={statLabel}>USERS <span aria-hidden>▲</span>{d.users.signups_7d}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...metricNum, color: t.up }}>{fmtPct(d.health.crash_free_rate)}</div>
                <div style={statLabel}>CRASH-FREE</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ ...metricNum, color: t.amber }}>${fmtNum(d.revenue.mrr_usd)}</div>
                <div style={statLabel}>MRR · {d.revenue.active_trials} TRIAL</div>
              </div>
            </div>
            <SegBar total={8} lit={funnelLit} color="linear-gradient(180deg,#ff7a68,#d8261b)" />
            <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 10.5, letterSpacing: ".06em", color: t.textMuted, marginTop: 7 }}>
              FUNNEL {d.funnel.onboarding_7d} <span aria-hidden>▸</span> {d.funnel.paywall_7d} <span aria-hidden>▸</span>{" "}
              {d.funnel.subscribed_7d} · <span style={{ color: t.accent }}>{fmtPct(d.funnel.conversion_rate)} CONVERSION</span>
            </div>
          </button>

          {/* INFRA */}
          <button
            type="button"
            onClick={() => onSelect("infra")}
            aria-label="Open Infra"
            className="fr-card fr-card-enter"
            style={{ ...panel, "--i": 1 } as CSSProperties}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <span style={{ fontFamily: DISPLAY, fontSize: 25, color: t.text }}>INFRA</span>
                <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".16em", color: t.textMuted, marginLeft: 8 }}>SELF-HOSTED</span>
              </div>
              <GradeBadge grade={grades.system.grade} size={54} />
            </div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, letterSpacing: ".1em", color: infra.all_up ? t.up : t.down, marginBottom: 11 }}>
              <span aria-hidden>● </span>{infra.all_up ? "ALL SERVICES ONLINE" : `${infra.down.length} SERVICE(S) DOWN`}
            </div>
            <div style={{ fontFamily: t.font.mono, fontSize: 11, color: t.textMuted, lineHeight: 1.7, marginBottom: 11 }}>
              host metrics (CPU · RAM · DISK) live in the Infra view
            </div>
            <div style={{ marginTop: "auto", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {infra.down.length === 0 ? (
                <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10.5, letterSpacing: ".08em", color: t.up, background: "rgba(20,60,50,.55)", boxShadow: "inset 0 0 0 1px rgba(80,200,150,.45)", borderRadius: 4, padding: "4px 9px" }}>
                  ALL MONITORS <span aria-hidden>✓</span>
                </span>
              ) : (
                infra.down.map((name) => (
                  <span key={name} style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10.5, letterSpacing: ".08em", color: t.down, background: "rgba(60,24,24,.55)", boxShadow: "inset 0 0 0 1px rgba(200,90,80,.45)", borderRadius: 4, padding: "4px 9px" }}>
                    {name} <span aria-hidden>✕</span>
                  </span>
                ))
              )}
            </div>
          </button>
        </div>

        {/* stat rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          {/* Social — coming soon (no source wired). */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap", ["--i" as string]: 2 } as CSSProperties}>
            <div style={{ width: 188, minWidth: 140 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 25, lineHeight: 0.95, color: "#15384e" }}>SOCIAL</div>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".1em", color: INK_SUB, marginTop: 2 }}>NOT YET TRACKED</div>
            </div>
            <div style={{ width: 88, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <span aria-hidden style={gradeLetter("linear-gradient(180deg,#dbe8f2,#8aa3b6)", "#1c2c38", "rgba(175,205,225,.5)")}>?</span>
            </div>
            <div
              style={{
                flex: 1,
                minWidth: 200,
                background: "rgba(20,52,72,.18)",
                border: "2px dashed rgba(20,70,96,.5)",
                borderRadius: 6,
                padding: 11,
                textAlign: "center",
              }}
            >
              <span style={{ fontFamily: DISPLAY, fontSize: 22, color: "#123c54" }}>
                COMING SOON{" "}
                <span style={{ fontFamily: t.font.jp, fontWeight: 700, fontSize: 17, color: "#0f4868" }}>（準備中）</span>
              </span>
            </div>
          </div>

          <StatRow
            title="WEB"
            sub="LANDING · FOOTAGE · PORTFOLIO"
            grade={null}
            bar={<SegBar total={9} lit={fillCount(webTotal, 1800, 9)} color="linear-gradient(180deg,#7fd2ff,#1f86ff)" />}
            value={fmtNum(webTotal)}
            caption={`7D · TOP ${topSite}`}
            onClick={() => onSelect("landing")}
            i={3}
          />
          <StatRow
            title="FITNESS"
            sub="WORKOUT + BODY"
            grade={<GradeBadge grade={grades.body.grade} size={66} />}
            bar={<SegBar total={9} lit={fillCount(steps ?? 0, 12000, 9)} color="linear-gradient(180deg,#5aa6ff,#bf5cf3)" />}
            value={steps === null ? "—" : fmtNum(steps)}
            caption={`STEPS · ${bw === null ? "—" : `${bw}LB`} · ${lastWorkout}`}
            onClick={() => onSelect("fitness")}
            i={4}
          />
          <StatRow
            title="TACOS"
            sub="PERSONAL LOG"
            grade={null}
            bar={<SegBar total={9} lit={fillCount(tacos.total, 30, 9)} color="linear-gradient(180deg,#ff7ae6,#b53bff)" />}
            value={tacos.total === 0 ? "—" : fmtNum(tacos.total)}
            caption={tacos.last_spot ? `🌮 ${tacos.last_spot.toUpperCase()}` : "VIA /API/TACOS · OPEN"}
            onClick={() => onSelect("tacos")}
            i={5}
          />
          <StatRow
            title="CAFES"
            sub="PERSONAL LOG"
            grade={null}
            bar={<SegBar total={9} lit={fillCount(cafes.total, 30, 9)} color="linear-gradient(180deg,#e9b15a,#cf7a25)" />}
            value={cafes.total === 0 ? "—" : fmtNum(cafes.total)}
            caption={cafes.last_spot ? `☕ ${cafes.last_spot.toUpperCase()}` : "VIA /API/CAFES · OPEN"}
            onClick={() => onSelect("cafes")}
            i={6}
          />
        </div>
      </div>
    </div>
  );
}
