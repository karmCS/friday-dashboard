"use client";

/**
 * Shared primitives for the FITNESS section: design tokens, the response type mirrors of the
 * /api/fitness/* payloads, the typed fetch helper (narrows from `unknown`), small formatting
 * + SVG-coordinate helpers, the reduced-motion hook, and the reusable card shell.
 *
 * Kept separate so each FITNESS file stays focused and well under the 800-line ceiling.
 */

import { CSSProperties, useEffect, useState } from "react";

// --- design tokens -----------------------------------------------------------

export const DISPLAY = "'Black Han Sans',sans-serif";
export const BODY = "'Barlow',sans-serif";
export const MONO = "'JetBrains Mono',monospace";

/** Emil Kowalski's expo-style ease-out for the only motion we run (card hover glow). */
export const EASE = "cubic-bezier(0.23,1,0.32,1)";

const CARD_BG = "linear-gradient(160deg,#163a55,#0b2033)";
const CARD_FRAME = "inset 0 0 0 2px rgba(150,212,236,.42)";
const CARD_FRAME_HOVER = "inset 0 0 0 2px rgba(150,212,236,.85),0 0 26px rgba(80,200,255,.32)";
const CARD_CLIP =
  "polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))";

/** Muscle-group → color, matched to the design legend (legs/back/chest/shoulders/arms…). */
const MUSCLE_COLORS: ReadonlyArray<{ key: string; color: string }> = [
  { key: "legs", color: "#5fc8ff" },
  { key: "back", color: "#9a8cff" },
  { key: "chest", color: "#ff7ae6" },
  { key: "shoulders", color: "#ffd36b" },
  { key: "arms", color: "#7dffb0" },
  { key: "core", color: "#ff9a8a" },
];
const FALLBACK_MUSCLE_COLORS = [
  "#5fc8ff",
  "#9a8cff",
  "#ff7ae6",
  "#ffd36b",
  "#7dffb0",
  "#ff9a8a",
  "#c0d4e0",
];

/** Stable color for a muscle group, falling back to a palette slot for unknown groups. */
export function muscleColor(group: string, index: number): string {
  const lower = group.toLowerCase();
  const known = MUSCLE_COLORS.find((m) => lower.startsWith(m.key) || m.key.startsWith(lower));
  if (known) return known.color;
  return FALLBACK_MUSCLE_COLORS[index % FALLBACK_MUSCLE_COLORS.length];
}

export const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;
export const DAY_ACCENTS = ["#5fc8ff", "#9a8cff", "#7dffb0", "#ffd36b", "#5fc8ff", "#9a8cff", "#7dffb0"];

// --- response types (mirrors of the API payloads) ----------------------------

export interface SessionSummary {
  id: number;
  template_id: number | null;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
  muscle_groups: string[];
  set_count: number;
}

export interface CardioSession {
  id: number;
  activity_type: string;
  duration_min: number;
  avg_hr: number | null;
  distance_km: number | null;
  source: string;
  strava_activity_id: string | null;
  logged_at: string;
}

export interface BodyweightEntry {
  id: number;
  date: string;
  weight: number;
  unit: string;
}

export interface MovingAvgPoint {
  date: string;
  avg: number;
}

export interface BodyweightResponse {
  entries: BodyweightEntry[];
  moving_avg: MovingAvgPoint[];
}

export interface StepsEntry {
  id: number;
  date: string;
  count: number;
  source: string;
}

export interface RirCompressionPoint {
  week: string;
  avg_rir: number;
  set_count: number;
}

export interface WeeklyVolumeWeek {
  week: string;
  groups: Record<string, number>;
  total: number;
}

export interface RepDropoffPoint {
  set_number: number;
  reps: number;
}

export interface RepDropoff {
  session_id: number | null;
  exercise_id: number | null;
  exercise_name: string | null;
  points: RepDropoffPoint[];
}

export interface PrEntry {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  best_reps: number;
}

export interface CardioHrPoint {
  logged_at: string;
  activity_type: string;
  avg_hr: number;
}

export interface FitnessAnalytics {
  rir_compression: RirCompressionPoint[];
  weekly_volume: WeeklyVolumeWeek[];
  rep_dropoff: RepDropoff;
  prs: PrEntry[];
  cardio_hr: CardioHrPoint[];
}

export interface FitnessData {
  sessions: SessionSummary[];
  cardio: CardioSession[];
  bodyweight: BodyweightResponse;
  steps: StepsEntry[];
  analytics: FitnessAnalytics;
}

