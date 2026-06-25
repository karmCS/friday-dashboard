/**
 * Questism grade system — pure compute + weekly streak persistence.
 *
 * Three domains earn dynamic letter grades (rendered as rarity stat-cards by
 * `GradeBadge`), plus a composite:
 *   - BODY    — weekly fitness, resets Sunday; S-week streaks raise a permanent floor
 *   - BUILDER — Deficit app progress, cumulative (MRR primary, users secondary, crash-free floor)
 *   - SYSTEM  — infra health, rolling 30d
 *   - TOTAL   — weighted composite of the three
 *
 * Spec: analytics-dashboard.md "Grade System — Questism Stat Cards". The grade thresholds and
 * the streak ladder live here; the VISUALS live in `GradeBadge.tsx`. Functions are pure (no
 * side effects) except {@link computeAndPersistBodyGrade}, which advances the streak row.
 *
 * BODY data sources follow the 2026-06-24 fitness pivot: lift/cardio counts are
 * `COUNT(DISTINCT date)` over `workout_calendar` (the user's explicit log), NOT the retired
 * set-logging tables or Strava. Steps come from `steps_log`. RIR + bodyweight-days are not scored.
 */

import type Database from "better-sqlite3";

import type { GradeId } from "@/components/dashboard/sections/shared/GradeBadge";
import type { BodyGrade, BuilderGrade, Grades, SystemGrade } from "@/lib/types";

// --- Numeric value per grade (for comparison + composite weighting) ----------
// From the spec's TOTAL POWER mapping. A Record<GradeId,…> forces every grade to be covered.

export const GRADE_VALUE: Record<GradeId, number> = {
  F: 0, E: 1, D: 2, C: 3, "C+": 3.5, B: 4, "B+": 4.5, A: 5, "A+": 5.5,
  "S-": 5.75, S: 6, "S+": 6.5, "SS-": 7, SS: 7.5, "SS+": 8,
  "SSS-": 8.5, SSS: 9, "SSS+": 9.5, SR: 10, "SR+": 10.5, SSR: 11, "SSR+": 11.5,
  UR: 12, "UR+": 12.5, LR: 13, "LR+": 13.5, MR: 14, "MR+": 14.5,
  X: 15, XX: 16, XXX: 17, EX: 18, DX: 19, Immeasurable: 20,
};

/** Grades ordered by ascending numeric value (used to invert a numeric back to a grade). */
const GRADES_BY_VALUE: GradeId[] = (Object.keys(GRADE_VALUE) as GradeId[]).sort(
  (a, b) => GRADE_VALUE[a] - GRADE_VALUE[b],
);

// --- Inputs ------------------------------------------------------------------

/** One ISO week of fitness, read from the workout calendar + steps log. */
export interface WeeklyFitnessData {
  /** distinct calendar days with a `lift` workout this week */
  lifts: number;
  /** distinct calendar days with a `cardio` workout this week */
  cardio: number;
  /** mean daily steps this week, or null when none logged */
  steps_avg: number | null;
}

/** A `grade_streaks` row (BODY). */
export interface StreakRow {
  stat: string;
  streak_weeks: number;
  /** ISO week label of the last S-week credited, e.g. "2026-W26" */
  last_s_week: string | null;
}

/** Deficit signals for the BUILDER grade. */
export interface BuilderData {
  mrr: number;
  users: number;
  /** crash-free sessions (percent), or null when not yet measurable */
  crash_free: number | null;
}

/** Infra signals for the SYSTEM grade. */
export interface SystemData {
  services_down: number;
  /** uptime over the rolling 30d (percent), or null when telemetry is unwired */
  uptime_30d: number | null;
  /** days since the last deploy, or null when unknown */
  days_since_deploy: number | null;
  /** open infra alerts, or null when unwired (treated as 0) */
  open_alerts: number | null;
}

// --- BODY (weekly, resets Sunday) --------------------------------------------

const STEPS_C_PLUS = 5000;
const STEPS_B = 7000;
const STEPS_A = 8000;
const STEPS_A_PLUS = 9000;
const STEPS_S = 10000;

/**
 * The weekly base grade (F → S), before any streak elevation. ≥3 lifts is the quota; a 4th
 * lift carries no extra weight. Higher tiers ladder on cardio + average steps.
 */
