"use client";

/**
 * Hand-built inline-SVG charts + cards for the FITNESS section (NO chart library):
 *   WeeklyKanban, RirCompressionChart, WeeklyVolumeChart, RepDropoffChart, PrTable,
 *   BodyweightChart, StepsChart, CardioHrChart.
 *
 * Each renders sensibly with zero rows via the shared EmptyState. Pure presentational
 * components — all data is computed/fetched upstream in FitnessSection.
 */

import {
  BODY,
  BodyweightResponse,
  Card,
  CardioHrPoint,
  CardioSession,
  CardTitle,
  DAY_ACCENTS,
  DAY_LABELS,
  DISPLAY,
  EmptyState,
  fmtNum,
  MONO,
  muscleColor,
  muscleSummary,
  PrEntry,
  pointsAttr,
  RepDropoff,
  RirCompressionPoint,
  round1,
  SessionSummary,
  StepsEntry,
  toPolyline,
  weekdayIndex,
  WeeklyVolumeWeek,
} from "./shared";

// --- weekly kanban -----------------------------------------------------------

interface KanbanCell {
  kind: "lift" | "cardio" | "rest";
  liftGroups?: string[];
  liftSets?: number;
  cardioMin?: number;
  cardioHr?: number | null;
  cardioType?: string;
}

/** Buckets this week's sessions + cardio into Mon–Sun cells; cardio fills only empty days. */
function buildKanban(sessions: SessionSummary[], cardio: CardioSession[]): KanbanCell[] {
  const cells: KanbanCell[] = DAY_LABELS.map(() => ({ kind: "rest" }));

  for (const s of sessions) {
    const idx = weekdayIndex(s.started_at);
    if (idx < 0) continue;
    cells[idx] = { kind: "lift", liftGroups: s.muscle_groups, liftSets: s.set_count };
  }
  for (const c of cardio) {
    const idx = weekdayIndex(c.logged_at);
    if (idx < 0) continue;
    if (cells[idx].kind === "rest") {
      cells[idx] = {
        kind: "cardio",
        cardioMin: c.duration_min,
        cardioHr: c.avg_hr,
        cardioType: c.activity_type,
      };
    }
  }
  return cells;
}

export function WeeklyKanban({
  sessions,
  cardio,
}: {
  sessions: SessionSummary[];
  cardio: CardioSession[];
}): React.JSX.Element {
  const cells = buildKanban(sessions, cardio);
  const sessionCount = cells.filter((c) => c.kind !== "rest").length;

  return (
    <Card style={{ padding: "18px 20px" }}>
      <CardTitle title="THIS WEEK" sub={`${sessionCount} SESSION${sessionCount === 1 ? "" : "S"} LOGGED`} />
      <div style={{ display: "flex", gap: 8 }}>
        {cells.map((cell, i) => (
          <div key={DAY_LABELS[i]} style={{ flex: 1 }}>
            <div
              style={{
                fontFamily: BODY,
                fontWeight: 800,
                fontSize: 10,
                letterSpacing: ".1em",
                color: "#6fa8cc",
                marginBottom: 6,
                textAlign: "center",
              }}
            >
              {DAY_LABELS[i]}
            </div>
            <KanbanCellView cell={cell} accent={DAY_ACCENTS[i]} />
          </div>
        ))}
      </div>
    </Card>
  );
}

function KanbanCellView({ cell, accent }: { cell: KanbanCell; accent: string }): React.JSX.Element {
  if (cell.kind === "rest") {
    return (
      <div
        style={{
          background: "#0a141d",
          boxShadow: "inset 0 0 0 1px rgba(120,150,170,.12)",
          borderRadius: 6,
          padding: 10,
          minHeight: 84,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div style={{ fontFamily: DISPLAY, fontSize: 14, color: "#3f5a6b" }}>REST</div>
      </div>
    );
  }

  const isCardio = cell.kind === "cardio";
  return (
    <div
      style={{
        background: "#0e1e2c",
        borderTop: `2px solid ${accent}`,
        boxShadow: "inset 0 0 0 1px rgba(120,180,210,.22)",
        borderRadius: "0 0 6px 6px",
        padding: 10,
        minHeight: 84,
      }}
    >
      <div style={{ fontFamily: DISPLAY, fontSize: 15, color: "#dceef2" }}>
        {isCardio ? (cell.cardioType ?? "CARDIO").toUpperCase() : "LIFT"}
      </div>
      <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 10, color: "#7fb0d2", marginTop: 4 }}>
        {isCardio ? "cardio" : muscleSummary(cell.liftGroups ?? [])}
      </div>
      {isCardio ? (
        <div style={{ fontFamily: DISPLAY, fontSize: 18, color: accent, marginTop: 8 }}>
          {Math.round(cell.cardioMin ?? 0)}
          <span style={{ fontSize: 10, color: "#6fa8cc" }}>
            m{cell.cardioHr != null ? ` · ${cell.cardioHr}♥` : ""}
          </span>
        </div>
      ) : (
        <div style={{ fontFamily: DISPLAY, fontSize: 18, color: accent, marginTop: 8 }}>
          {cell.liftSets ?? 0}
          <span style={{ fontSize: 10, color: "#6fa8cc" }}> SETS</span>
        </div>
      )}
    </div>
  );
}

