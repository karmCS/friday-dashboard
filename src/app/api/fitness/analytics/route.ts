/**
 * /api/fitness/analytics
 *
 *   GET — a single computed analytics object for the FITNESS section's charts. Everything is
 *         derived server-side from the workout tables so the client renders dumb data:
 *
 *           rir_compression — avg RIR per logged set, bucketed by ISO week (recent weeks).
 *                             Trends toward 0 as a mesocycle matures (effort → failure).
 *           weekly_volume   — set counts per muscle group per week, last 6 weeks (stacked bars).
 *           rep_dropoff     — reps across set_number for the most recent session's most-logged
 *                             exercise (the per-set fatigue curve).
 *           prs             — best (max-reps) set per exercise, with that set's reps.
 *           cardio_hr       — avg_hr per cardio session over time (HR trend).
 *
 * All queries are read-only and parameterized. Behind Cloudflare Access (single-user).
 */

import { getDb } from "@/lib/db";
import { ok } from "../_lib/http";

// better-sqlite3 requires the Node runtime (not Edge).
export const runtime = "nodejs";

/** How many recent weeks of stacked volume to surface. */
const VOLUME_WEEKS = 6;

// --- response shape ----------------------------------------------------------

/** Avg RIR for one ISO week (lower = closer to failure). */
export interface RirCompressionPoint {
  week: string;
  avg_rir: number;
  set_count: number;
}

/** Set counts for one ISO week, keyed by muscle group, for the stacked volume bars. */
export interface WeeklyVolumeWeek {
  week: string;
  /** muscle_group -> number of sets that week */
  groups: Record<string, number>;
  total: number;
}

/** Reps logged at one set position, for the fatigue/drop-off curve. */
export interface RepDropoffPoint {
  set_number: number;
  reps: number;
}

/** The most recent session's most-logged exercise + its per-set rep curve. */
export interface RepDropoff {
  session_id: number | null;
  exercise_id: number | null;
  exercise_name: string | null;
  points: RepDropoffPoint[];
}

/** A personal record: the best (max-reps) set ever logged for an exercise. */
export interface PrEntry {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  best_reps: number;
}

/** One cardio session's avg HR over time. */
export interface CardioHrPoint {
  logged_at: string;
  activity_type: string;
  avg_hr: number;
}

/** The full analytics payload returned by GET. */
export interface FitnessAnalytics {
  rir_compression: RirCompressionPoint[];
  weekly_volume: WeeklyVolumeWeek[];
  rep_dropoff: RepDropoff;
  prs: PrEntry[];
  cardio_hr: CardioHrPoint[];
}

// --- raw row shapes ----------------------------------------------------------

interface RirAggRow {
  week: string;
  avg_rir: number | null;
  set_count: number;
}

interface VolumeAggRow {
  week: string;
  muscle_group: string;
  set_count: number;
}

interface MostLoggedRow {
  session_id: number;
  exercise_id: number;
  exercise_name: string;
}

interface DropoffRow {
  set_number: number;
  reps: number;
}

interface PrRow {
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  best_reps: number;
}

interface CardioHrRow {
  logged_at: string;
  activity_type: string;
  avg_hr: number;
}

// --- handler -----------------------------------------------------------------

export function GET(): Response {
  const db = getDb();

  const analytics: FitnessAnalytics = {
    rir_compression: computeRirCompression(db),
    weekly_volume: computeWeeklyVolume(db),
    rep_dropoff: computeRepDropoff(db),
    prs: computePrs(db),
    cardio_hr: computeCardioHr(db),
  };

  return ok(analytics);
}

// --- computations ------------------------------------------------------------

type Db = ReturnType<typeof getDb>;

