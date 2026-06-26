"use client";

/**
 * Secondary FITNESS cards: STEPS (iOS Shortcut bridge) and CARDIO (Strava sync). Both are
 * self-fetching, read-only, and degrade to an empty state with zero rows. Hand-built inline
 * SVG / flex bars — no chart library. The hero bodyweight chart lives in ./bodyweight; the
 * weekly workout calendar in ./calendar.
 */

import { useEffect, useState } from "react";

import { t, tabularNum } from "@/components/dashboard/tokens";
import {
  addDays,
  BODY,
  Card,
  CardTitle,
  CardioSession,
  DAY_LABELS,
  DISPLAY,
  EmptyState,
  fetchData,
  fmtNum,
  isoDate,
  type LinePoint,
  MONO,
  parseIso,
  SkeletonState,
  smoothPath,
  startOfWeek,
  StepsEntry,
} from "./shared";

// Stable empty fallbacks — passing a fresh [] literal into useResource each render would
// change the effect dependency every render and refetch in a loop.
const EMPTY_STEPS: StepsEntry[] = [];
const EMPTY_CARDIO: CardioSession[] = [];

/** Read-only fetch-into-state for the simple cards (steps/cardio). */
function useResource<T>(url: string, fallback: T): { data: T | null; error: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let cancelled = false;
    fetchData<T>(url, fallback)
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) {
          setError(true);
          setData(fallback);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [url, fallback]);
  return { data, error };
}

function useFirstPaint(): boolean {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPainted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return painted;
}

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const shortDate = (iso: string): string => {
  // logged_at is a full SQLite datetime ("2026-06-24 15:56:17"); parseIso needs the date part.
  const d = parseIso(iso.slice(0, 10));
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
};

// --- STEPS -------------------------------------------------------------------

const STEPS_GOAL = 8000; // reference; matches the Overview soft cap

