"use client";

/**
 * Shared primitives for the FITNESS section (calendar-based model, 2026-06-24 pivot).
 *
 * The section no longer logs individual sets — it is a weekly workout CALENDAR of general
 * labels, plus bodyweight (CSV import + iOS Shortcut), steps (iOS Shortcut), and cardio
 * (Strava). This file holds the design tokens, response-type mirrors of the /api/fitness/*
 * payloads, the typed fetch helper (narrows from `unknown`), date + SVG-coordinate helpers,
 * and the reusable card shell + loading skeletons.
 */

import { CSSProperties } from "react";

import { t } from "@/components/dashboard/tokens";
import { Skeleton } from "@/components/dashboard/ui";

// --- design tokens -----------------------------------------------------------

export const DISPLAY = "'Black Han Sans',sans-serif";
export const BODY = "'Barlow',sans-serif";
export const MONO = "'JetBrains Mono',monospace";

export const CARD_BG = "linear-gradient(160deg,#163a55,#0b2033)";

/** Workout types (matches the DB CHECK constraint). */
export const WORKOUT_TYPES = ["lift", "cardio", "rest"] as const;
export type WorkoutType = (typeof WORKOUT_TYPES)[number];

/** Per-type styling: a left-edge / chip accent color + a soft fill + a short label. */
export const TYPE_META: Record<WorkoutType, { label: string; color: string; soft: string }> = {
  lift: { label: "LIFT", color: "#5fc8ff", soft: "rgba(95,200,255,.16)" },
  cardio: { label: "CARDIO", color: "#ffb454", soft: "rgba(255,180,84,.16)" },
  rest: { label: "REST", color: "#8aa6bd", soft: "rgba(138,166,189,.14)" },
};

export const DAY_LABELS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"] as const;

// --- response types (mirrors of the API payloads) ----------------------------

export interface CalendarEntry {
  id: number;
  date: string; // YYYY-MM-DD
  label: string;
  type: WorkoutType;
  notes: string | null;
  created_at: string;
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

export { fmtNum } from "@/lib/format";
export const round1 = (n: number): string => (Math.round(n * 10) / 10).toString();

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_UP = MONTHS.map((m) => m.toUpperCase());

// --- date helpers ------------------------------------------------------------

/** YYYY-MM-DD for a Date in LOCAL time (avoids the UTC off-by-one of toISOString). */
export function isoDate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Parse a YYYY-MM-DD string to a LOCAL Date at midnight. */
export function parseIso(s: string): Date {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

/** Monday-start week containing `d` (midnight, local). */
export function startOfWeek(d: Date): Date {
  const c = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (c.getDay() + 6) % 7; // JS Sun=0 → Mon=0
  c.setDate(c.getDate() - dow);
  return c;
}

/** "Jun 23" (mixed case). */
export function fmtMonthDay(d: Date): string {
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "JUN" upper-case month abbreviation for a Date. */
export function monthUpper(d: Date): string {
  return MONTHS_UP[d.getMonth()];
}

/** Whole days between two Dates (b - a), ignoring time-of-day. */
export function daysBetween(a: Date, b: Date): number {
  const ms = b.getTime() - a.getTime();
  return Math.round(ms / 86_400_000);
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

/**
 * Smooth Catmull-Rom → cubic-bezier path through points (MacroFactor-style soft curve).
 * Falls back to straight segments for < 3 points.
 */
export function smoothPath(pts: LinePoint[]): string {
  if (pts.length === 0) return "";
  if (pts.length < 3) return `M ${pts.map((p) => `${p.x} ${p.y}`).join(" L ")}`;
  const d: string[] = [`M ${pts[0].x} ${pts[0].y}`];
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d.push(`C ${c1x.toFixed(1)} ${c1y.toFixed(1)}, ${c2x.toFixed(1)} ${c2y.toFixed(1)}, ${p2.x} ${p2.y}`);
  }
  return d.join(" ");
}

// --- card shell --------------------------------------------------------------

interface CardProps {
  children: React.ReactNode;
  flex?: number;
  style?: CSSProperties;
}

/**
 * The clip-path card frame shared across the section. Hover/focus-visible lift comes from the
 * shared `fr-card` utility (respects the global reduced-motion guard).
 */
export function Card({ children, flex, style }: CardProps): React.JSX.Element {
  return (
    <div
      className="fr-card"
      style={{
        flex,
        background: CARD_BG,
        clipPath: t.clipCard,
        boxShadow: `inset 0 0 0 2px ${t.frame}`,
        padding: "18px 20px",
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
      <div style={{ fontFamily: DISPLAY, fontSize: 17, color: t.text, letterSpacing: ".03em" }}>
        {title}
      </div>
      {sub ? (
        <div style={{ fontFamily: MONO, fontSize: 9.5, color: t.textMuted, textAlign: "right" }}>{sub}</div>
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
        color: t.textMuted,
        background: "rgba(8,24,38,.4)",
        borderRadius: 6,
        boxShadow: "inset 0 0 0 1px rgba(120,180,210,.12)",
        textAlign: "center",
        padding: "0 16px",
      }}
    >
      {label}
    </div>
  );
}

/** Shape-matching loading filler sized like real chart content (reserves height, no shift). */
export function SkeletonState({ height }: { height: number }): React.JSX.Element {
  return <Skeleton height={height} radius={6} style={{ background: "rgba(8,24,38,.4)" }} />;
}

/** A full card skeleton: title row + a chart-shaped block, matching the real Card padding. */
export function SkeletonCard({
  flex,
  blockHeight = 128,
  style,
}: {
  flex?: number;
  blockHeight?: number;
  style?: CSSProperties;
}): React.JSX.Element {
  return (
    <Card flex={flex} style={style}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10, gap: 12 }}>
        <Skeleton width={140} height={16} />
        <Skeleton width={90} height={10} />
      </div>
      <SkeletonState height={blockHeight} />
    </Card>
  );
}
