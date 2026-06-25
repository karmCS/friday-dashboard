/**
 * Snapshot assembly — shared by the public `GET /api/snapshot` route (bearer-gated, for
 * headless Claude Code) and the dashboard's own server render (already behind Cloudflare
 * Access, so it calls {@link buildSnapshot} directly instead of self-fetching with a token).
 *
 * The output is the STABLE {@link Snapshot} contract (`src/lib/types.ts`); field names must
 * not drift between sessions. NON-PII AGGREGATES ONLY — athlete names / emails / journal
 * free-text never enter this schema (they stay in Supabase, read live by the Inspector).
 *
 * Resilience: every source is fetched concurrently under `Promise.allSettled`; a rejection
 * resolves to its safe default so one broken source degrades a single slice, never the whole
 * snapshot.
 */

import { getDb } from "@/lib/db";
import { buildGrades } from "@/lib/grades";

import { umamiClient, UMAMI_WEBSITE_IDS } from "@/lib/clients/umami";
import { kumaClient } from "@/lib/clients/kuma";
import { beszelClient } from "@/lib/clients/beszel";
import { supabaseClient } from "@/lib/clients/supabase";
import { posthogClient } from "@/lib/clients/posthog";
import { sentryClient } from "@/lib/clients/sentry";

import type {
  Cafes,
  DeficitApp,
  DeficitLanding,
  Fitness,
  OurFootage,
  Portfolio,
  Snapshot,
  Social,
  Tacos,
} from "@/lib/types";
import type {
  CrashStats,
  DeficitAppStats,
  FunnelStats,
  HostMetrics,
  InfraStatus,
  SiteStats,
} from "@/lib/clients/types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// --- Safe defaults (used when a source's promise rejects) --------------------
// Each client already fails soft internally; these are the second line of defence so an
// unexpected throw still yields a well-formed slice rather than a 500.

const EMPTY_SITE: SiteStats = {
  visitors_7d: 0,
  pageviews_7d: 0,
  bounce_rate: null,
  top_source: null,
  top_page: null,
  top_referrer: null,
};

const EMPTY_DEFICIT_STATS: DeficitAppStats = {
  users: { total: 0, signups_7d: 0, dau: 0, wau: 0 },
  engagement: {
    food_logged_7d: 0,
    weight_logged_7d: 0,
    coach_msgs_7d: 0,
    made_weight_rate: null,
    top_feature: null,
  },
  revenue: {
    mrr_usd: 0,
    active_subs: 0,
    active_trials: 0,
    trial_to_paid: null,
    churn: null,
  },
};

const EMPTY_FUNNEL: FunnelStats = {
  onboarding_7d: 0,
  paywall_7d: 0,
  subscribed_7d: 0,
  conversion_rate: null,
};

const EMPTY_HEALTH: CrashStats = { crash_free_rate: null, open_issues: 0 };

const EMPTY_HOST: HostMetrics = { cpu_pct: null, mem_pct: null, disk_pct: null };

const EMPTY_INFRA: InfraStatus = {
  all_up: true,
  down: [],
  last_deploy: { project: null, status: null, ago_hours: null },
};

const EMPTY_TACOS: Tacos = { total: 0, avg_rating: null, last_spot: null, cities: 0 };
const EMPTY_CAFES: Cafes = { total: 0, avg_rating: null, last_spot: null, cities: 0 };

const EMPTY_FITNESS = (asOf: string): Fitness => ({
  as_of: asOf,
  bodyweight_latest: { date: null, weight: null },
  steps_7d_avg: null,
  lifting_sessions_7d: 0,
  cardio_sessions_7d: 0,
  last_workout: { date: null, label: null, type: null },
});

/**
 * Social slice. No social source is wired yet (Instagram Graph API is a later phase, Meta /
 * TikTok ads later still), so this is the spec placeholder: Instagram zeros, the rest null.
 */
const SOCIAL_PLACEHOLDER: Social = {
  instagram: { followers: 0, reach_7d: 0, profile_visits_7d: 0 },
  tiktok: null,
  meta_ads: null,
  tiktok_ads: null,
};

/** Unwrap an allSettled result, substituting `fallback` for a rejection. */
function settled<T>(result: PromiseSettledResult<T>, fallback: T): T {
  return result.status === "fulfilled" ? result.value : fallback;
}

// --- Local fitness slice (SQLite) --------------------------------------------

interface BodyweightRow {
  date: string;
  weight: number;
}
interface LastWorkoutRow {
  date: string;
  label: string;
  type: string;
}
interface CountRow {
  n: number;
}
interface AvgRow {
  avg: number | null;
}

