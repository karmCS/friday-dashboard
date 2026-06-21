/**
 * Sentry client → crash-free rate + open issue count ({@link DeficitHealth}).
 *
 * STUB. Returns crash-free % as null and open issues as 0 until the Sentry auth token is
 * provisioned. Server-side only — `SENTRY_AUTH_TOKEN` must never reach the browser.
 *
 * TODO: needs SENTRY_AUTH_TOKEN (+ SENTRY_ORG, SENTRY_PROJECT). Implement against the Sentry
 * API: `GET /api/0/organizations/{org}/sessions/` for the crash-free-sessions rate and
 * `GET /api/0/projects/{org}/{project}/issues/?query=is:unresolved` for the open-issue count.
 */

// Server-only: this module will read SENTRY_AUTH_TOKEN from process.env and must never be
// imported into a client bundle. (No `server-only` package dep in this skeleton; wrap with
// `import "server-only"` if that dep is added.)

import type { CrashStats, SentryClient } from "@/lib/clients/types";

/** Empty health — crash-free unknown, no open issues counted yet. */
const EMPTY_HEALTH: CrashStats = {
  crash_free_rate: null,
  open_issues: 0,
};

/** Sentry client (stub). */
export const sentryClient: SentryClient = {
  async getCrashStats(): Promise<CrashStats> {
    // TODO: needs SENTRY_AUTH_TOKEN — read crash-free % + open issues from the Sentry API.
    return EMPTY_HEALTH;
  },
};

export default sentryClient;
