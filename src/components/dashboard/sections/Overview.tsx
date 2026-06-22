"use client";

import { CSSProperties } from "react";

import type { Snapshot } from "@/lib/types";
import { SectionKey } from "../nav";

interface OverviewProps {
  snapshot: Snapshot;
  onSelect: (key: SectionKey) => void;
}

const DISPLAY = "'Black Han Sans',sans-serif";
const BODY = "'Barlow',sans-serif";

// --- formatting helpers ------------------------------------------------------

const fmtNum = (n: number) => n.toLocaleString("en-US");
const fmtPct = (n: number | null) => (n === null ? "—" : `${n}%`);

/** "09:14 AM" from an ISO timestamp. */
function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/** Proportional fill count for a segmented bar (value vs a soft cap), clamped to [0,total]. */
function fillCount(value: number, cap: number, total: number): number {
  if (cap <= 0) return 0;
  return Math.max(0, Math.min(total, Math.round((value / cap) * total)));
}

// --- shared inline styles ----------------------------------------------------

const panel: CSSProperties = {
  flex: 1,
  cursor: "pointer",
  background: "linear-gradient(160deg,#163a55,#0b2033)",
  clipPath: "polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))",
  boxShadow: "inset 0 0 0 2px rgba(150,212,236,.5)",
  padding: "15px 18px",
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
  filter: `drop-shadow(0 0 11px ${glow})`,
});

const statLabel: CSSProperties = {
  fontFamily: BODY,
  fontWeight: 700,
  fontSize: 9,
  letterSpacing: ".13em",
  color: "#7fb0d2",
  marginTop: 5,
};

/** A small segmented progress bar (lit / unlit cells). */
function SegBar({ total, lit, color }: { total: number; lit: number; color: string }) {
  return (
    <div
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

/** A clickable Web/Fitness/Tacos/Social stat row. */
function StatRow({
  title,
  sub,
  grade,
  bar,
  value,
  caption,
  onClick,
}: {
  title: string;
  sub: string;
  grade: React.ReactNode;
  bar: React.ReactNode;
  value: string;
  caption: string;
  onClick?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 16, cursor: onClick ? "pointer" : "default" }}
    >
      <div style={{ width: 188 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 25, lineHeight: 0.95, color: "#0e2a3c", textShadow: "0 1px 0 rgba(255,255,255,.55)" }}>
          {title}
        </div>
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 9.5, letterSpacing: ".12em", color: "#1c5775", marginTop: 2 }}>
          {sub}
        </div>
      </div>
      <div style={{ width: 88, display: "flex", justifyContent: "center", alignItems: "center" }}>{grade}</div>
      <div style={{ flex: 1, display: "flex", alignItems: "center", gap: 14 }}>
        {bar}
        <div style={{ width: 172, textAlign: "right" }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 26, lineHeight: 0.85, color: "#0d2c40" }}>{value}</div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 9.5, letterSpacing: ".08em", color: "#1c5775", marginTop: 3 }}>
            {caption}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Overview screen — bento of summary cards, each drilling into its full section. */
