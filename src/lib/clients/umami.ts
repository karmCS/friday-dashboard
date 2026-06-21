/**
 * Umami web-analytics client.
 *
 * Reads per-site stats from the self-hosted Umami instance (analytics.markcalip.com) for the
 * three tracked properties. Returns the generic {@link SiteStats}; the aggregator maps each
 * site's result onto the property-specific snapshot sub-object (deficit_landing / our_footage
 * / portfolio).
 *
 * Server-side only — `UMAMI_API_KEY` must never reach the browser.
 *
 * Umami API: `GET {UMAMI_BASE_URL}/api/websites/{websiteId}/stats?startAt=&endAt=` returns
 * `{ pageviews, visitors, visits, bounces, totaltime }` where each is `{ value, prev }`.
 * Top source / top page / top referrer come from the `/metrics` endpoint
 * (`?type=referrer|url`), each returning `[{ x, y }]` rows sorted by count desc.
 */

// Server-only: this module reads UMAMI_API_KEY from process.env and must never be imported
// into a client bundle. (No `server-only` package dep in this skeleton; the secret reference
// + Node usage keep it server-bound. Wrap with `import "server-only"` if that dep is added.)

import type { SiteStats, UmamiClient } from "@/lib/clients/types";

/** Known Umami website ids per property (from concepts/umami in the wiki). */
export const UMAMI_WEBSITE_IDS = {
  /** getdeficit.com (landing) */
  deficitLanding: "422fbc1b-a9d6-4e8a-9fc0-e7d9091793c4",
  /** our-footage.com */
  ourFootage: "a44ed07c-508d-4eed-be5d-67f4c7d50833",
  /** markcalip.com (portfolio) */
  portfolio: "f5fdfe48-d1b7-4a9d-8587-8b00523f9e8c",
} as const;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;

/** Empty result used when the API is unreachable or misconfigured (fail-soft). */
const EMPTY_STATS: SiteStats = {
  visitors_7d: 0,
  pageviews_7d: 0,
  bounce_rate: null,
  top_source: null,
  top_page: null,
  top_referrer: null,
};

/** Shape of a single Umami `/stats` metric ({ value, prev }). */
interface UmamiStatMetric {
  value: number;
  prev: number;
}

interface UmamiStatsResponse {
  pageviews: UmamiStatMetric;
  visitors: UmamiStatMetric;
  visits: UmamiStatMetric;
  bounces: UmamiStatMetric;
  totaltime: UmamiStatMetric;
}

/** One row of a Umami `/metrics` response. */
interface UmamiMetricRow {
  x: string | null;
  y: number;
}

function getConfig(): { baseUrl: string; apiKey: string } | null {
  const baseUrl = process.env.UMAMI_BASE_URL;
  const apiKey = process.env.UMAMI_API_KEY;
  if (!baseUrl || !apiKey) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

/** Authenticated JSON GET against the Umami API, with a timeout. Throws on non-2xx. */
async function umamiGet<T>(url: string, apiKey: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: {
        // Umami v2/v3 accepts an API key via the x-umami-api-key header.
        "x-umami-api-key": apiKey,
        accept: "application/json",
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`Umami responded ${res.status} for ${url}`);
    }
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

/** Bounce rate as a percent (0–100), or null when visits are zero/unknown. */
function bounceRatePct(stats: UmamiStatsResponse): number | null {
  const visits = stats.visits?.value ?? 0;
  if (visits <= 0) return null;
  const bounces = stats.bounces?.value ?? 0;
  return Math.round((bounces / visits) * 1000) / 10;
}

/** Top non-empty `x` label from a `/metrics` rows response, or null. */
function topLabel(rows: UmamiMetricRow[]): string | null {
  for (const row of rows) {
    if (row.x && row.x.trim().length > 0) return row.x;
  }
  return null;
}

/**
 * Umami client wired to the configured instance. All methods fail soft: any network/parse/
 * config error resolves to {@link EMPTY_STATS} so the aggregator never throws on one site.
 */
export const umamiClient: UmamiClient = {
  async getSiteStats(websiteId: string): Promise<SiteStats> {
    const config = getConfig();
    if (!config) return EMPTY_STATS;

    const endAt = Date.now();
    const startAt = endAt - SEVEN_DAYS_MS;
    const range = `startAt=${startAt}&endAt=${endAt}`;
    const base = `${config.baseUrl}/api/websites/${encodeURIComponent(websiteId)}`;

    try {
      const stats = await umamiGet<UmamiStatsResponse>(
        `${base}/stats?${range}`,
        config.apiKey,
      );

      // Top source/referrer/page are best-effort enrichments; if they fail, keep nulls.
      const [referrers, urls] = await Promise.all([
        umamiGet<UmamiMetricRow[]>(`${base}/metrics?${range}&type=referrer`, config.apiKey).catch(
          () => [] as UmamiMetricRow[],
        ),
        umamiGet<UmamiMetricRow[]>(`${base}/metrics?${range}&type=url`, config.apiKey).catch(
          () => [] as UmamiMetricRow[],
        ),
      ]);

      const topReferrer = topLabel(referrers);
      return {
        visitors_7d: stats.visitors?.value ?? 0,
        pageviews_7d: stats.pageviews?.value ?? 0,
        bounce_rate: bounceRatePct(stats),
        // Umami's referrer metric doubles as the "source" for our purposes.
        top_source: topReferrer,
        top_page: topLabel(urls),
        top_referrer: topReferrer,
      };
    } catch {
      // Fail soft: one unreachable site must not fail the whole snapshot.
      return EMPTY_STATS;
    }
  },
};

export default umamiClient;
