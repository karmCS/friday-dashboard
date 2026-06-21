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

export interface OurFootage {
  visitors_7d: number;
  pageviews_7d: number;
  qr_scans_7d: number;
  submissions_7d: number;
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

export interface Infra {
  all_up: boolean;
  /** names of any services currently down (empty when all_up) */
  down: string[];
  last_deploy: InfraLastDeploy;
}

// --- Fitness (from the fitness-tracker snapshot sketch) ----------------------

export interface FitnessBodyweightLatest {
  /** ISO date of the latest bodyweight entry, or null */
  date: string | null;
  /** latest bodyweight value, or null */
  weight: number | null;
}

export interface FitnessLastLiftingSession {
  /** ISO date of the last lifting session, or null */
  date: string | null;
  /** muscle groups hit that session (empty when none) */
  muscle_groups: string[];
}

export interface FitnessLastCardioSession {
  /** ISO date of the last cardio session, or null */
  date: string | null;
  /** activity type (e.g. "run"), or null */
  activity: string | null;
  /** duration in minutes, or null */
  duration_min: number | null;
  /** average heart rate, or null */
  avg_hr: number | null;
}

export interface Fitness {
  /** ISO date this fitness slice was computed */
  as_of: string;
  bodyweight_latest: FitnessBodyweightLatest;
  /** 7-day average step count, or null */
  steps_7d_avg: number | null;
  lifting_sessions_7d: number;
  cardio_sessions_7d: number;
  last_lifting_session: FitnessLastLiftingSession;
  last_cardio_session: FitnessLastCardioSession;
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
  /** personal fitness slice (fitness-tracker.md) */
  fitness: Fitness;
}