export function weeklyBaseGrade(d: WeeklyFitnessData): GradeId {
  const steps = d.steps_avg ?? 0;
  const lifts = d.lifts;
  const cardio = d.cardio;

  if (lifts >= 3 && cardio >= 2 && steps >= STEPS_S) return "S";
  if (lifts >= 3 && cardio >= 2 && steps >= STEPS_A_PLUS) return "A+";
  if (lifts >= 3 && cardio >= 2 && steps >= STEPS_A) return "A";
  if (lifts >= 3 && cardio >= 2 && steps >= STEPS_B) return "B+";
  if (lifts >= 3 && cardio >= 1 && steps >= STEPS_B) return "B";
  if (lifts >= 3 && steps >= STEPS_C_PLUS) return "C+";
  if (lifts >= 3) return "C";
  if (lifts === 2) return "D";
  if (lifts === 1) return "E";
  return "F";
}

/** Consecutive-S-week thresholds that push the permanent tier floor up (descending). */
const STREAK_LADDER: ReadonlyArray<{ weeks: number; grade: GradeId }> = [
  { weeks: 1300, grade: "X" }, // 25+ years — professional athlete tier
  { weeks: 1040, grade: "MR+" },
  { weeks: 728, grade: "MR" },
  { weeks: 520, grade: "LR+" },
  { weeks: 364, grade: "LR" },
  { weeks: 260, grade: "UR+" },
  { weeks: 208, grade: "UR" },
  { weeks: 156, grade: "SSR+" },
  { weeks: 104, grade: "SSR" },
  { weeks: 78, grade: "SR+" },
  { weeks: 52, grade: "SR" },
  { weeks: 39, grade: "SSS+" },
  { weeks: 26, grade: "SSS" },
  { weeks: 20, grade: "SSS-" },
  { weeks: 13, grade: "SS+" },
  { weeks: 8, grade: "SS" },
  { weeks: 4, grade: "SS-" },
];

/** Highest streak-tier earned for `weeks` consecutive S-weeks, or null below the first rung. */
function streakFloor(weeks: number): GradeId | null {
  for (const rung of STREAK_LADDER) {
    if (weeks >= rung.weeks) return rung.grade;
  }
  return null;
}

/**
 * The displayed BODY grade: this week's base, raised to the streak floor if the floor is
 * higher (a streak preserves earned rank even when a single week dips below S).
 */
export function computeBodyGrade(
  d: WeeklyFitnessData,
  streak: StreakRow | null,
): BodyGrade {
  const base = weeklyBaseGrade(d);
  const weeks = streak?.streak_weeks ?? 0;
  const floor = streakFloor(weeks);

  const grade = floor && GRADE_VALUE[floor] > GRADE_VALUE[base] ? floor : base;
  return { grade, streak_weeks: weeks, this_week_base: base };
}

// --- BUILDER (cumulative, never resets) --------------------------------------

/**
 * MRR (monthly USD) + user thresholds per grade, ascending. ARR rows in the spec are stored as
 * their monthly equivalent (ARR ÷ 12). The worst of the MRR-rank and user-rank gates the grade.
 * DX / Immeasurable have no numeric threshold (awarded manually) so the ladder tops out at EX.
 */
const BUILDER_LADDER: ReadonlyArray<{ grade: GradeId; mrr: number; users: number }> = [
  { grade: "F", mrr: 0, users: 0 },
  { grade: "E", mrr: 0, users: 1 },
  { grade: "D", mrr: 0, users: 3 },
  { grade: "C", mrr: 0, users: 10 },
  { grade: "C+", mrr: 1, users: 25 },
  { grade: "B", mrr: 10, users: 50 },
  { grade: "B+", mrr: 50, users: 100 },
  { grade: "A", mrr: 100, users: 250 },
  { grade: "A+", mrr: 250, users: 500 },
  { grade: "S-", mrr: 500, users: 1000 },
  { grade: "S", mrr: 1000, users: 2500 },
  { grade: "S+", mrr: 2500, users: 5000 },
  { grade: "SS-", mrr: 5000, users: 7500 },
  { grade: "SS", mrr: 10000, users: 10000 },
  { grade: "SS+", mrr: 15000, users: 15000 },
  { grade: "SSS-", mrr: 25000, users: 25000 },
  { grade: "SSS", mrr: 50000, users: 50000 },
  { grade: "SSS+", mrr: 75000, users: 75000 },
  { grade: "SR", mrr: 100000, users: 100000 },
  { grade: "SR+", mrr: 150000, users: 150000 },
  { grade: "SSR", mrr: 250000, users: 250000 },
  { grade: "SSR+", mrr: 500000, users: 500000 },
  { grade: "UR", mrr: 83333, users: 1000000 }, // $1M ARR
  { grade: "UR+", mrr: 208333, users: 2500000 }, // $2.5M ARR
  { grade: "LR", mrr: 416667, users: 5000000 }, // $5M ARR
  { grade: "LR+", mrr: 833333, users: 10000000 }, // $10M ARR
  { grade: "MR", mrr: 2083333, users: 25000000 }, // $25M ARR
  { grade: "MR+", mrr: 4166667, users: 50000000 }, // $50M ARR
  { grade: "X", mrr: 8333333, users: 100000000 }, // $100M ARR
  { grade: "XX", mrr: 41666667, users: 250000000 }, // $500M ARR
  { grade: "XXX", mrr: 83333333, users: 500000000 }, // $1B ARR
  { grade: "EX", mrr: 416666667, users: 1000000000 }, // $5B ARR
];