function readFitness(asOf: string): Fitness {
  const db = getDb();
  const sinceIso = new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
  const sinceDate = sinceIso.slice(0, 10);
  // cardio_sessions.logged_at is SQLite datetime ("YYYY-MM-DD HH:MM:SS"), not JS ISO. Compare in
  // the same format or a boundary-day row (space < 'T' lexicographically) is wrongly excluded.
  const sinceSqlite = sinceIso.replace("T", " ").slice(0, 19);

  const bodyweight = db
    .prepare(`SELECT date, weight FROM bodyweight_log ORDER BY date DESC LIMIT 1`)
    .get() as BodyweightRow | undefined;

  const stepsAvg = db
    .prepare(`SELECT AVG(count) AS avg FROM steps_log WHERE date >= ?`)
    .get(sinceDate) as AvgRow | undefined;

  // Lifting workouts logged on the calendar in the last 7 days.
  const liftCount = db
    .prepare(`SELECT COUNT(*) AS n FROM workout_calendar WHERE type = 'lift' AND date >= ?`)
    .get(sinceDate) as CountRow;

  // Cardio sessions (Strava-synced) in the last 7 days.
  const cardioCount = db
    .prepare(`SELECT COUNT(*) AS n FROM cardio_sessions WHERE logged_at >= ?`)
    .get(sinceSqlite) as CountRow;

  // Most recent workout-calendar entry (newest date, then newest insert).
  const lastWorkout = db
    .prepare(
      `SELECT date, label, type FROM workout_calendar ORDER BY date DESC, id DESC LIMIT 1`,
    )
    .get() as LastWorkoutRow | undefined;

  const stepsAvgValue =
    stepsAvg && stepsAvg.avg !== null ? Math.round(stepsAvg.avg) : null;

  return {
    as_of: asOf,
    bodyweight_latest: {
      date: bodyweight?.date ?? null,
      weight: bodyweight?.weight ?? null,
    },
    steps_7d_avg: stepsAvgValue,
    lifting_sessions_7d: liftCount.n,
    cardio_sessions_7d: cardioCount.n,
    last_workout: {
      date: lastWorkout?.date ?? null,
      label: lastWorkout?.label ?? null,
      type: lastWorkout?.type ?? null,
    },
  };
}

// --- Local taco summary (SQLite) ---------------------------------------------
// Non-PII roll-up for the Overview card + headless CC. Full rows live behind /api/tacos.

interface TacoSummaryRow {
  total: number;
  avg: number | null;
  cities: number;
}
interface LastSpotRow {
  place: string;
}

function readTacos(): Tacos {
  const db = getDb();

  const agg = db
    .prepare(
      `SELECT COUNT(*) AS total, AVG(rating) AS avg, COUNT(DISTINCT city) AS cities FROM tacos`,
    )
    .get() as TacoSummaryRow;

  const last = db
    .prepare(`SELECT place FROM tacos ORDER BY visited_at DESC, id DESC LIMIT 1`)
    .get() as LastSpotRow | undefined;

  return {
    total: agg.total,
    avg_rating: agg.avg !== null ? Math.round(agg.avg * 10) / 10 : null,
    last_spot: last?.place ?? null,
    cities: agg.cities,
  };
}

// --- Local cafe summary (SQLite) ---------------------------------------------
// Non-PII roll-up for the Overview card + headless CC. Mirrors readTacos exactly; full rows
// live behind /api/cafes.

interface CafeSummaryRow {
  total: number;
  avg: number | null;
  cities: number;
}
interface CafeLastSpotRow {
  place: string;
}

function readCafes(): Cafes {
  const db = getDb();

  const agg = db
    .prepare(
      `SELECT COUNT(*) AS total, AVG(rating) AS avg, COUNT(DISTINCT city) AS cities FROM cafes`,
    )
    .get() as CafeSummaryRow;

  const last = db
    .prepare(`SELECT place FROM cafes ORDER BY visited_at DESC, id DESC LIMIT 1`)
    .get() as CafeLastSpotRow | undefined;

  return {
    total: agg.total,
    avg_rating: agg.avg !== null ? Math.round(agg.avg * 10) / 10 : null,
    last_spot: last?.place ?? null,
    cities: agg.cities,
  };
}

// --- Assemblers --------------------------------------------------------------

/** Map a generic Umami {@link SiteStats} onto the landing sub-object (ad spend not yet wired). */
function toLanding(site: SiteStats): DeficitLanding {
  return {
    visitors_7d: site.visitors_7d,
    pageviews_7d: site.pageviews_7d,
    bounce_rate: site.bounce_rate,
    top_source: site.top_source,
    // Meta/TikTok ad spend is a later phase; 0 until an ads client exists.
    ad_spend_7d: 0,
  };
}

