"use client";

import { CSSProperties, useEffect, useState } from "react";

import { t, tabularNum } from "@/components/dashboard/tokens";
import { fmtNum, fmtPct } from "@/lib/format";
import type { Infra } from "@/lib/types";

/** Soft cap above which a host-utilisation bar reads as "hot" (amber, not green). */
const HOT_PCT = 60;

/** The real Friday homelab service set (NOT the design's generic API/Worker/CDN mocks). */
const SERVICES: readonly string[] = [
  "Umami",
  "Umami Postgres",
  "Uptime Kuma",
  "Beszel",
  "Dozzle",
  "Vaultwarden",
  "WireGuard",
  "Dashboard",
];

// --- helpers -----------------------------------------------------------------

/**
 * A service is DOWN when its name fuzzily matches any entry in `infra.down`.
 * Kuma monitor names vary ("Umami DB", "umami-postgres", …), so we test a
 * case-insensitive substring match in EITHER direction.
 */
function isServiceDown(service: string, down: readonly string[]): boolean {
  const s = service.toLowerCase();
  return down.some((d) => {
    const x = d.toLowerCase();
    return x.includes(s) || s.includes(x);
  });
}

/** Host uptime label from hours-since-last-deploy (the only time signal we have). */
function uptimeLabel(agoHours: number | null): string {
  if (agoHours === null) return "—";
  if (agoHours < 1) return "<1h";
  if (agoHours < 24) return `${Math.round(agoHours)}h`;
  const days = Math.floor(agoHours / 24);
  const hours = Math.round(agoHours % 24);
  return hours > 0 ? `${days}d ${hours}h` : `${days}d`;
}

// --- shared styles -----------------------------------------------------------

const cardFrame = (clip: number): CSSProperties => ({
  background: "linear-gradient(160deg,#163a55,#0b2033)",
  clipPath: `polygon(0 0,calc(100% - ${clip}px) 0,100% ${clip}px,100% 100%,${clip}px 100%,0 calc(100% - ${clip}px))`,
  boxShadow: `inset 0 0 0 2px ${t.frame}`,
  padding: "18px 20px",
});

const kpiLabel: CSSProperties = {
  fontFamily: t.font.body,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".14em",
  color: t.textMuted,
};

const kpiBig = (color: string): CSSProperties => ({
  fontFamily: t.font.display,
  fontSize: 42,
  lineHeight: 1,
  color,
  marginTop: 4,
  ...tabularNum,
});

const kpiSub = (color: string): CSSProperties => ({
  fontFamily: t.font.body,
  fontWeight: 700,
  fontSize: 11,
  color,
  marginTop: 4,
});

const cardTitle: CSSProperties = {
  fontFamily: t.font.display,
  fontSize: 18,
  color: t.text,
  letterSpacing: ".03em",
};

// --- subcomponents -----------------------------------------------------------

/** One KPI panel in the top strip. */
function KpiCard({ label, value, valueColor, sub, subColor }: {
  label: string;
  value: string;
  valueColor: string;
  sub: string;
  subColor: string;
}) {
  return (
    <div className="fr-card" style={{ flex: 1, ...cardFrame(12), padding: "16px 18px" }}>
      <div style={kpiLabel}>{label}</div>
      <div style={kpiBig(valueColor)}>{value}</div>
      <div style={kpiSub(subColor)}>{sub}</div>
    </div>
  );
}

/** A single service row: status dot + name + UP/DOWN badge. */
function ServiceRow({ name, down }: { name: string; down: boolean }) {
  const color = down ? t.down : t.up;
  return (
    <div
      className="fr-card"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        background: "#0e1e2c",
        boxShadow: "inset 0 0 0 1px rgba(120,180,210,.2)",
        borderRadius: 7,
        padding: "11px 14px",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 8,
          height: 8,
          borderRadius: "50%",
          background: color,
          boxShadow: `0 0 8px ${color}`,
          flexShrink: 0,
        }}
      />
      <span style={{ flex: 1, fontFamily: t.font.display, fontSize: 15, color: "#dceef2" }}>{name}</span>
      <span
        style={{
          fontFamily: t.font.body,
          fontWeight: 800,
          fontSize: 10,
          color,
          background: down ? "rgba(255,154,138,.12)" : "rgba(125,255,176,.12)",
          padding: "3px 9px",
          borderRadius: 5,
          letterSpacing: ".06em",
        }}
      >
        {down ? "DOWN" : "UP"}
      </span>
    </div>
  );
}

/**
 * A labelled host-utilisation bar (Beszel). null → "—" label + empty track.
 * The fill animates via transform: scaleX (transform-origin:left) — mounted at
 * scale 0 then set to the real value after first paint so it grows on load.
 */