/** Highest grade in `BUILDER_LADDER` whose `key`-threshold is met by `value`. */
function ladderGrade(value: number, key: "mrr" | "users"): GradeId {
  let grade: GradeId = "F";
  for (const rung of BUILDER_LADDER) {
    if (value >= rung[key]) grade = rung.grade;
  }
  return grade;
}

/**
 * BUILDER grade. The worse of the MRR-rank and user-rank gates the grade, then a crash-free
 * quality floor caps it: ≥95% required from B+ up, ≥99% from S+ up. A null crash-free rate
 * (pre-launch, no data) does not penalize — the cap only applies to a known, failing rate.
 */
export function computeBuilderGrade(d: BuilderData): BuilderGrade {
  const byMrr = ladderGrade(d.mrr, "mrr");
  const byUsers = ladderGrade(d.users, "users");
  let grade = GRADE_VALUE[byMrr] <= GRADE_VALUE[byUsers] ? byMrr : byUsers;

  if (d.crash_free !== null) {
    if (d.crash_free < 95 && GRADE_VALUE[grade] > GRADE_VALUE["B"]) grade = "B";
    else if (d.crash_free < 99 && GRADE_VALUE[grade] > GRADE_VALUE["S"]) grade = "S";
  }

  return { grade, mrr: d.mrr, users: d.users, crash_free: d.crash_free };
}

// --- SYSTEM (rolling 30d) ----------------------------------------------------

/**
 * SYSTEM grade. Services-down dominate (F/E/D). Once everything is up, uptime + deploy recency
 * + alerts ladder C → S. Missing telemetry is treated optimistically (unknown uptime = healthy,
 * unknown alerts = 0) so absent monitoring doesn't punish the grade; an all-up system with no
 * deploy signal settles at B. "A is the target — a high grade should be boring to maintain."
 */
export function computeSystemGrade(d: SystemData): SystemGrade {
  const down = d.services_down;
  if (down >= 3) return sys("F", d);
  if (down === 2) return sys("E", d);
  if (down === 1) return sys("D", d);

  const uptime = d.uptime_30d ?? 100; // optimistic when Beszel is unwired
  const alerts = d.open_alerts ?? 0;
  const dd = d.days_since_deploy;

  if (uptime < 95) return sys("C", d);
  if (uptime >= 99.5 && dd !== null && dd < 7 && alerts === 0) return sys("S", d);
  if (uptime >= 99 && dd !== null && dd < 14 && alerts === 0) return sys("A", d);
  if (uptime >= 95 && uptime < 99 && dd !== null && dd > 30) return sys("B", d);
  // All up but doesn't hit a recent-deploy / high-uptime tier (or deploy signal unknown).
  return sys("B", d);
}

function sys(grade: GradeId, d: SystemData): SystemGrade {
  return { grade, uptime_30d: d.uptime_30d, services_down: d.services_down };
}

// --- TOTAL POWER (composite) -------------------------------------------------

const W_BODY = 0.35;
const W_BUILDER = 0.45;
const W_SYSTEM = 0.2;

/** Weighted composite, mapped to the nearest grade (ties resolve to the lower grade). */
export function computeTotalPower(body: GradeId, builder: GradeId, system: GradeId): GradeId {
  const total =
    GRADE_VALUE[body] * W_BODY +
    GRADE_VALUE[builder] * W_BUILDER +
    GRADE_VALUE[system] * W_SYSTEM;

  let best: GradeId = GRADES_BY_VALUE[0];
  let bestDist = Infinity;
  for (const g of GRADES_BY_VALUE) {
    const dist = Math.abs(GRADE_VALUE[g] - total);
    if (dist < bestDist) {
      best = g;
      bestDist = dist;
    }
  }
  return best;
}

