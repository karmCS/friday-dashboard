/**
 * Supabase client → Deficit users / engagement / revenue ({@link DeficitAppStats}).
 *
 * Reads NON-PII AGGREGATES ONLY from Deficit's prod Supabase using the `service_role` key.
 * No names, emails, or free-text ever leave this module — only counts and rates. Athlete PII
 * stays in Supabase and is read live elsewhere (the Athlete Inspector), never via the
 * snapshot.
 *
 * Server-side only — `SUPABASE_SERVICE_ROLE_KEY` must never reach the browser.
 *
 * What it computes:
 *  - users:      total fighters, signups in the last 7d
 *  - engagement: 7d counts of food/weight/strength logs + coach messages, made-weight rate
 *  - revenue:    derived from the `revenuecat_events` webhook log — active subs/trials from
 *                renewal/cancellation/expiration events. Sandbox events count as $0 real MRR.
 *
 * Funnel (PostHog) and crashes (Sentry) are intentionally NOT here — they have their own
 * clients. This returns only the Supabase-owned slices of {@link DeficitApp}.
 *
 * NOTE: `@supabase/supabase-js` exports its own `SupabaseClient` type; ours is aliased to
 * `FridaySupabaseClient` to avoid the name collision.
 */

// Server-only: this module reads SUPABASE_SERVICE_ROLE_KEY from process.env and must never be
// imported into a client bundle — the service_role key bypasses RLS. (No `server-only` package
// dep in this skeleton; wrap with `import "server-only"` if that dep is added.)

import { createClient, type SupabaseClient as SupabaseJsClient } from "@supabase/supabase-js";

import type {
  DeficitEngagement,
  DeficitRevenue,
  DeficitUsers,
} from "@/lib/types";
import type {
  DeficitAppStats,
  SupabaseClient as FridaySupabaseClient,
} from "@/lib/clients/types";

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/** Zero-valued defaults returned on any config/query failure (fail-soft). */
const EMPTY_USERS: DeficitUsers = { total: 0, signups_7d: 0, dau: 0, wau: 0 };
const EMPTY_ENGAGEMENT: DeficitEngagement = {
  food_logged_7d: 0,
  weight_logged_7d: 0,
  coach_msgs_7d: 0,
  made_weight_rate: null,
  top_feature: null,
};
const EMPTY_REVENUE: DeficitRevenue = {
  mrr_usd: 0,
  active_subs: 0,
  active_trials: 0,
  trial_to_paid: null,
  churn: null,
};
const EMPTY_STATS: DeficitAppStats = {
  users: EMPTY_USERS,
  engagement: EMPTY_ENGAGEMENT,
  revenue: EMPTY_REVENUE,
};

/** ISO timestamp 7 days ago, for `created_at >= …` window filters. */
function sevenDaysAgoIso(): string {
  return new Date(Date.now() - SEVEN_DAYS_MS).toISOString();
}

/** Lazily-built service_role client, or null when env is missing. */
let cachedClient: SupabaseJsClient | null = null;

function getServiceClient(): SupabaseJsClient | null {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

/**
 * Count rows in a table, optionally filtered to the last 7 days by `created_at`. Uses a
 * head-only count query (no rows transferred). Returns 0 on error (fail-soft).
 */
async function countRows(
  client: SupabaseJsClient,
  table: string,
  options: { since?: string } = {},
): Promise<number> {
  let query = client.from(table).select("*", { count: "exact", head: true });
  if (options.since) {
    query = query.gte("created_at", options.since);
  }
  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

/** Total fighters + 7d signups, from the `fighters` table. */
async function loadUsers(client: SupabaseJsClient, since: string): Promise<DeficitUsers> {
  const [total, signups7d] = await Promise.all([
    countRows(client, "fighters"),
    countRows(client, "fighters", { since }),
  ]);
  // DAU/WAU are PostHog-derived (active-session metrics); Supabase only owns totals/signups.
  return { total, signups_7d: signups7d, dau: 0, wau: 0 };
}

/** 7d engagement counts (food / weight / strength logs + coach messages). */
async function loadEngagement(
  client: SupabaseJsClient,
  since: string,
): Promise<DeficitEngagement> {
  const [foodLogged7d, weightLogged7d, coachMsgs7d] = await Promise.all([
    countRows(client, "food_logs", { since }),
    countRows(client, "weight_logs", { since }),
    countRows(client, "chat_messages", { since }),
  ]);
  return {
    food_logged_7d: foodLogged7d,
    weight_logged_7d: weightLogged7d,
    coach_msgs_7d: coachMsgs7d,
    // made_weight_rate + top_feature need richer joins/event data — left null until wired.
    made_weight_rate: null,
    top_feature: null,
  };
}

/** A RevenueCat webhook event row (only the fields we read). */
interface RevenueCatEventRow {
  event_type: string | null;
  environment: string | null;
  period_type: string | null;
}

/** RevenueCat event types that indicate an active/ended subscription lifecycle. */
const ACTIVE_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "RENEWAL",
  "PRODUCT_CHANGE",
  "UNCANCELLATION",
]);
const TRIAL_EVENTS = new Set(["TRIAL_STARTED", "TRIAL_CONVERTED"]);
const ENDED_EVENTS = new Set(["CANCELLATION", "EXPIRATION", "SUBSCRIPTION_PAUSED"]);

/**
 * Revenue derived from the `revenuecat_events` webhook log. Pre-launch this is mostly sandbox
 * traffic, so real MRR is treated as $0 until production events appear; active subs/trials are
 * approximated from the lifecycle event mix. Best-effort — returns zeros on any failure.
 */
async function loadRevenue(client: SupabaseJsClient): Promise<DeficitRevenue> {
  const { data, error } = await client
    .from("revenuecat_events")
    .select("event_type, environment, period_type")
    .limit(5000);

  if (error || !data) return EMPTY_REVENUE;

  const rows = data as RevenueCatEventRow[];
  let activeSubs = 0;
  let activeTrials = 0;

  for (const row of rows) {
    const type = (row.event_type ?? "").toUpperCase();
    const isTrialPeriod = (row.period_type ?? "").toUpperCase() === "TRIAL";

    if (ENDED_EVENTS.has(type)) {
      activeSubs = Math.max(0, activeSubs - 1);
      continue;
    }
    if (TRIAL_EVENTS.has(type) || isTrialPeriod) {
      activeTrials += 1;
      continue;
    }
    if (ACTIVE_EVENTS.has(type)) {
      activeSubs += 1;
    }
  }

  return {
    // Sandbox traffic only pre-launch → $0 real MRR until production events land.
    mrr_usd: 0,
    active_subs: activeSubs,
    active_trials: activeTrials,
    trial_to_paid: null,
    churn: null,
  };
}

/** Supabase client backed by a `service_role` connection to Deficit's prod DB. */
export const supabaseClient: FridaySupabaseClient = {
  async getDeficitAppStats(): Promise<DeficitAppStats> {
    const client = getServiceClient();
    if (!client) return EMPTY_STATS;

    const since = sevenDaysAgoIso();
    try {
      const [users, engagement, revenue] = await Promise.all([
        loadUsers(client, since),
        loadEngagement(client, since),
        loadRevenue(client),
      ]);
      return { users, engagement, revenue };
    } catch {
      return EMPTY_STATS;
    }
  },
};

export default supabaseClient;
