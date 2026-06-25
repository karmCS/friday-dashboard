/**
 * Athlete Inspector — shared server infra + types.
 *
 * ⚠ PRIVACY (load-bearing): the Inspector is the ONE surface that returns Deficit PII
 * (athlete names, emails, free-text chat/notes). Acceptable because the whole host sits
 * behind Cloudflare Access locked to the single operator. Reads Supabase via the
 * `service_role` key SERVER-SIDE ONLY — never returned to or referenced by the client.
 * All filters use supabase-js `.eq` (parameterized; no string-built SQL).
 *
 * Fail-soft: with no SUPABASE_* env every loader returns empty/null with a 200.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/** Canonical UUID shape — guards fighter_id before it reaches the DB. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Lazily-built service_role client, or null when env is missing (fail-soft). */
let cached: SupabaseClient | null = null;
export function getClient(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

export function json(data: unknown): Response {
  // PII payload — keep it out of any browser/intermediary cache. (force-dynamic only disables
  // Next's own route cache, not the HTTP Cache-Control.)
  return new Response(JSON.stringify({ data }), {
    headers: { "content-type": "application/json", "cache-control": "private, no-store, max-age=0" },
  });
}

/** Coerce a PostgREST numeric (number OR precision-preserving string) to a finite number, else null. */
export function asNum(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function asStr(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function asBool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

// --- roster row (from the admin_athlete_roster view) --------------------------

export interface RosterAthlete {
  fighter_id: string;
  athlete: string | null;
  email: string | null;
  sport: string | null;
  sex: string | null;
  age: number | null;
  subscription_tier: string | null;
  created_at: string | null;
  walk_around_weight: number | null;
  current_weight: number | null;
  current_weight_at: string | null;
  weight_class_label: string | null;
  target_weight: number | null;
  weigh_in_at: string | null;
  event_status: string | null;
  made_weight: boolean | null;
  in_camp: boolean;
  camps_completed: number;
  camps_total: number;
  weekly_checkins_completed: number;
  last_active_at: string | null;
  active_days_30d: number;
}

const ROSTER_COLUMNS =
  "fighter_id, athlete, email, sport, sex, age, subscription_tier, created_at, walk_around_weight, " +
  "current_weight, current_weight_at, weight_class_label, target_weight, weigh_in_at, event_status, " +
  "made_weight, in_camp, camps_completed, camps_total, weekly_checkins_completed, last_active_at, active_days_30d";

export { ROSTER_COLUMNS };

/** Narrow one untrusted view row into a RosterAthlete (or null when it lacks a fighter id). */
export function parseRoster(value: unknown): RosterAthlete | null {
  if (typeof value !== "object" || value === null) return null;
  const r = value as Record<string, unknown>;
  const fighterId = r.fighter_id;
  if (typeof fighterId !== "string" || fighterId === "") return null;
  return {
    fighter_id: fighterId,
    athlete: asStr(r.athlete),
    email: asStr(r.email),
    sport: asStr(r.sport),
    sex: asStr(r.sex),
    age: asNum(r.age),
    subscription_tier: asStr(r.subscription_tier),
    created_at: asStr(r.created_at),
    walk_around_weight: asNum(r.walk_around_weight),
    current_weight: asNum(r.current_weight),
    current_weight_at: asStr(r.current_weight_at),
    weight_class_label: asStr(r.weight_class_label),
    target_weight: asNum(r.target_weight),
    weigh_in_at: asStr(r.weigh_in_at),
    event_status: asStr(r.event_status),
    made_weight: asBool(r.made_weight),
    in_camp: r.in_camp === true,
    camps_completed: asNum(r.camps_completed) ?? 0,
    camps_total: asNum(r.camps_total) ?? 0,
    weekly_checkins_completed: asNum(r.weekly_checkins_completed) ?? 0,
    last_active_at: asStr(r.last_active_at),
    active_days_30d: asNum(r.active_days_30d) ?? 0,
  };
}
