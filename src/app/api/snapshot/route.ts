/**
 * GET /api/snapshot — the single non-PII aggregate that powers the dashboard and feeds
 * headless Claude Code (analytics-dashboard.md "the CC-readable layer"). One call returns
 * current state across every property in the STABLE schema defined by {@link Snapshot}
 * (`src/lib/types.ts`); field names must not drift between sessions.
 *
 * Gating: bearer token via {@link requireBearer}(request, "SNAPSHOT_TOKEN"). The dashboard UI
 * sits behind Cloudflare Access (locked to Mark), but this route is exempt from Access so CC
 * can fetch it headlessly over WireGuard — hence the separate service token. Fails CLOSED:
 * `requireBearer` returns 401 if SNAPSHOT_TOKEN is unset, missing, malformed, or wrong.
 *
 * Resilience: every data source is fetched concurrently under `Promise.allSettled`. A source
 * that rejects (or whose client itself already failed soft) resolves to its safe default, so
 * one broken source degrades a single slice instead of crashing the whole snapshot.
 *
 * Privacy: NON-PII AGGREGATES ONLY — counts and rates. Athlete names / emails / journal
 * free-text never enter this schema; that PII stays in Supabase and is read live by the
 * Athlete Inspector, never here.
 *
 * Caching: `revalidate = 300` (~5 min) matches the wiki spec's "cache ~5 min"; the daily
 * markdown-snapshot cron and CC reads tolerate up-to-5-minute staleness.
 */

import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth";
import { getDb } from "@/lib/db";

import { umamiClient, UMAMI_WEBSITE_IDS } from "@/lib/clients/umami";
import { kumaClient } from "@/lib/clients/kuma";
import { beszelClient } from "@/lib/clients/beszel";
import { supabaseClient } from "@/lib/clients/supabase";
import { posthogClient } from "@/lib/clients/posthog";
import { sentryClient } from "@/lib/clients/sentry";

import type {
  DeficitApp,
  DeficitLanding,
  Fitness,
  Infra,
  OurFootage,
  Portfolio,
  Snapshot,
  Social,
} from "@/lib/types";
import type {
  CrashStats,
  DeficitAppStats,
  FunnelStats,
  HostMetrics,
  InfraStatus,
  SiteStats,
} from "@/lib/clients/types";

/** Re-aggregate ~every 5 minutes (wiki spec: "cache ~5 min"). */
export const revalidate = 300;

/** This route reads `process.env` secrets and SQLite — it must run on the Node runtime. */
export const runtime = "nodejs";

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

const EMPTY_INFRA: InfraStatus = {
  all_up: true,
  down: [],
  last_deploy: { project: null, status: null, ago_hours: null },
};

const EMPTY_HOST: HostMetrics = { cpu_pct: null, mem_pct: null, disk_pct: null };

const EMPTY_FITNESS = (asOf: string): Fitness => ({
  as_of: asOf,
  bodyweight_latest: { date: null, weight: null },
  steps_7d_avg: null,
  lifting_sessions_7d: 0,
  cardio_sessions_7d: 0,
  last_lifting_session: { date: null, muscle_groups: [] },
  last_cardio_session: { date: null, activity: null, duration_min: null, avg_hr: null },
});