// --- RIR compression hero chart ----------------------------------------------

export function RirCompressionChart({ points }: { points: RirCompressionPoint[] }): React.JSX.Element {
  const W = 520;
  const H = 200;
  const PAD = 18;
  // RIR domain is 0..5; the 0–1 "landing zone" band sits at the bottom.
  const Y_MIN = 0;
  const Y_MAX = 5;

  const bandTop = PAD + (H - PAD * 2) - ((1 - Y_MIN) / (Y_MAX - Y_MIN)) * (H - PAD * 2);
  const baseY = H - PAD;

  const coords = toPolyline(
    points.map((p) => p.avg_rir),
    W,
    H,
    PAD,
    Y_MIN,
    Y_MAX,
  );
  const last = points[points.length - 1];

  return (
    <Card flex={1.5} style={{ display: "flex", flexDirection: "column" }}>
      <CardTitle title="RIR COMPRESSION" sub="AVG RIR / SET · BY WEEK" />
      <div style={{ fontFamily: BODY, fontWeight: 600, fontSize: 11.5, color: "#8fb6d2", marginBottom: 14 }}>
        Effort trends toward failure as the block matures — target landing zone{" "}
        <span style={{ color: "#7dffb0" }}>0–1 RIR</span>.
      </div>
      {points.length === 0 ? (
        <EmptyState label="NO SETS LOGGED YET" height={200} />
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: "auto", display: "block" }}>
            <rect x={0} y={bandTop} width={W} height={baseY - bandTop} fill="#7dffb0" opacity={0.09} />
            <line x1={0} y1={baseY} x2={W} y2={baseY} stroke="rgba(160,205,228,.18)" strokeWidth={1} />
            <line
              x1={0}
              y1={bandTop}
              x2={W}
              y2={bandTop}
              stroke="rgba(125,255,176,.35)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            {coords.length > 1 ? (
              <polygon
                points={`${pointsAttr(coords)} ${coords[coords.length - 1].x},${baseY} ${coords[0].x},${baseY}`}
                fill="#5fc8ff"
                opacity={0.08}
              />
            ) : null}
            <polyline
              points={pointsAttr(coords)}
              fill="none"
              stroke="#5fc8ff"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {coords.map((c, i) => (
              <circle
                key={i}
                cx={c.x}
                cy={c.y}
                r={i === coords.length - 1 ? 4.5 : 3}
                fill={i === coords.length - 1 ? "#7dffb0" : "#5fc8ff"}
              />
            ))}
          </svg>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: MONO,
              fontSize: 9,
              color: "#5d7785",
              marginTop: 4,
            }}
          >
            <span>WK1</span>
            <span>{last ? `LATEST · ${last.avg_rir} AVG` : ""}</span>
          </div>
        </>
      )}
    </Card>
  );
}

// --- weekly volume stacked bars ----------------------------------------------