// --- ISO week helpers --------------------------------------------------------

/** Monday (UTC) of the ISO week containing `d`, as `YYYY-MM-DD`. */
export function isoWeekStart(d: Date): string {
  const dayFromMonday = (d.getUTCDay() + 6) % 7; // 0 = Monday
  const monday = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dayFromMonday),
  );
  return monday.toISOString().slice(0, 10);
}

/** ISO week label `YYYY-Www` (e.g. "2026-W26") for `d`. */
export function isoWeekLabel(d: Date): string {
  // Shift to the Thursday of this week, then count weeks from Jan 1 (standard ISO-8601 trick).
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week = 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 86400000));
  return `${target.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

// --- SQLite reads ------------------------------------------------------------

interface CountRow {
  n: number;
}
interface AvgRow {
  avg: number | null;
}

/** Read one ISO week of fitness (lift/cardio days + step avg) from `weekStart` to now. */
export function readBodyWeekly(db: Database.Database, weekStart: string): WeeklyFitnessData {
  const lifts = db
    .prepare(
      `SELECT COUNT(DISTINCT date) AS n FROM workout_calendar WHERE type = 'lift' AND date >= ?`,
    )
    .get(weekStart) as CountRow;
  const cardio = db
    .prepare(
      `SELECT COUNT(DISTINCT date) AS n FROM workout_calendar WHERE type = 'cardio' AND date >= ?`,
    )
    .get(weekStart) as CountRow;
  const steps = db
    .prepare(`SELECT AVG(count) AS avg FROM steps_log WHERE date >= ?`)
    .get(weekStart) as AvgRow | undefined;

  return {
    lifts: lifts.n,
    cardio: cardio.n,
    steps_avg: steps && steps.avg !== null ? Math.round(steps.avg) : null,
  };
}

function readStreak(db: Database.Database): StreakRow | null {
  const row = db
    .prepare(`SELECT stat, streak_weeks, last_s_week FROM grade_streaks WHERE stat = 'body'`)
    .get() as StreakRow | undefined;
  return row ?? null;
}

/** BODY grade for the live snapshot: current week-to-date + the persisted streak. */
export function readBodyGrade(db: Database.Database): BodyGrade {
  const weekStart = isoWeekStart(new Date());
  return computeBodyGrade(readBodyWeekly(db, weekStart), readStreak(db));
}

/**
 * The weekly tick (Sunday 23:59 / Monday 00:01 cron, or a manual /api/grades/tick). Computes
 * this week's base; if it's S and not already credited this ISO week, advances the streak; a
 * sub-S week pauses (never resets) the streak. Idempotent within a week via `last_s_week`.
 */
export function computeAndPersistBodyGrade(db: Database.Database, now: Date = new Date()): BodyGrade {
  const weekStart = isoWeekStart(now);
  const data = readBodyWeekly(db, weekStart);
  const base = weeklyBaseGrade(data);

  const prev = readStreak(db);
  let weeks = prev?.streak_weeks ?? 0;
  let lastSWeek = prev?.last_s_week ?? null;
  const wkLabel = isoWeekLabel(now);

  if (base === "S" && lastSWeek !== wkLabel) {
    weeks += 1;
    lastSWeek = wkLabel;
  }

  db.prepare(
    `INSERT INTO grade_streaks (stat, streak_weeks, last_s_week, updated_at)
     VALUES ('body', ?, ?, datetime('now'))
     ON CONFLICT(stat) DO UPDATE SET
       streak_weeks = excluded.streak_weeks,
       last_s_week  = excluded.last_s_week,
       updated_at   = excluded.updated_at`,
  ).run(weeks, lastSWeek);

  return computeBodyGrade(data, { stat: "body", streak_weeks: weeks, last_s_week: lastSWeek });
}

// --- Snapshot assembly -------------------------------------------------------

/** Compose the full {@link Grades} slice from the local streak DB + already-fetched signals. */
export function buildGrades(
  db: Database.Database,
  builder: BuilderData,
  system: SystemData,
): Grades {
  const body = readBodyGrade(db);
  const builderGrade = computeBuilderGrade(builder);
  const systemGrade = computeSystemGrade(system);
  const total = computeTotalPower(body.grade, builderGrade.grade, systemGrade.grade);
  return { body, builder: builderGrade, system: systemGrade, total };
}