export function StepsCard(): React.JSX.Element {
  const { data, error } = useResource<StepsEntry[]>("/api/fitness/steps", EMPTY_STEPS);
  const painted = useFirstPaint();

  if (!data) {
    return (
      <Card flex={1}>
        <CardTitle title="STEPS" sub="LOADING" />
        <SkeletonState height={150} />
      </Card>
    );
  }

  const recent = data.slice(-30);
  const max = Math.max(STEPS_GOAL, ...recent.map((r) => r.count), 1);
  const last7 = data.slice(-7);
  const avg7 = last7.length > 0 ? Math.round(last7.reduce((s, r) => s + r.count, 0) / last7.length) : null;
  const latest = data.length > 0 ? data[data.length - 1] : null;

  return (
    <Card flex={1}>
      <CardTitle title="STEPS" sub="30D · APPLE WATCH" />
      {recent.length === 0 ? (
        <EmptyState label={error ? "COULD NOT LOAD STEPS" : "NO STEPS YET · SYNCS FROM APPLE WATCH"} height={150} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 9.5, letterSpacing: ".14em", color: t.textMuted }}>7-DAY AVG</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 28, lineHeight: 0.95, color: "#fff", ...tabularNum }}>{fmtNum(avg7)}</div>
            </div>
            {latest ? (
              <div>
                <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 9.5, letterSpacing: ".14em", color: t.textMuted }}>LATEST</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 28, lineHeight: 0.95, color: t.accent, ...tabularNum }}>{fmtNum(latest.count)}</div>
              </div>
            ) : null}
          </div>
          <div
            role="img"
            aria-label={`Steps over the last ${recent.length} days, 7-day average ${fmtNum(avg7)}.`}
            style={{ display: "flex", gap: 3, alignItems: "flex-end", height: 110 }}
          >
            {recent.map((r) => {
              const pct = Math.round((r.count / max) * 100);
              const hit = r.count >= STEPS_GOAL;
              return (
                <div
                  key={r.id}
                  title={`${shortDate(r.date)} · ${fmtNum(r.count)}`}
                  style={{
                    flex: 1,
                    minWidth: 3,
                    height: `${Math.max(2, pct)}%`,
                    transformOrigin: "bottom",
                    transform: `scaleY(${painted ? 1 : 0})`,
                    borderRadius: "3px 3px 0 0",
                    background: hit
                      ? "linear-gradient(180deg,#7fe3ff,#46b8ff)"
                      : "linear-gradient(180deg,rgba(95,166,255,.7),rgba(70,140,200,.5))",
                    transition: `transform ${t.dur.normal} ${t.ease}`,
                  }}
                />
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}

// --- CARDIO (Strava) ---------------------------------------------------------

const PLACEHOLDER_ACTIVITY = "strava-pending";

export function CardioCard(): React.JSX.Element {
  const { data, error } = useResource<CardioSession[]>("/api/fitness/cardio", EMPTY_CARDIO);

  if (!data) {
    return (
      <Card flex={1}>
        <CardTitle title="CARDIO" sub="LOADING" />
        <SkeletonState height={150} />
      </Card>
    );
  }

  if (data.length === 0) {
    return (
      <Card flex={1}>
        <CardTitle title="CARDIO" sub="APPLE WATCH" />
        <EmptyState label={error ? "COULD NOT LOAD CARDIO" : "NO CARDIO YET · SYNCS FROM APPLE WATCH"} height={150} />
      </Card>
    );
  }

  // HR trend: chronological sessions that carry an avg HR.
  const hrSeries = [...data]
    .filter((d) => d.avg_hr !== null && d.avg_hr > 0)
    .sort((a, b) => a.logged_at.localeCompare(b.logged_at))
    .map((d) => d.avg_hr as number);

  const W = 360;
  const Hh = 70;
  const pad = 8;
  let hrPts: LinePoint[] = [];
  if (hrSeries.length >= 2) {
    const hrMin = Math.min(...hrSeries);
    const hrMax = Math.max(...hrSeries);
    const span = hrMax - hrMin || 1;
    const step = (W - pad * 2) / (hrSeries.length - 1);
    hrPts = hrSeries.map((v, i) => ({
      x: Math.round((pad + step * i) * 10) / 10,
      y: Math.round((pad + (Hh - pad * 2) - ((v - hrMin) / span) * (Hh - pad * 2)) * 10) / 10,
    }));
  }

  const recent = data.slice(0, 6);

  return (
    <Card flex={1}>
      <CardTitle title="CARDIO" sub="APPLE WATCH" />

      {hrPts.length >= 2 ? (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 9.5, letterSpacing: ".14em", color: t.textMuted, marginBottom: 4 }}>
            AVG HR / SESSION
          </div>
          <svg viewBox={`0 0 ${W} ${Hh}`} width="100%" height={Hh} role="img" aria-label="Average heart rate per cardio session" style={{ display: "block" }}>
            <path key={hrPts.length} className="fr-draw" d={smoothPath(hrPts)} fill="none" stroke="#ff7a68" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
            {hrPts.map((p, i) => (
              <circle key={i} cx={p.x} cy={p.y} r={2.2} fill="#ff7a68" />
            ))}
          </svg>
        </div>
      ) : null}

      <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 7 }}>
        {recent.map((s) => {
          const pending = s.activity_type === PLACEHOLDER_ACTIVITY || s.duration_min === 0;
          return (
            <li
              key={s.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
                padding: "7px 10px",
                borderRadius: 6,
                background: "rgba(8,24,38,.4)",
                boxShadow: "inset 0 0 0 1px rgba(120,180,210,.12)",
              }}
            >
              <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 12.5, color: t.textBody, textTransform: "capitalize" }}>
                {pending ? "Pending sync" : s.activity_type}
              </span>
              <span style={{ display: "flex", gap: 12, fontFamily: MONO, fontSize: 10.5, color: t.textMuted, ...tabularNum }}>
                {pending ? (
                  <span style={{ color: t.textDim }}>{shortDate(s.logged_at)}</span>
                ) : (
                  <>
                    <span>{Math.round(s.duration_min)}m</span>
                    {s.avg_hr ? <span style={{ color: "#ff9a8a" }}>{s.avg_hr}♥</span> : null}
                    <span style={{ color: t.textDim }}>{shortDate(s.logged_at)}</span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

// --- WEEKLY STEPS GRID -------------------------------------------------------

export function WeeklyStepsTable(): React.JSX.Element {
  const { data, error } = useResource<StepsEntry[]>("/api/fitness/steps", EMPTY_STEPS);
  const painted = useFirstPaint();
  const todayIso = isoDate(new Date());
  const weekStart = startOfWeek(new Date());
  const days = DAY_LABELS.map((label, i) => {
    const d = addDays(weekStart, i);
    return { label, iso: isoDate(d), num: d.getDate() };
  });

  if (!data) {
    return (
      <Card flex={1}>
        <CardTitle title="WEEKLY STEPS" sub="LOADING" />
        <SkeletonState height={150} />
      </Card>
    );
  }

  const byDate = new Map(data.map((e) => [e.date, e.count]));
  const weekCounts = days.map(({ iso }) => byDate.get(iso) ?? null);
  const logged = weekCounts.filter((n): n is number => n !== null);
  const avg7 = logged.length > 0 ? Math.round(logged.reduce((s, n) => s + n, 0) / logged.length) : null;
  const latest = [...data].reverse().find((e) => days.some((d) => d.iso === e.date)) ?? null;

  return (
    <Card flex={1}>
      <CardTitle title="WEEKLY STEPS" sub="MON — SUN · APPLE WATCH" />
      {error ? (
        <EmptyState label="COULD NOT LOAD STEPS" height={150} />
      ) : (
        <>
          <div style={{ display: "flex", gap: 24, marginBottom: 12 }}>
            <div>
              <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 9.5, letterSpacing: ".14em", color: t.textMuted }}>7-DAY AVG</div>
              <div style={{ fontFamily: DISPLAY, fontSize: 28, lineHeight: 0.95, color: "#fff" }}>{avg7 !== null ? fmtNum(avg7) : "—"}</div>
            </div>
            {latest ? (
              <div>
                <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 9.5, letterSpacing: ".14em", color: t.textMuted }}>LATEST</div>
                <div style={{ fontFamily: DISPLAY, fontSize: 28, lineHeight: 0.95, color: t.accent }}>{fmtNum(latest.count)}</div>
              </div>
            ) : null}
          </div>
          <div
            role="img"
            aria-label={`Steps this week, 7-day average ${avg7 !== null ? fmtNum(avg7) : "none"}.`}
            style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6 }}
          >
            {days.map(({ label, iso, num }, i) => {
              const count = byDate.get(iso) ?? null;
              const isToday = iso === todayIso;
              const hit = count !== null && count >= STEPS_GOAL;
              return (
                <div
                  key={iso}
                  title={`${label} ${num} · ${count !== null ? fmtNum(count) : "no data"}`}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    padding: "10px 4px",
                    borderRadius: 8,
                    background: isToday ? "rgba(70,184,255,.1)" : "rgba(8,24,38,.4)",
                    boxShadow: isToday
                      ? "inset 0 0 0 1px rgba(70,184,255,.3)"
                      : "inset 0 0 0 1px rgba(120,180,210,.08)",
                    opacity: painted ? 1 : 0,
                    transition: `opacity var(--dur-normal) ${t.ease} ${i * 30}ms`,
                  }}
                >
                  <div style={{ fontFamily: BODY, fontWeight: 800, fontSize: 9, letterSpacing: ".12em", color: isToday ? t.accent : t.textMuted }}>
                    {label}
                  </div>
                  <div style={{ fontFamily: MONO, fontSize: 9.5, color: t.textDim }}>{num}</div>
                  <div style={{ fontFamily: DISPLAY, fontSize: count !== null ? 15 : 13, color: hit ? "#7fe3ff" : count !== null ? "#fff" : t.textDim, marginTop: 4 }}>
                    {count !== null ? fmtNum(count) : "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </Card>
  );
}
