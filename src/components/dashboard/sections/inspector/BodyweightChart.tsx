"use client";

/**
 * Bodyweight trend — hand-built inline SVG (no chart lib), MacroFactor-style: a filled area
 * under a smooth polyline, latest point ringed. Merges in-camp (`weight_logs`) and between-camps
 * (`walk_around_logs`) readings; the two sources share one line but get distinct dot fills so the
 * cut vs walk-around phases stay legible. Motion is the global reduced-motion guard's concern.
 */

import { t, tabularNum } from "@/components/dashboard/tokens";
import { panel, panelHeading, panelMeta, fmtDay, PANEL_TEXT } from "./style";
import type { BodyweightPoint } from "./api";

const W = 300;
const H = 96;
const PAD_X = 12;
const PAD_TOP = 14;
const PAD_BOTTOM = 18;

interface Scaled {
  x: number;
  y: number;
  point: BodyweightPoint;
}

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ms for a point's date; date-only strings are anchored to local midnight (see style.ts). */
function dateMs(s: string): number {
  return new Date(DATE_ONLY_RE.test(s) ? `${s}T00:00:00` : s).getTime();
}

/**
 * Maps weight points into SVG coords. X is positioned by the point's DATE across the window (so a
 * dense burst of weigh-ins then sparse readings keeps a truthful time axis / slope), not by array
 * index. A single point sits centered, flat.
 */
function scalePoints(points: readonly BodyweightPoint[]): Scaled[] {
  if (points.length === 0) return [];
  const weights = points.map((p) => p.weight);
  const wMin = Math.min(...weights);
  const wSpan = Math.max(...weights) - wMin;
  const times = points.map((p) => dateMs(p.date));
  const tMin = Math.min(...times);
  const tSpanRaw = Math.max(...times) - tMin;
  const tSpan = Number.isFinite(tSpanRaw) ? tSpanRaw : 0;
  const innerW = W - PAD_X * 2;
  const innerH = H - PAD_TOP - PAD_BOTTOM;

  return points.map((point, i) => {
    const xFrac =
      points.length === 1 ? 0.5 : tSpan === 0 ? i / (points.length - 1) : (dateMs(point.date) - tMin) / tSpan;
    const x = PAD_X + innerW * xFrac;
    const tNorm = wSpan === 0 ? 0.5 : (point.weight - wMin) / wSpan; // higher weight → higher on chart
    const y = PAD_TOP + innerH * (1 - tNorm);
    return { x, y, point };
  });
}

export function BodyweightChart({ points }: { points: readonly BodyweightPoint[] }) {
  const scaled = scalePoints(points);
  const hasData = scaled.length > 0;

  const first = points[0];
  const last = points[points.length - 1];
  // A single reading is no trend — don't render a fabricated "0.0 lb" delta.
  const delta = hasData && points.length > 1 && first && last ? last.weight - first.weight : null;
  const deltaColor = delta === null || delta === 0 ? t.textMuted : delta < 0 ? t.up : t.down;
  const deltaArrow = delta === null || delta === 0 ? "" : delta < 0 ? "▼" : "▲";
  const deltaLabel =
    delta === null ? "" : `${delta < 0 ? "down" : delta > 0 ? "up" : "no change"} ${Math.abs(delta).toFixed(1)} pounds over window`;

  const line = scaled.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(" ");
  const area = hasData
    ? `${line} ${scaled[scaled.length - 1].x.toFixed(1)},${H} ${scaled[0].x.toFixed(1)},${H}`
    : "";
  const tail = hasData ? scaled[scaled.length - 1] : null;

  return (
    <div style={panel()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={panelHeading}>BODYWEIGHT</div>
        <div style={panelMeta}>{hasData ? `${points.length} PT${points.length === 1 ? "" : "S"}` : "NO DATA"}</div>
      </div>

      {hasData ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: t.font.display, fontSize: 28, color: PANEL_TEXT, lineHeight: 1, ...tabularNum }}>
              {last ? last.weight.toFixed(1) : "—"}
            </span>
            {delta !== null ? (
              <span aria-label={deltaLabel} style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 12, color: deltaColor, ...tabularNum }}>
                <span aria-hidden>{deltaArrow} </span>
                {Math.abs(delta).toFixed(1)} lb
              </span>
            ) : null}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 84, display: "block" }} role="img" aria-label="Bodyweight trend">
            <polygon points={area} fill={t.accent} opacity={0.08} />
            <polyline points={line} fill="none" stroke={t.accent} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {/* per-source dots: walk-around (between camps) reads dimmer than in-camp cut points */}
            {scaled.map((s, i) => (
              <circle
                key={i}
                cx={s.x}
                cy={s.y}
                r={1.8}
                fill={s.point.source === "walk_around" ? t.textDim : t.accent}
                opacity={0.7}
              />
            ))}
            {tail ? (
              <>
                <circle cx={tail.x} cy={tail.y} r={4} fill={t.up} />
                <circle cx={tail.x} cy={tail.y} r={7} fill="none" stroke={t.up} strokeWidth={1.5} opacity={0.4} />
              </>
            ) : null}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: t.font.mono, fontSize: 9, color: t.textDim, marginTop: 2, ...tabularNum }}>
            <span>{fmtDay(first?.date ?? null)}</span>
            <span>{fmtDay(last?.date ?? null)}</span>
          </div>
        </>
      ) : (
        <div style={{ fontFamily: t.font.body, fontSize: 13, color: t.textMuted, padding: "22px 4px", textAlign: "center" }}>
          —<br />
          <span style={{ fontSize: 11, color: t.textDim }}>No bodyweight logs.</span>
        </div>
      )}
    </div>
  );
}