/**
 * Social slice. No social source is wired yet (Instagram Graph API is a later phase, Meta /
 * TikTok ads later still), so this is the spec placeholder: Instagram zeros, the rest null.
 * Shaped exactly as the wiki `/api/snapshot` sketch + {@link Social}.
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
// The fitness data is local-only (no external client in src/lib/clients/), so the snapshot
// reads it directly from the shared SQLite store. NON-PII: aggregate counts + latest values
// only. Synchronous better-sqlite3 reads wrapped in a Promise so they join the allSettled set
// and a DB error degrades just this slice.

interface BodyweightRow {
  date: string;
  weight: number;
}
interface LastLiftingRow {
  date: string;
}
interface MuscleGroupRow {
  muscle_group: string;
}
interface LastCardioRow {
  date: string;
  activity_type: string;
  duration_min: number;
  avg_hr: number | null;
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

  const bodyweight = db
    .prepare(`SELECT date, weight FROM bodyweight_log ORDER BY date DESC LIMIT 1`)
    .get() as BodyweightRow | undefined;

  const stepsAvg = db
    .prepare(`SELECT AVG(count) AS avg FROM steps_log WHERE date >= ?`)
    .get(sinceIso.slice(0, 10)) as AvgRow | undefined;

  const liftCount = db
    .prepare(`SELECT COUNT(*) AS n FROM workout_sessions WHERE started_at >= ?`)
    .get(sinceIso) as CountRow;

  const cardioCount = db
    .prepare(`SELECT COUNT(*) AS n FROM cardio_sessions WHERE logged_at >= ?`)
    .get(sinceIso) as CountRow;

  const lastLift = db
    .prepare(
      `SELECT date(started_at) AS date FROM workout_sessions ORDER BY started_at DESC LIMIT 1`,
    )
    .get() as LastLiftingRow | undefined;

  // Distinct muscle groups hit in the most recent lifting session.
  let muscleGroups: string[] = [];
  if (lastLift) {
    const lastSessionId = db
      .prepare(`SELECT id FROM workout_sessions ORDER BY started_at DESC LIMIT 1`)
      .get() as { id: number } | undefined;
    if (lastSessionId) {
      const rows = db
        .prepare(
          `SELECT DISTINCT e.muscle_group AS muscle_group
             FROM workout_sets s
             JOIN exercises e ON e.id = s.exercise_id
            WHERE s.session_id = ?`,
        )
        .all(lastSessionId.id) as MuscleGroupRow[];
      muscleGroups = rows.map((r) => r.muscle_group).filter(Boolean);
    }
  }

  const lastCardio = db
    .prepare(
      `SELECT date(logged_at) AS date, activity_type, duration_min, avg_hr
         FROM cardio_sessions ORDER BY logged_at DESC LIMIT 1`,
    )
    .get() as LastCardioRow | undefined;

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
    last_lifting_session: {
      date: lastLift?.date ?? null,
      muscle_groups: muscleGroups,
    },
    last_cardio_session: {
      date: lastCardio?.date ?? null,
      activity: lastCardio?.activity_type ?? null,
      duration_min: lastCardio?.duration_min ?? null,
      avg_hr: lastCardio?.avg_hr ?? null,
    },
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

/** Map Umami stats onto Our Footage (QR scans / submissions are app-specific, not yet wired). */
function toOurFootage(site: SiteStats): OurFootage {
  return {
    visitors_7d: site.visitors_7d,
    pageviews_7d: site.pageviews_7d,
    qr_scans_7d: 0,
    submissions_7d: 0,
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

export async function GET(request: Request): Promise<Response> {
  // 1) Gate — fails closed if SNAPSHOT_TOKEN is unset / header missing / token wrong.
  const unauthorized = requireBearer(request, "SNAPSHOT_TOKEN");
  if (unauthorized) return unauthorized;

  const asOf = new Date().toISOString();

  // 2) Fan out to every source concurrently. Each entry is independent; a rejection becomes a
  //    safe default below so one failing source can't fail the whole snapshot.
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
  ]);

  // 3) Assemble the stable Snapshot, substituting safe defaults for any rejected source.
  //    `host` (Beszel) is fetched for the Overview infra card but isn't part of the snapshot
  //    JSON sketch, so it's resolved (keeping one source from failing the batch) and dropped.
  void settled<HostMetrics>(host, EMPTY_HOST);

  const snapshot: Snapshot = {
    as_of: asOf,
    deficit_app: toDeficitApp(
      settled<DeficitAppStats>(deficitStats, EMPTY_DEFICIT_STATS),
      settled<FunnelStats>(funnel, EMPTY_FUNNEL),
      settled<CrashStats>(health, EMPTY_HEALTH),
    ),
    deficit_landing: toLanding(settled<SiteStats>(landingSite, EMPTY_SITE)),
    our_footage: toOurFootage(settled<SiteStats>(ourFootageSite, EMPTY_SITE)),
    portfolio: toPortfolio(settled<SiteStats>(portfolioSite, EMPTY_SITE)),
    social: SOCIAL_PLACEHOLDER,
    infra: settled<Infra>(infra, EMPTY_INFRA),
    fitness: settled<Fitness>(fitness, EMPTY_FITNESS(asOf)),
  };

  // 4) Return the JSON. allSettled guarantees we always reach here with a full object.
  return NextResponse.json(snapshot);
}