/** Map Umami stats onto Our Footage (visitors only; up/down comes from the Kuma infra slice). */
function toOurFootage(site: SiteStats): OurFootage {
  return {
    visitors_7d: site.visitors_7d,
    pageviews_7d: site.pageviews_7d,
  };
}

/** Map Umami stats onto the portfolio sub-object. */
function toPortfolio(site: SiteStats): Portfolio {
  return {
    visitors_7d: site.visitors_7d,
    pageviews_7d: site.pageviews_7d,
    top_page: site.top_page,
    top_referrer: site.top_referrer,
  };
}

/** Compose the full Deficit app slice from Supabase (users/engagement/revenue) + PostHog + Sentry. */
function toDeficitApp(
  stats: DeficitAppStats,
  funnel: FunnelStats,
  health: CrashStats,
): DeficitApp {
  return {
    users: stats.users,
    funnel,
    revenue: stats.revenue,
    engagement: stats.engagement,
    health,
  };
}

/**
 * Build the full {@link Snapshot}. Always resolves to a well-formed object — `allSettled`
 * guarantees every slice is present even if a source throws.
 */
export async function buildSnapshot(): Promise<Snapshot> {
  const asOf = new Date().toISOString();

  // Fan out to every source concurrently. Each entry is independent; a rejection becomes a
  // safe default below so one failing source can't fail the whole snapshot.
  const [
    landingSite,
    ourFootageSite,
    portfolioSite,
    deficitStats,
    funnel,
    health,
    infra,
    host,
    fitness,
    tacos,
    cafes,
  ] = await Promise.allSettled([
    umamiClient.getSiteStats(UMAMI_WEBSITE_IDS.deficitLanding),
    umamiClient.getSiteStats(UMAMI_WEBSITE_IDS.ourFootage),
    umamiClient.getSiteStats(UMAMI_WEBSITE_IDS.portfolio),
    supabaseClient.getDeficitAppStats(),
    posthogClient.getFunnelStats(),
    sentryClient.getCrashStats(),
    kumaClient.getInfraStatus(),
    beszelClient.getHostMetrics(),
    Promise.resolve().then(() => readFitness(asOf)),
    Promise.resolve().then(() => readTacos()),
    Promise.resolve().then(() => readCafes()),
  ]);

  // Merge the Kuma infra status with Beszel host metrics into the full Infra slice.
  const infraStatus = settled<InfraStatus>(infra, EMPTY_INFRA);
  const hostMetrics = settled<HostMetrics>(host, EMPTY_HOST);

  // Resolve the Deficit slices once so the grade computation reuses the same numbers the
  // snapshot reports (no second fetch, no drift).
  const deficitStatsR = settled<DeficitAppStats>(deficitStats, EMPTY_DEFICIT_STATS);
  const healthR = settled<CrashStats>(health, EMPTY_HEALTH);

  // Questism grades. BODY reads the local streak DB + workout calendar; BUILDER/SYSTEM are
  // computed from the already-fetched signals. uptime_30d / open_alerts stay null until the
  // Beszel uptime + alert sources are wired (grades.ts treats unknown telemetry optimistically).
  const grades = buildGrades(
    getDb(),
    {
      mrr: deficitStatsR.revenue.mrr_usd,
      users: deficitStatsR.users.total,
      crash_free: healthR.crash_free_rate,
    },
    {
      services_down: infraStatus.down.length,
      uptime_30d: null,
      days_since_deploy:
        infraStatus.last_deploy.ago_hours === null
          ? null
          : infraStatus.last_deploy.ago_hours / 24,
      open_alerts: null,
    },
  );

  return {
    as_of: asOf,
    deficit_app: toDeficitApp(
      deficitStatsR,
      settled<FunnelStats>(funnel, EMPTY_FUNNEL),
      healthR,
    ),
    deficit_landing: toLanding(settled<SiteStats>(landingSite, EMPTY_SITE)),
    our_footage: toOurFootage(settled<SiteStats>(ourFootageSite, EMPTY_SITE)),
    portfolio: toPortfolio(settled<SiteStats>(portfolioSite, EMPTY_SITE)),
    social: SOCIAL_PLACEHOLDER,
    infra: { ...infraStatus, host: hostMetrics },
    fitness: settled<Fitness>(fitness, EMPTY_FITNESS(asOf)),
    tacos: settled<Tacos>(tacos, EMPTY_TACOS),
    cafes: settled<Cafes>(cafes, EMPTY_CAFES),
    grades,
  };
}