export const EMPTY_ANALYTICS: FitnessAnalytics = {
  rir_compression: [],
  weekly_volume: [],
  rep_dropoff: { session_id: null, exercise_id: null, exercise_name: null, points: [] },
  prs: [],
  cardio_hr: [],
};

export const EMPTY_BODYWEIGHT: BodyweightResponse = { entries: [], moving_avg: [] };

// --- typed fetch helper (narrow from unknown) --------------------------------

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Unwraps the `{ data }` envelope and casts to the expected shape after a shallow check. */
export async function fetchData<T>(url: string, fallback: T): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  const json: unknown = await res.json();
  if (!isObject(json) || !("data" in json)) return fallback;
  return json.data as T;
}

// --- formatting helpers ------------------------------------------------------

export const fmtNum = (n: number): string => n.toLocaleString("en-US");
export const round1 = (n: number): string => (Math.round(n * 10) / 10).toString();

/** Weekday index Mon=0..Sun=6 from an ISO timestamp (local time). */
export function weekdayIndex(iso: string): number {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return -1;
  return (d.getDay() + 6) % 7; // JS Sun=0 → Mon=0
}

/** Short label for a muscle group list, e.g. ["Chest","Shoulders"] → "chest · sho". */
export function muscleSummary(groups: string[]): string {
  if (groups.length === 0) return "—";
  return groups
    .slice(0, 3)
    .map((g) => (g.length > 4 ? g.slice(0, 3).toLowerCase() : g.toLowerCase()))
    .join(" · ");
}

// --- generic SVG line helpers ------------------------------------------------

export interface LinePoint {
  x: number;
  y: number;
}

/** Maps a numeric series to SVG coordinates within a [pad, w-pad] × [pad, h-pad] box. */
export function toPolyline(
  values: number[],
  w: number,
  h: number,
  pad: number,
  yMin: number,
  yMax: number,
): LinePoint[] {
  if (values.length === 0) return [];
  const span = yMax - yMin || 1;
  const innerW = w - pad * 2;
  const innerH = h - pad * 2;
  const step = values.length > 1 ? innerW / (values.length - 1) : 0;
  return values.map((v, i) => {
    const x = pad + (values.length > 1 ? step * i : innerW / 2);
    const y = pad + innerH - ((v - yMin) / span) * innerH;
    return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
  });
}

export const pointsAttr = (pts: LinePoint[]): string =>
  pts.map((p) => `${p.x},${p.y}`).join(" ");

// --- reduced-motion guard ----------------------------------------------------

/** Tracks the user's prefers-reduced-motion setting so we can drop transitions for them. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent): void => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

// --- card shell --------------------------------------------------------------

interface CardProps {
  children: React.ReactNode;
  flex?: number;
  style?: CSSProperties;
}

/** The clip-path card frame shared across the section; hover brightens the boxShadow. */
export function Card({ children, flex, style }: CardProps): React.JSX.Element {
  const [hover, setHover] = useState(false);
  const reduced = usePrefersReducedMotion();
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        flex,
        background: CARD_BG,
        clipPath: CARD_CLIP,
        boxShadow: hover ? CARD_FRAME_HOVER : CARD_FRAME,
        padding: "18px 20px",
        // Motion only on a compositor-cheap prop; disabled under reduced-motion.
        transition: reduced ? undefined : `box-shadow 200ms ${EASE}`,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

/** Card heading + optional right-aligned mono subtitle. */
export function CardTitle({ title, sub }: { title: string; sub?: string }): React.JSX.Element {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "baseline",
        marginBottom: 10,
        gap: 12,
      }}
    >
      <div style={{ fontFamily: DISPLAY, fontSize: 17, color: "#eafaff", letterSpacing: ".03em" }}>
        {title}
      </div>
      {sub ? (
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: "#6fa8cc", textAlign: "right" }}>{sub}</div>
      ) : null}
    </div>
  );
}

/** Centered, muted "no data yet" filler so every chart renders with zero rows. */
export function EmptyState({ label, height }: { label: string; height: number }): React.JSX.Element {
  return (
    <div
      style={{
        height,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: BODY,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: ".1em",
        color: "#3f5a6b",
        background: "rgba(8,24,38,.4)",
        borderRadius: 6,
        boxShadow: "inset 0 0 0 1px rgba(120,180,210,.12)",
      }}
    >
      {label}
    </div>
  );
}
