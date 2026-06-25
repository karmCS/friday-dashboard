/**
 * Friday Dashboard — snapshot schema.
 *
 * This is the STABLE contract for `GET /api/snapshot`: a single non-PII JSON object
 * aggregating every data source. The field names must not drift between sessions — Claude
 * Code relies on them. The shape mirrors the wiki `/api/snapshot` sketch exactly
 * (analytics-dashboard.md), plus a `fitness` key from the fitness-tracker snapshot sketch.
 *
 * Fields are nullable exactly where the wiki sketches show `null` (a metric not yet
 * computable / no data yet). Numbers default to 0 in those sketches and stay non-null.
 *
 * NOTE: this object carries NON-PII AGGREGATES ONLY. Athlete PII (names, emails, journal
 * free-text) never enters this schema — it stays in Supabase and is read live.
 */

import type { GradeId } from "@/components/dashboard/sections/shared/GradeBadge";

// --- Deficit (app) -----------------------------------------------------------

export interface DeficitUsers {
  total: number;
  signups_7d: number;
  dau: number;
  wau: number;
}

export interface DeficitFunnel {
  onboarding_7d: number;
  paywall_7d: number;
  subscribed_7d: number;
  /** percent, or null when not yet computable */
  conversion_rate: number | null;
}

export interface DeficitRevenue {
  mrr_usd: number;
  active_subs: number;
  active_trials: number;
  /** trial→paid rate (percent), or null */
  trial_to_paid: number | null;
  /** churn rate (percent), or null */
  churn: number | null;
}

export interface DeficitEngagement {
  food_logged_7d: number;
  weight_logged_7d: number;
  coach_msgs_7d: number;
  /** percent of athletes who made weight, or null */
  made_weight_rate: number | null;
  /** name of the most-used feature, or null */
  top_feature: string | null;
}

export interface DeficitHealth {
  /** crash-free sessions (percent), or null */
  crash_free_rate: number | null;
  open_issues: number;
}

export interface DeficitApp {
  users: DeficitUsers;
  funnel: DeficitFunnel;
  revenue: DeficitRevenue;
  engagement: DeficitEngagement;
  health: DeficitHealth;
}

// --- Web properties ----------------------------------------------------------

export interface DeficitLanding {
  visitors_7d: number;
  pageviews_7d: number;
  /** bounce rate (percent), or null */
  bounce_rate: number | null;
  /** top traffic source, or null */
  top_source: string | null;
  ad_spend_7d: number;
}

/**
 * Our Footage (our-footage.com). Deliberately minimal (decided 2026-06-21): Mark only wants
 * "is it up, and how many visitors" — up/down comes from the {@link Infra} Kuma monitor, this
 * slice carries the Umami visitor counts. (Earlier QR-scan / submission fields were dropped:
 * not a real data source for this property.)
 */
export interface OurFootage {
  visitors_7d: number;
  pageviews_7d: number;
}

export interface Portfolio {
  visitors_7d: number;
  pageviews_7d: number;
  /** most-visited page path, or null */
  top_page: string | null;
  /** top referrer, or null */
  top_referrer: string | null;
}

// --- Social ------------------------------------------------------------------

export interface InstagramSocial {
  followers: number;
  reach_7d: number;
  profile_visits_7d: number;
}

export interface Social {
  instagram: InstagramSocial;
  /** not yet wired — null until TikTok organic is added */
  tiktok: null;
  /** not yet wired — null until Meta Ads is connected */
  meta_ads: null;
  /** not yet wired — null until TikTok Ads is connected */
  tiktok_ads: null;
}

// --- Infra -------------------------------------------------------------------

export interface InfraLastDeploy {
  /** project name of the last deploy, or null */
  project: string | null;
  /** deploy status, or null */
  status: string | null;
  /** hours since the last deploy, or null */
  ago_hours: number | null;
}

/** Host resource utilisation from Beszel (percent 0–100, null when unavailable). */
export interface InfraHost {
  cpu_pct: number | null;
  mem_pct: number | null;
  disk_pct: number | null;
}

export interface Infra {
  all_up: boolean;
  /** names of any services currently down (empty when all_up) */
  down: string[];
  /** host CPU/RAM/disk utilisation (Beszel). Folded in here so the snapshot is self-contained. */
  host: InfraHost;
  last_deploy: InfraLastDeploy;
}

