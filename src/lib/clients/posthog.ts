/**
 * PostHog client → Deficit activation→revenue funnel (DeficitFunnel).
 *
 * Queries the PostHog HogQL endpoint for distinct-user counts of the three
 * funnel events over the last 7 days. Falls back to zero-counts when env
 * vars are absent or the request fails (fail-soft — caller uses allSettled).
 *
 * Required env vars: POSTHOG_HOST, POSTHOG_PROJECT_ID, POSTHOG_PERSONAL_API_KEY
 */

import type { FunnelStats, PostHogClient } from "@/lib/clients/types";

const EMPTY_FUNNEL: FunnelStats = {
  onboarding_7d: 0,
  paywall_7d: 0,
  subscribed_7d: 0,
  conversion_rate: null,
};

// HogQL: distinct users per funnel event in the last 7 days.
const FUNNEL_QUERY = `
  SELECT event, count(distinct person.id) AS cnt
  FROM events
  WHERE event IN ('onboarding_completed', 'paywall_shown', 'subscription_started')
    AND timestamp >= now() - interval 7 day
  GROUP BY event
`.trim();

interface HogQLResult {
  results: [string, number][];
}

export const posthogClient: PostHogClient = {
  async getFunnelStats(): Promise<FunnelStats> {
    const host = process.env.POSTHOG_HOST;
    const projectId = process.env.POSTHOG_PROJECT_ID;
    const apiKey = process.env.POSTHOG_PERSONAL_API_KEY;

    if (!host || !projectId || !apiKey) return EMPTY_FUNNEL;

    const res = await fetch(`${host}/api/projects/${projectId}/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ query: { kind: "HogQLQuery", query: FUNNEL_QUERY } }),
      next: { revalidate: 300 }, // 5-min cache — same as snapshot
    });

    if (!res.ok) return EMPTY_FUNNEL;

    const data = (await res.json()) as HogQLResult;
    const counts: Record<string, number> = {};
    for (const [event, cnt] of data.results ?? []) {
      counts[event] = cnt;
    }

    const onboarding = counts["onboarding_completed"] ?? 0;
    const paywall = counts["paywall_shown"] ?? 0;
    const subscribed = counts["subscription_started"] ?? 0;
    const conversion_rate =
      onboarding > 0 ? Math.round((subscribed / onboarding) * 1000) / 10 : null;

    return { onboarding_7d: onboarding, paywall_7d: paywall, subscribed_7d: subscribed, conversion_rate };
  },
};

export default posthogClient;