function HostBar({ label, pct }: { label: string; pct: number | null }) {
  const has = pct !== null;
  const hot = has && pct > HOT_PCT;
  const valueColor = !has ? t.textMuted : hot ? t.amber : t.up;
  const fill = has ? `linear-gradient(90deg,${hot ? "#ffb84d" : "#46d39a"},${hot ? "#ffd36b" : "#7dffb0"})` : "transparent";
  const glow = has ? `0 0 10px ${hot ? "rgba(255,190,60,.5)" : "rgba(80,255,160,.5)"}` : "none";
  const target = has ? Math.max(0, Math.min(100, pct)) / 100 : 0;

  // One-shot: mount at scale 0, then animate to target after first paint.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  return (
    <div>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: t.font.body,
          fontWeight: 700,
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        <span style={{ color: t.textMuted }}>{label}</span>
        <span style={{ color: valueColor, ...tabularNum }}>{has ? fmtPct(Math.round(pct)) : "—"}</span>
      </div>
      <div
        style={{
          height: 10,
          borderRadius: 5,
          background: "rgba(8,30,48,.6)",
          boxShadow: "inset 0 0 0 1px rgba(160,205,228,.3)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: "100%",
            height: "100%",
            background: fill,
            boxShadow: glow,
            transformOrigin: "left",
            transform: `scaleX(${grown ? target : 0})`,
            transition: `transform ${t.dur.normal} ${t.ease}`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * Static 24h CPU sparkline. We have no live host history yet, so this is an
 * explicitly-labelled SAMPLE placeholder (matches the design's polyline shape,
 * but honestly flagged — ponytail: no fake "live" numbers).
 */
function CpuSparkline() {
  const points =
    "0,86 60,80 120,84 180,70 240,76 300,58 360,64 420,49 480,72 540,66 600,80 660,74 720,60 780,68 840,55 900,78 960,71 1020,82 1080,77";
  return (
    <div style={cardFrame(14)}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ ...cardTitle, fontSize: 16 }}>CPU · LAST 24H</div>
        <div style={{ fontFamily: t.font.mono, fontSize: 10, color: t.textDim }}>SAMPLE · NO LIVE HISTORY YET</div>
      </div>
      <svg viewBox="0 0 1080 110" style={{ width: "100%", height: 80, display: "block" }} aria-label="Sample 24h CPU sparkline (placeholder)">
        <polyline points={points} fill="none" stroke={t.accent} strokeWidth={2} strokeLinejoin="round" opacity={0.55} />
        <polygon points={`${points} 1080,110 0,110`} fill={t.accent} opacity={0.05} />
      </svg>
    </div>
  );
}

// --- main --------------------------------------------------------------------

export function InfraSection({ infra }: { infra: Infra }) {
  // Compute per-service status, then derive the strip metrics from it.
  const services = SERVICES.map((name) => ({ name, down: isServiceDown(name, infra.down) }));
  const total = services.length;
  const downCount = services.filter((s) => s.down).length;
  const upCount = total - downCount;
  const allOnline = infra.all_up && downCount === 0;

  const stateLabel = allOnline ? "ALL ONLINE" : "DEGRADED";
  const stateColor = allOnline ? t.up : t.down;
  const incidents = infra.down.length;

  const host = infra.host;
  const deploy = infra.last_deploy;

  return (
    <div data-infra style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      {/* KPI strip */}
      <div className="fr-row" style={{ gap: 13 }}>
        <KpiCard
          label="SERVICES"
          value={`${upCount}/${total}`}
          valueColor={allOnline ? t.up : t.amber}
          sub={allOnline ? "● ALL ONLINE" : `● ${downCount} DOWN`}
          subColor={stateColor}
        />
        <KpiCard
          label="STATE"
          value={stateLabel}
          valueColor={stateColor}
          sub={allOnline ? "NOMINAL" : "ATTENTION"}
          subColor={t.textMuted}
        />
        <KpiCard
          label="UPTIME"
          value={uptimeLabel(deploy.ago_hours)}
          valueColor={t.text}
          sub="SINCE LAST DEPLOY"
          subColor={t.textMuted}
        />
        <KpiCard
          label="INCIDENTS"
          value={fmtNum(incidents)}
          valueColor={incidents === 0 ? t.up : t.down}
          sub={incidents === 0 ? "NONE ACTIVE" : "ACTIVE NOW"}
          subColor={incidents === 0 ? t.up : t.down}
        />
      </div>

      {/* Services list + Host card */}
      <div style={{ display: "flex", gap: 13, alignItems: "stretch" }}>
        {/* SERVICES */}
        <div style={{ flex: 1.4, ...cardFrame(14) }}>
          <div style={{ ...cardTitle, marginBottom: 14 }}>SERVICES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {services.map((s) => (
              <ServiceRow key={s.name} name={s.name} down={s.down} />
            ))}
          </div>
        </div>

        {/* HOST */}
        <div style={{ flex: 1, ...cardFrame(14), display: "flex", flexDirection: "column" }}>
          <div style={{ ...cardTitle, marginBottom: 16 }}>HOST · friday.local</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginBottom: 16 }}>
            <HostBar label="CPU" pct={host.cpu_pct} />
            <HostBar label="RAM" pct={host.mem_pct} />
            <HostBar label="DISK" pct={host.disk_pct} />
          </div>
          <div
            style={{
              marginTop: "auto",
              background: "#0e1e2c",
              boxShadow: "inset 0 0 0 1px rgba(120,180,210,.18)",
              borderRadius: 7,
              padding: "10px 12px",
            }}
          >
            <div style={{ fontFamily: t.font.display, fontSize: 15, color: t.accent2, lineHeight: 1 }}>
              {deploy.project ?? "—"}
            </div>
            <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 8.5, letterSpacing: ".08em", color: t.textMuted, marginTop: 4 }}>
              LAST DEPLOY · {(deploy.status ?? "—").toUpperCase()}
              {deploy.ago_hours !== null ? ` · ${uptimeLabel(deploy.ago_hours)} AGO` : ""}
            </div>
          </div>
        </div>
      </div>

      {/* 24h CPU sparkline (sample placeholder) */}
      <CpuSparkline />
    </div>
  );
}