/** Avg RIR per ISO week across all logged sets that recorded an RIR. */
function computeRirCompression(db: Db): RirCompressionPoint[] {
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%W', logged_at) AS week,
              AVG(rir) AS avg_rir,
              COUNT(*) AS set_count
         FROM workout_sets
        WHERE rir IS NOT NULL
        GROUP BY week
        ORDER BY week ASC`,
    )
    .all() as RirAggRow[];

  return rows.map((r) => ({
    week: r.week,
    avg_rir: r.avg_rir === null ? 0 : Math.round(r.avg_rir * 100) / 100,
    set_count: r.set_count,
  }));
}

/** Set counts per muscle group per week, last `VOLUME_WEEKS` weeks (ascending). */
function computeWeeklyVolume(db: Db): WeeklyVolumeWeek[] {
  const rows = db
    .prepare(
      `SELECT strftime('%Y-%W', ws.logged_at) AS week,
              e.muscle_group AS muscle_group,
              COUNT(*) AS set_count
         FROM workout_sets ws
         JOIN exercises e ON e.id = ws.exercise_id
        GROUP BY week, e.muscle_group
        ORDER BY week ASC`,
    )
    .all() as VolumeAggRow[];

  // Bucket flat rows into one entry per week.
  const byWeek = new Map<string, WeeklyVolumeWeek>();
  for (const row of rows) {
    const existing = byWeek.get(row.week);
    if (existing) {
      existing.groups[row.muscle_group] = row.set_count;
      existing.total += row.set_count;
    } else {
      byWeek.set(row.week, {
        week: row.week,
        groups: { [row.muscle_group]: row.set_count },
        total: row.set_count,
      });
    }
  }

  // Keep only the most recent N weeks, ascending.
  const weeks = [...byWeek.values()].sort((a, b) => a.week.localeCompare(b.week));
  return weeks.slice(Math.max(0, weeks.length - VOLUME_WEEKS));
}

/** The most recent session's most-logged exercise and its reps-by-set-number curve. */
function computeRepDropoff(db: Db): RepDropoff {
  const empty: RepDropoff = {
    session_id: null,
    exercise_id: null,
    exercise_name: null,
    points: [],
  };

  // Most recent session that actually has logged sets.
  const latest = db
    .prepare(
      `SELECT session_id FROM workout_sets
        ORDER BY session_id DESC LIMIT 1`,
    )
    .get() as { session_id: number } | undefined;
  if (!latest) return empty;

  // Within that session, the exercise with the most logged sets.
  const mostLogged = db
    .prepare(
      `SELECT ws.session_id AS session_id,
              ws.exercise_id AS exercise_id,
              e.name AS exercise_name
         FROM workout_sets ws
         JOIN exercises e ON e.id = ws.exercise_id
        WHERE ws.session_id = ?
        GROUP BY ws.exercise_id
        ORDER BY COUNT(*) DESC, ws.exercise_id ASC
        LIMIT 1`,
    )
    .get(latest.session_id) as MostLoggedRow | undefined;
  if (!mostLogged) return empty;

  const points = db
    .prepare(
      `SELECT set_number, reps
         FROM workout_sets
        WHERE session_id = ? AND exercise_id = ?
        ORDER BY set_number ASC`,
    )
    .all(mostLogged.session_id, mostLogged.exercise_id) as DropoffRow[];

  return {
    session_id: mostLogged.session_id,
    exercise_id: mostLogged.exercise_id,
    exercise_name: mostLogged.exercise_name,
    points: points.map((p) => ({ set_number: p.set_number, reps: p.reps })),
  };
}

/** Best (max-reps) set per exercise — a simple rep PR board. */
function computePrs(db: Db): PrEntry[] {
  const rows = db
    .prepare(
      `SELECT e.id AS exercise_id,
              e.name AS exercise_name,
              e.muscle_group AS muscle_group,
              MAX(ws.reps) AS best_reps
         FROM workout_sets ws
         JOIN exercises e ON e.id = ws.exercise_id
        GROUP BY e.id
        ORDER BY best_reps DESC, e.name ASC`,
    )
    .all() as PrRow[];

  return rows.map((r) => ({
    exercise_id: r.exercise_id,
    exercise_name: r.exercise_name,
    muscle_group: r.muscle_group,
    best_reps: r.best_reps,
  }));
}

/** Avg HR per cardio session over time (ascending), excluding sessions without HR. */
function computeCardioHr(db: Db): CardioHrPoint[] {
  const rows = db
    .prepare(
      `SELECT logged_at, activity_type, avg_hr
         FROM cardio_sessions
        WHERE avg_hr IS NOT NULL
        ORDER BY logged_at ASC`,
    )
    .all() as CardioHrRow[];

  return rows.map((r) => ({
    logged_at: r.logged_at,
    activity_type: r.activity_type,
    avg_hr: r.avg_hr,
  }));
}
