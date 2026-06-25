/**
 * Umami web-analytics client.
 *
 * Umami v3 has no static API keys. Auth is credential-based: POST /api/auth/login →
 * JWT bearer token. The token is cached in process memory and refreshed ~1 minute before
 * expiry (or on the next call after expiry).
 *
 * Env vars: UMAMI_BASE_URL, UMAMI_USERNAME, UMAMI_PASSWORD
 * Server-side only — credentials must never reach the browser.
 */

import type { SiteStats, UmamiClient } from "@/lib/clients/types";

export const UMAMI_WEBSITE_IDS = {
  deficitLanding: "422fbc1b-a9d6-4e8a-9fc0-e7d9091793c4",
  ourFootage: "a44ed07c-508d-4eed-be5d-67f4c7d50833",
  portfolio: "f5fdfe48-d1b7-4a9d-8587-8b00523f9e8c",
} as const;

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 8000;
// Refresh token 60 s before expiry to avoid mid-request expiry.
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

const EMPTY_STATS: SiteStats = {
  visitors_7d: 0,
  pageviews_7d: 0,
  bounce_rate: null,
  top_source: null,
  top_page: null,
  top_referrer: null,
};

// Umami v3 returns flat numbers; v2 returned { value, prev } objects.
interface UmamiStatsResponse {
  pageviews: number;
  visitors: number;
  visits: number;
  bounces: number;
  totaltime: number;
}

interface UmamiMetricRow {
  x: string | null;
  y: number;
}

interface TokenCache {
  token: string;
  expiresAt: number; // ms epoch
}

// Module-level cache — one token per process lifetime, refreshed on expiry.
let tokenCache: TokenCache | null = null;

function getConfig(): { baseUrl: string; username: string; password: string } | null {
  const baseUrl = process.env.UMAMI_BASE_URL;
  const username = process.env.UMAMI_USERNAME;
  const password = process.env.UMAMI_PASSWORD;
  if (!baseUrl || !username || !password) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), username, password };
}

/** POST /api/auth/login → bearer token. Throws on failure. */
async function login(baseUrl: string, username: string, password: string): Promise<TokenCache> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ username, password }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Umami login failed: ${res.status}`);
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new Error("Umami login: no token in response");
    // Umami JWTs are 24 h by default; cache for 23 h.
    return { token: body.token, expiresAt: Date.now() + 23 * 60 * 60 * 1000 };
  } finally {
    clearTimeout(timer);
  }
}

/** Returns a valid bearer token, logging in or refreshing as needed. */
async function getToken(
  baseUrl: string,
  username: string,
  password: string,
): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return tokenCache.token;
  }
  tokenCache = await login(baseUrl, username, password);
  return tokenCache.token;
}

async function umamiGet<T>(url: string, token: string): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "application/json" },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Umami ${res.status} for ${url}`);
    return (await res.json()) as T;
  } finally {
    clearTimeout(timer);
  }
}

function bounceRatePct(stats: UmamiStatsResponse): number | null {
  const visits = stats.visits ?? 0;
  if (visits <= 0) return null;
  return Math.round(((stats.bounces ?? 0) / visits) * 1000) / 10;
}

function topLabel(rows: UmamiMetricRow[]): string | null {
  for (const row of rows) {
    if (row.x && row.x.trim().length > 0) return row.x;
  }
  return null;
}

export const umamiClient: UmamiClient = {
  async getSiteStats(websiteId: string): Promise<SiteStats> {
    const config = getConfig();
    if (!config) return EMPTY_STATS;

    try {
      const token = await getToken(config.baseUrl, config.username, config.password);
      const endAt = Date.now();
      const startAt = endAt - SEVEN_DAYS_MS;
      const range = `startAt=${startAt}&endAt=${endAt}`;
      const base = `${config.baseUrl}/api/websites/${encodeURIComponent(websiteId)}`;

      const stats = await umamiGet<UmamiStatsResponse>(`${base}/stats?${range}`, token);

      const [referrers, urls] = await Promise.all([
        umamiGet<UmamiMetricRow[]>(`${base}/metrics?${range}&type=referrer`, token).catch(
          () => [] as UmamiMetricRow[],
        ),
        umamiGet<UmamiMetricRow[]>(`${base}/metrics?${range}&type=url`, token).catch(
          () => [] as UmamiMetricRow[],
        ),
      ]);

      const topReferrer = topLabel(referrers);
      return {
        visitors_7d: stats.visitors ?? 0,
        pageviews_7d: stats.pageviews ?? 0,
        bounce_rate: bounceRatePct(stats),
        top_source: topReferrer,
        top_page: topLabel(urls),
        top_referrer: topReferrer,
      };
    } catch {
      return EMPTY_STATS;
    }
  },
};

export default umamiClient;
