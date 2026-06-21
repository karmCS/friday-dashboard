/**
 * Data-client contracts.
 *
 * Each external data source (Umami, Uptime Kuma, Beszel, Supabase, PostHog, Sentry,
 * RevenueCat, Strava, plus the local SQLite store) is wrapped in a client that implements
 * one of these interfaces. Every method returns the matching sub-object of {@link Snapshot}
 * (or a small typed result), so the `/api/snapshot` aggregator can compose the whole
 * snapshot from independently-testable, independently-failing pieces.
 *
 * Design rules these clients must follow:
 *  - **Server-side only.** No data-source key ever reaches the browser.
 *  - **Non-PII out.** Clients return aggregates only; PII stays in Supabase, read live.
 *  - **Fail soft.** A client that errors should let the aggregator fall back to defaults
 *    rather than fail the whole snapshot (the aggregator owns that policy).
 */

import type {
  DeficitApp,
  DeficitEngagement,
  DeficitFunnel,
  DeficitHealth,
  DeficitLanding,
  DeficitRevenue,
  DeficitUsers,
  Fitness,
  Infra,
  OurFootage,
  Portfolio,
  Snapshot,
  Social,
} from "@/lib/types";

/**
 * Umami web-analytics for one tracked site. The aggregator calls this once per property
 * (landing / our-footage / portfolio) with the relevant Umami website id, then maps the
 * generic {@link SiteStats} onto the property-specific snapshot sub-object.
 */
export interface SiteStats {
  visitors_7d: number;
  pageviews_7d: number;
  /** bounce rate (percent), or null when unavailable */
  bounce_rate: number | null;
  /** top traffic source, or null */
  top_source: string | null;
  /** most-visited page path, or null */
  top_page: string | null;
  /** top referrer, or null */
  top_referrer: string | null;
}

/** Umami client: per-site stats keyed by Umami website id. */
export interface UmamiClient {
  getSiteStats(websiteId: string): Promise<SiteStats>;
}

/**
 * Infra status surface — combines Uptime Kuma (up/down + last deploy) and is shaped to
 * drop straight into {@link Snapshot.infra}.
 */
export type InfraStatus = Infra;

/** Uptime Kuma client → the infra snapshot slice. */
export interface KumaClient {
  getInfraStatus(): Promise<InfraStatus>;
}

/** Host/container resource metrics from Beszel (not part of the JSON snapshot sketch; for the Overview infra card). */
export interface HostMetrics {
  /** percent 0–100 */
  cpu_pct: number | null;
  /** percent 0–100 */
  mem_pct: number | null;
  /** percent 0–100 */
  disk_pct: number | null;
}

/** Beszel client → host resource metrics. */
export interface BeszelClient {
  getHostMetrics(): Promise<HostMetrics>;
}

/**
 * Deficit app stats sourced from Supabase (`service_role`): users, engagement, and revenue.
 * Funnel + crashes come from PostHog/Sentry clients below, so this returns the Supabase-owned
 * slices of {@link DeficitApp}.
 */
export interface DeficitAppStats {
  users: DeficitUsers;
  engagement: DeficitEngagement;
  revenue: DeficitRevenue;
}

/** Supabase client → Deficit users/engagement/revenue (non-PII aggregates). */
export interface SupabaseClient {
  getDeficitAppStats(): Promise<DeficitAppStats>;
}

/** Funnel stats from PostHog → {@link DeficitApp.funnel}. */
export type FunnelStats = DeficitFunnel;

/** PostHog client → the Deficit activation→revenue funnel. */
export interface PostHogClient {
  getFunnelStats(): Promise<FunnelStats>;
}

/** Crash/health stats from Sentry → {@link DeficitApp.health}. */
export type CrashStats = DeficitHealth;

/** Sentry client → crash-free rate + open issue count. */
export interface SentryClient {
  getCrashStats(): Promise<CrashStats>;
}

/** Landing-page ad spend/metrics not covered by Umami (Meta/TikTok Ads, future). */
export type LandingStats = DeficitLanding;

/** Our Footage app-specific counts (QR scans, submissions) from Supabase. */
export type OurFootageStats = OurFootage;

/** Portfolio-specific stats (mostly Umami-derived). */
export type PortfolioStats = Portfolio;

/** Social stats (Instagram Graph API now; TikTok/ads later → null). */
export type SocialStats = Social;

/** Social client → the social snapshot slice. */
export interface SocialClient {
  getSocialStats(): Promise<SocialStats>;
}

/** Fitness stats computed from the local SQLite store → {@link Snapshot.fitness}. */
export type FitnessStats = Fitness;

/** Local SQLite-backed fitness client → the fitness snapshot slice. */
export interface FitnessClient {
  getFitnessStats(): Promise<FitnessStats>;
}

/**
 * The aggregator contract: composes every client's output into the full {@link Snapshot}
 * served by `GET /api/snapshot`.
 */
export interface SnapshotAggregator {
  buildSnapshot(): Promise<Snapshot>;
}