export function WeeklyVolumeChart({ weeks }: { weeks: WeeklyVolumeWeek[] }): React.JSX.Element {
  const groupSet = new Set<string>();
  for (const w of weeks) for (const g of Object.keys(w.groups)) groupSet.add(g);
  const groups = [...groupSet];

  const maxTotal = weeks.reduce((m, w) => Math.max(m, w.total), 0) || 1;
  const CHART_H = 128;

  return (
    <Card flex={1.3} style={{ padding: "18px 20px" }}>
      <CardTitle title="WEEKLY VOLUME" sub="SETS BY MUSCLE GROUP" />
      {weeks.length === 0 ? (
        <EmptyState label="NO VOLUME LOGGED YET" height={CHART_H} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 14, alignItems: "flex-end", height: CHART_H, paddingLeft: 4 }}>
            {weeks.map((w, wi) => (
              <div key={w.week} style={{ flex: 1, display: "flex", flexDirection: "column-reverse", gap: 2 }}>
                {groups.map((g, gi) => {
                  const sets = w.groups[g] ?? 0;
                  if (sets === 0) return null;
                  const h = Math.max(2, Math.round((sets / maxTotal) * CHART_H));
                  return (
                    <div
                      key={g}
                      title={`${g}: ${sets} sets (W${wi + 1})`}
                      style={{
                        height: h,
                        background: muscleColor(g, gi),
                        borderRadius: gi === 0 ? "0 0 2px 2px" : undefined,
                      }}
                    />
                  );
                })}
                {w.total === 0 ? <div style={{ height: 2 }} /> : null}
              </div>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: MONO,
              fontSize: 9,
              color: "#5d7785",
              marginTop: 7,
              padding: "0 2px",
            }}
          >
            {weeks.map((w, i) => (
              <span key={w.week}>W{i + 1}</span>
            ))}
          </div>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 9,
              marginTop: 12,
              fontFamily: BODY,
              fontWeight: 700,
              fontSize: 9.5,
              color: "#9fb4c0",
            }}
          >
            {groups.map((g, gi) => (
              <span key={g} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <span style={{ width: 9, height: 9, background: muscleColor(g, gi), borderRadius: 2 }} />
                {g.toUpperCase()}
              </span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// --- rep drop-off curve ------------------------------------------------------

export function RepDropoffChart({ dropoff }: { dropoff: RepDropoff }): React.JSX.Element {
  const W = 260;
  const H = 120;
  const PAD = 16;
  const pts = dropoff.points;
  const maxReps = pts.reduce((m, p) => Math.max(m, p.reps), 0) || 1;
  const coords = toPolyline(
    pts.map((p) => p.reps),
    W,
    H,
    PAD,
    0,
    maxReps,
  );

  return (
    <Card flex={1} style={{ padding: "18px 20px" }}>
      <CardTitle title="REP DROP-OFF" sub={dropoff.exercise_name ? dropoff.exercise_name.toUpperCase() : "LAST SESSION"} />
      {pts.length === 0 ? (
        <EmptyState label="NO SETS LOGGED YET" height={H} />
      ) : (
        <>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 100, display: "block" }}>
            <line x1={0} y1={H - PAD} x2={W} y2={H - PAD} stroke="rgba(160,205,228,.16)" strokeWidth={1} />
            <polyline
              points={pointsAttr(coords)}
              fill="none"
              stroke="#ffd36b"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {coords.map((c, i) => (
              <circle key={i} cx={c.x} cy={c.y} r={3} fill="#ffd36b" />
            ))}
          </svg>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              fontFamily: MONO,
              fontSize: 9,
              color: "#5d7785",
              marginTop: 2,
            }}
          >
            {pts.map((p) => (
              <span key={p.set_number}>S{p.set_number}</span>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// --- PR table ----------------------------------------------------------------

export function PrTable({ prs }: { prs: PrEntry[] }): React.JSX.Element {
  const top = prs.slice(0, 6);
  return (
    <Card flex={1} style={{ padding: "18px 20px" }}>
      <CardTitle title="PERSONAL RECORDS" sub="MAX REPS / EXERCISE" />
      {top.length === 0 ? (
        <EmptyState label="NO PRS YET" height={120} />
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {top.map((pr, i) => (
            <div
              key={pr.exercise_id}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                background: "#0e1e2c",
                boxShadow: "inset 0 0 0 1px rgba(120,180,210,.2)",
                borderRadius: 8,
                padding: "8px 11px",
              }}
            >
              <span style={{ width: 14, height: 14, borderRadius: 3, background: muscleColor(pr.muscle_group, i), flex: "none" }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    fontFamily: BODY,
                    fontWeight: 700,
                    fontSize: 12,
                    color: "#dceef2",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {pr.exercise_name}
                </div>
                <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 8.5, letterSpacing: ".1em", color: "#6fa8cc" }}>
                  {pr.muscle_group.toUpperCase()}
                </div>
              </div>
              <div style={{ fontFamily: DISPLAY, fontSize: 18, color: "#5fc8ff", lineHeight: 1 }}>
                {pr.best_reps}
                <span style={{ fontSize: 9, color: "#6fa8cc" }}> REPS</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

// --- bodyweight trend --------------------------------------------------------

export function BodyweightChart({ data }: { data: BodyweightResponse }): React.JSX.Element {
  const W = 240;
  const H = 96;
  const PAD = 8;
  const entries = data.entries;
  const ma = data.moving_avg;

  const weights = entries.map((e) => e.weight);
  const allVals = [...weights, ...ma.map((m) => m.avg)];
  const yMin = allVals.length ? Math.min(...allVals) - 1 : 0;
  const yMax = allVals.length ? Math.max(...allVals) + 1 : 1;

  const rawCoords = toPolyline(weights, W, H, PAD, yMin, yMax);
  const maCoords = toPolyline(
    ma.map((m) => m.avg),
    W,
    H,
    PAD,
    yMin,
    yMax,
  );

  const latest = entries[entries.length - 1];
  const prev = entries[entries.length - 2];
  const delta = latest && prev ? latest.weight - prev.weight : null;

  return (
    <Card flex={1} style={{ padding: "18px 20px" }}>
      <CardTitle title="BODYWEIGHT" sub="RAW · 7D MOVING AVG" />
      {entries.length === 0 ? (
        <EmptyState label="NO WEIGH-INS YET" height={H} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 28, color: "#dceef2", lineHeight: 1 }}>
              {latest ? round1(latest.weight) : "—"}
            </span>
            {delta !== null ? (
              <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 12, color: delta <= 0 ? "#7dffb0" : "#ff9a8a" }}>
                {delta <= 0 ? "▼" : "▲"} {round1(Math.abs(delta))} {latest?.unit ?? "lb"}
              </span>
            ) : null}
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 88, display: "block" }}>
            <polyline points={pointsAttr(rawCoords)} fill="none" stroke="rgba(120,180,210,.4)" strokeWidth={1.5} />
            <polyline
              points={pointsAttr(maCoords)}
              fill="none"
              stroke="#5fc8ff"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {maCoords.length > 0 ? (
              <circle cx={maCoords[maCoords.length - 1].x} cy={maCoords[maCoords.length - 1].y} r={4} fill="#7dffb0" />
            ) : null}
          </svg>
        </>
      )}
    </Card>
  );
}

// --- steps bars --------------------------------------------------------------

export function StepsChart({ steps }: { steps: StepsEntry[] }): React.JSX.Element {
  const recent = steps.slice(-7);
  const maxCount = recent.reduce((m, s) => Math.max(m, s.count), 0) || 1;
  const avg = recent.length ? Math.round(recent.reduce((a, s) => a + s.count, 0) / recent.length) : 0;
  const today = recent[recent.length - 1];
  const bestIdx = recent.length
    ? recent.reduce((bi, s, i, arr) => (s.count > arr[bi].count ? i : bi), 0)
    : -1;

  return (
    <Card flex={1} style={{ padding: "18px 20px" }}>
      <CardTitle title="STEPS" sub={recent.length ? `7D · AVG ${fmtNum(avg)}` : "7D"} />
      {recent.length === 0 ? (
        <EmptyState label="NO STEPS LOGGED YET" height={90} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", height: 90 }}>
            {recent.map((s, i) => (
              <div key={s.date} style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "flex-end", height: "100%" }}>
                <div
                  title={`${s.date}: ${fmtNum(s.count)} steps`}
                  style={{
                    height: `${Math.max(4, Math.round((s.count / maxCount) * 100))}%`,
                    background:
                      i === bestIdx
                        ? "linear-gradient(180deg,#7dffb0,#3fb878)"
                        : "linear-gradient(180deg,#5fc8ff,#2b7fd0)",
                    borderRadius: "3px 3px 0 0",
                  }}
                />
              </div>
            ))}
          </div>
          <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: "#7fb0d2", marginTop: 8 }}>
            TODAY{" "}
            <span style={{ color: "#dceef2", fontFamily: DISPLAY, fontSize: 15 }}>
              {today ? fmtNum(today.count) : "—"}
            </span>
          </div>
        </>
      )}
    </Card>
  );
}

// --- cardio HR trend ---------------------------------------------------------

export function CardioHrChart({ points }: { points: CardioHrPoint[] }): React.JSX.Element {
  const W = 260;
  const H = 110;
  const PAD = 14;
  const hrs = points.map((p) => p.avg_hr);
  const yMin = hrs.length ? Math.min(...hrs) - 5 : 0;
  const yMax = hrs.length ? Math.max(...hrs) + 5 : 1;
  const coords = toPolyline(hrs, W, H, PAD, yMin, yMax);
  const latest = points[points.length - 1];

  return (
    <Card flex={1} style={{ padding: "18px 20px" }}>
      <CardTitle title="CARDIO HR" sub="AVG HR / SESSION" />
      {points.length === 0 ? (
        <EmptyState label="NO CARDIO LOGGED YET" height={H} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 8 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 26, color: "#dceef2", lineHeight: 1 }}>
              {latest ? latest.avg_hr : "—"}
            </span>
            <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: "#ff9a8a" }}>♥ LATEST BPM</span>
          </div>
          <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 92, display: "block" }}>
            <line x1={0} y1={H - PAD} x2={W} y2={H - PAD} stroke="rgba(160,205,228,.16)" strokeWidth={1} />
            <polyline
              points={pointsAttr(coords)}
              fill="none"
              stroke="#ff9a8a"
              strokeWidth={2.5}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {coords.map((c, i) => (
              <circle
                key={i}
                cx={c.x}
                cy={c.y}
                r={i === coords.length - 1 ? 4 : 2.5}
                fill={i === coords.length - 1 ? "#ffd36b" : "#ff9a8a"}
              />
            ))}
          </svg>
        </>
      )}
    </Card>
  );
}