// --- Fitness (calendar-based model) ------------------------------------------
// As of the 2026-06-24 pivot the fitness section is a weekly workout CALENDAR of general
// labels (not per-set logging), plus steps (iOS Shortcut), cardio (Strava), and bodyweight.
// The snapshot slice carries the non-PII roll-up.

export interface FitnessBodyweightLatest {
  /** ISO date of the latest bodyweight entry, or null */
  date: string | null;
  /** latest bodyweight value, or null */
  weight: number | null;
}

/** The most recent workout-calendar entry (general label + coarse type). */
export interface FitnessLastWorkout {
  /** ISO date of the last logged workout, or null */
  date: string | null;
  /** the general label, e.g. "Upper Body", or null */
  label: string | null;
  /** 'lift' | 'cardio' | 'rest', or null */
  type: string | null;
}

export interface Fitness {
  /** ISO date this fitness slice was computed */
  as_of: string;
  bodyweight_latest: FitnessBodyweightLatest;
  /** 7-day average step count, or null */
  steps_7d_avg: number | null;
  /** lifting workouts on the calendar in the last 7 days */
  lifting_sessions_7d: number;
  /** cardio sessions (Strava) in the last 7 days */
  cardio_sessions_7d: number;
  last_workout: FitnessLastWorkout;
}

// --- Tacos (Taco Tracker summary) --------------------------------------------

/**
 * Non-PII taco-log summary for the Overview card and headless CC. Full rows (with notes/photos)
 * are read from `/api/tacos`; this is the at-a-glance roll-up.
 */
export interface Tacos {
  total: number;
  /** mean rating across all logged tacos (0–10), or null when none logged */
  avg_rating: number | null;
  /** name of the most recently visited spot, or null */
  last_spot: string | null;
  /** distinct cities logged */
  cities: number;
}

// --- Cafes (Cafe Tracker summary) --------------------------------------------

/**
 * Non-PII cafe-log summary for the Overview card and headless CC. Same shape as {@link Tacos};
 * full rows (with notes/photos) are read from `/api/cafes`.
 */
export interface Cafes {
  total: number;
  /** mean rating across all logged cafes (0–10), or null when none logged */
  avg_rating: number | null;
  /** name of the most recently visited spot, or null */
  last_spot: string | null;
  /** distinct cities logged */
  cities: number;
}

// --- Grades (Questism stat cards) --------------------------------------------
// Dynamic letter grades across three domains + a composite. Grade ids are the GradeBadge
// union (the single source of truth for which grades render). See lib/grades.ts for the
// thresholds + streak ladder, GradeBadge.tsx for the visuals.

/** BODY — weekly fitness; `streak_weeks` of consecutive S-weeks raise the permanent floor. */
export interface BodyGrade {
  grade: GradeId;
  streak_weeks: number;
  /** this week's base grade before streak elevation */
  this_week_base: GradeId;
}

/** BUILDER — cumulative Deficit progress (MRR-primary, users-secondary, crash-free floor). */
export interface BuilderGrade {
  grade: GradeId;
  mrr: number;
  users: number;
  /** crash-free rate (percent) the grade was gated on, or null when not measurable */
  crash_free: number | null;
}

/** SYSTEM — rolling-30d infra health. */
export interface SystemGrade {
  grade: GradeId;
  /** uptime over 30d (percent), or null when telemetry is unwired */
  uptime_30d: number | null;
  services_down: number;
}

export interface Grades {
  body: BodyGrade;
  builder: BuilderGrade;
  system: SystemGrade;
  /** composite of the three (weighted), as a single grade */
  total: GradeId;
}

// --- Top-level snapshot ------------------------------------------------------

export interface Snapshot {
  /** ISO 8601 timestamp the snapshot was generated */
  as_of: string;
  deficit_app: DeficitApp;
  deficit_landing: DeficitLanding;
  our_footage: OurFootage;
  portfolio: Portfolio;
  social: Social;
  infra: Infra;
  /** personal fitness slice (calendar + steps + cardio + bodyweight) */
  fitness: Fitness;
  /** personal taco-log summary (Taco Tracker) */
  tacos: Tacos;
  /** personal cafe-log summary (Cafe Tracker) */
  cafes: Cafes;
  /** Questism letter grades: BODY (fitness) · BUILDER (Deficit) · SYSTEM (infra) · TOTAL */
  grades: Grades;
}