export function Overview({ snapshot, onSelect }: OverviewProps) {
  const { deficit_app: d, deficit_landing: landing, our_footage: footage, portfolio, infra, fitness } = snapshot;

  // Web: total visitors across the three sites + the busiest one.
  const sites = [
    { name: "GETDEFICIT.COM", v: landing.visitors_7d },
    { name: "OUR-FOOTAGE.COM", v: footage.visitors_7d },
    { name: "MARKCALIP.COM", v: portfolio.visitors_7d },
  ];
  const webTotal = sites.reduce((s, x) => s + x.v, 0);
  const topSite = sites.reduce((a, b) => (b.v > a.v ? b : a)).name;

  const funnelLit = fillCount(d.funnel.conversion_rate ?? 0, 50, 8); // soft cap 50% conversion
  const steps = fitness.steps_7d_avg;
  const bw = fitness.bodyweight_latest.weight;
  const lastLift =
    fitness.last_lifting_session.muscle_groups.length > 0
      ? fitness.last_lifting_session.muscle_groups.slice(0, 3).join(" · ").toUpperCase()
      : "—";

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
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
          <div
            style={{
              flex: 1,
              maxWidth: 430,
              background: "linear-gradient(160deg,rgba(46,92,142,.62),rgba(30,64,116,.46))",
              clipPath: "polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))",
              boxShadow: "inset 0 0 0 2px rgba(190,230,248,.6)",
              padding: "16px 22px",
            }}
          >
            <div style={{ fontFamily: DISPLAY, fontSize: 38, lineHeight: 0.9, color: "#fff", textShadow: "0 2px 0 rgba(8,30,55,.55),0 0 16px rgba(150,220,250,.6)" }}>
              MARK
            </div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11.5, letterSpacing: ".18em", color: "#bfe6fb", marginTop: 6 }}>
              LV.41 · INDIE BUILDER
            </div>
          </div>
          <div
            style={{
              width: 430,
              background: "linear-gradient(160deg,#173a56,#0b2034)",
              clipPath: "polygon(0 0,calc(100% - 16px) 0,100% 16px,100% 100%,16px 100%,0 calc(100% - 16px))",
              boxShadow: "inset 0 0 0 2px rgba(150,212,236,.55)",
              padding: "14px 22px",
              display: "flex",
              flexDirection: "column",
              justifyContent: "center",
              gap: 5,
            }}
          >
            <div style={{ fontFamily: DISPLAY, fontSize: 23, color: "#eafaff", textShadow: "0 0 12px rgba(120,210,245,.6)" }}>
              AS OF: <span style={{ color: "#8fe3ff" }}>{fmtClock(snapshot.as_of)}</span>
            </div>
            <div style={{ fontFamily: DISPLAY, fontSize: 23, color: "#eafaff", textShadow: "0 0 12px rgba(120,210,245,.6)" }}>
              SYSTEMS:{" "}
              <span style={{ color: infra.all_up ? "#7dffb0" : "#ff9a8a" }}>
                {infra.all_up ? "ALL ONLINE" : `${infra.down.length} DOWN`}
              </span>
            </div>
          </div>
        </div>

        {/* primary panels: Deficit + Infra */}
        <div style={{ display: "flex", gap: 14 }}>
          {/* DEFICIT */}
          <div
            onClick={() => onSelect("deficit")}
            style={panel}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "inset 0 0 0 2px rgba(150,212,236,.9),0 0 26px rgba(80,200,255,.35)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "inset 0 0 0 2px rgba(150,212,236,.5)")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <div>
                <span style={{ fontFamily: DISPLAY, fontSize: 25, color: "#eafaff", textShadow: "0 0 12px rgba(120,210,245,.5)" }}>DEFICIT</span>
                <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".16em", color: "#6fa8cc", marginLeft: 8 }}>PRODUCT</span>
              </div>
              <span style={gradeLetter("linear-gradient(180deg,#ff9a8a,#f23a2a)", "#5e0d08", "rgba(255,100,80,.85)")}>S</span>
            </div>
            <div style={{ display: "flex", gap: 12, marginBottom: 13 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 36, lineHeight: 0.85, color: "#fff" }}>{fmtNum(d.users.total)}</div>
                <div style={statLabel}>USERS ▲{d.users.signups_7d}</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 36, lineHeight: 0.85, color: "#7dffb0" }}>{fmtPct(d.health.crash_free_rate)}</div>
                <div style={statLabel}>CRASH-FREE</div>
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: DISPLAY, fontSize: 36, lineHeight: 0.85, color: "#ffd36b" }}>${fmtNum(d.revenue.mrr_usd)}</div>
                <div style={statLabel}>MRR · {d.revenue.active_trials} TRIAL</div>
              </div>
            </div>
            <SegBar total={8} lit={funnelLit} color="linear-gradient(180deg,#ff7a68,#d8261b)" />
            <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 10, letterSpacing: ".07em", color: "#6fa8cc", marginTop: 7 }}>
              FUNNEL {d.funnel.onboarding_7d} ▸ {d.funnel.paywall_7d} ▸ {d.funnel.subscribed_7d} ·{" "}
              <span style={{ color: "#8fe3ff" }}>{fmtPct(d.funnel.conversion_rate)} CONVERSION</span> · ENTER →
            </div>
          </div>

          {/* INFRA */}
          <div
            onClick={() => onSelect("infra")}
            style={panel}
            onMouseEnter={(e) => (e.currentTarget.style.boxShadow = "inset 0 0 0 2px rgba(150,212,236,.9),0 0 26px rgba(80,200,255,.35)")}
            onMouseLeave={(e) => (e.currentTarget.style.boxShadow = "inset 0 0 0 2px rgba(150,212,236,.5)")}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
              <div>
                <span style={{ fontFamily: DISPLAY, fontSize: 25, color: "#eafaff", textShadow: "0 0 12px rgba(120,210,245,.5)" }}>INFRA</span>
                <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".16em", color: "#6fa8cc", marginLeft: 8 }}>SELF-HOSTED</span>
              </div>
              <span style={gradeLetter("linear-gradient(180deg,#ffd089,#ff9526)", "#6e3200", "rgba(255,165,55,.8)")}>A</span>
            </div>
            <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".12em", color: infra.all_up ? "#7dffb0" : "#ff9a8a", marginBottom: 11 }}>
              {infra.all_up ? "● ALL SERVICES ONLINE" : `● ${infra.down.length} SERVICE(S) DOWN`}
            </div>
            {/* Host CPU/RAM/DISK come from Beszel, which is not part of the snapshot contract —
                they render in the full Infra view, not here. ponytail: don't fake them. */}
            <div style={{ fontFamily: "'JetBrains Mono',monospace", fontSize: 10, color: "#6fa8cc", lineHeight: 1.7, marginBottom: 11 }}>
              host metrics (CPU · RAM · DISK) live in the Infra view →
            </div>
            <div style={{ marginTop: "auto", display: "flex", flexWrap: "wrap", gap: 6 }}>
              {infra.down.length === 0 ? (
                <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".08em", color: "#7dffb0", background: "rgba(20,60,50,.55)", boxShadow: "inset 0 0 0 1px rgba(80,200,150,.45)", borderRadius: 4, padding: "4px 9px" }}>
                  ALL MONITORS ✓
                </span>
              ) : (
                infra.down.map((name) => (
                  <span key={name} style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".08em", color: "#ff9a8a", background: "rgba(60,24,24,.55)", boxShadow: "inset 0 0 0 1px rgba(200,90,80,.45)", borderRadius: 4, padding: "4px 9px" }}>
                    {name} ✕
                  </span>
                ))
              )}
            </div>
          </div>
        </div>

        {/* stat rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
          <StatRow
            title="WEB"
            sub="LANDING · FOOTAGE · PORTFOLIO"
            grade={<span style={gradeLetter("linear-gradient(180deg,#aee2ff,#2b8bff)", "#06224a", "rgba(80,165,255,.8)")}>B</span>}
            bar={<SegBar total={9} lit={fillCount(webTotal, 1800, 9)} color="linear-gradient(180deg,#7fd2ff,#1f86ff)" />}
            value={fmtNum(webTotal)}
            caption={`7D · TOP ${topSite}`}
            onClick={() => onSelect("landing")}
          />
          <StatRow
            title="FITNESS"
            sub="WORKOUT + BODY"
            grade={<span style={{ ...gradeLetter("linear-gradient(120deg,#7df0ff,#9a8cff 50%,#ff7ae6)", "#161046", "rgba(155,135,255,.8)"), fontSize: 32 }}>UR</span>}
            bar={<SegBar total={9} lit={fillCount(steps ?? 0, 12000, 9)} color="linear-gradient(180deg,#5aa6ff,#bf5cf3)" />}
            value={steps === null ? "—" : fmtNum(steps)}
            caption={`STEPS · ${bw === null ? "—" : `${bw}LB`} · ${lastLift}`}
            onClick={() => onSelect("fitness")}
          />
          {/* Tacos summary isn't in the snapshot contract — it comes from /api/tacos. Spine shows
              the card + drill-in; live taco numbers land when Tacos is wired. ponytail: no fakes. */}
          <StatRow
            title="TACOS"
            sub="PERSONAL LOG"
            grade={<span style={{ ...gradeLetter("linear-gradient(120deg,#ff8aea,#b450ff)", "#320d4a", "rgba(205,115,255,.75)"), fontSize: 26 }}>SSR</span>}
            bar={<SegBar total={9} lit={0} color="linear-gradient(180deg,#ff7ae6,#b53bff)" />}
            value="—"
            caption="VIA /API/TACOS · OPEN →"
            onClick={() => onSelect("tacos")}
          />

          {/* Social — coming soon (no source wired; matches snapshot social placeholder). */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <div style={{ width: 188 }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 25, lineHeight: 0.95, color: "#3a6076" }}>SOCIAL</div>
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 9.5, letterSpacing: ".12em", color: "#3a6f8c", marginTop: 2 }}>NOT YET TRACKED</div>
            </div>
            <div style={{ width: 88, display: "flex", justifyContent: "center", alignItems: "center" }}>
              <span style={gradeLetter("linear-gradient(180deg,#dbe8f2,#8aa3b6)", "#1c2c38", "rgba(175,205,225,.5)")}>?</span>
            </div>
            <div
              style={{
                flex: 1,
                background: "linear-gradient(90deg,rgba(180,235,250,.2),rgba(150,225,248,.55),rgba(180,235,250,.2))",
                borderRadius: 6,
                boxShadow: "inset 0 0 0 2px rgba(235,251,255,.8),0 0 18px rgba(150,225,250,.45)",
                padding: 11,
                textAlign: "center",
              }}
            >
              <span style={{ fontFamily: DISPLAY, fontSize: 23, color: "#0e3850", textShadow: "0 1px 0 rgba(255,255,255,.6)" }}>
                COMING SOON{" "}
                <span style={{ fontFamily: "'Zen Kaku Gothic New',sans-serif", fontWeight: 700, fontSize: 17, color: "#1a5a78" }}>（準備中）</span>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
