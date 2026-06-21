/**
 * PostHog client → the Deficit activation→revenue funnel ({@link DeficitFunnel}).
 *
 * STUB. Returns the funnel sub-object as nulls/zeros until the PostHog read token is
 * provisioned. Server-side only — `POSTHOG_PERSONAL_API_KEY` must never reach the browser.
 *
 * TODO: needs POSTHOG_PERSONAL_API_KEY (+ POSTHOG_HOST, POSTHOG_PROJECT_ID). Implement against
 * the PostHog query API (`POST {host}/api/projects/{id}/query`) to compute 7d onboarding →
 * paywall → subscribed counts and the conversion rate.
 */

// Server-only: this module will read POSTHOG_PERSONAL_API_KEY from process.env and must never
// be imported into a client bundle. (No `server-only` package dep in this skeleton; wrap with
// `import "server-only"` if that dep is added.)

import type { FunnelStats, PostHogClient } from "@/lib/clients/types";

/** Empty funnel — counts zero, conversion not yet computable. */
const EMPTY_FUNNEL: FunnelStats = {
  onboarding_7d: 0,
  paywall_7d: 0,
  subscribed_7d: 0,
  conversion_rate: null,
};

/** PostHog client (stub). */
export const posthogClient: PostHogClient = {
  async getFunnelStats(): Promise<FunnelStats> {
    // TODO: needs POSTHOG_PERSONAL_API_KEY — query the funnel from the PostHog query API.
    return EMPTY_FUNNEL;
  },
};

export default posthogClient;
