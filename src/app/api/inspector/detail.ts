/**
 * Athlete Inspector — per-athlete detail loaders (chat, daily macros, bodyweight, check-ins).
 *
 * Every query is keyed by a UUID-validated `fighter_id` via `.eq` (parameterized). Each loader
 * is independent and fail-soft: a query error degrades to an empty result, never a 500.
 * See ./shared.ts for the privacy posture (service_role, server-only, single operator).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { asNum } from "./shared";

const CHAT_LIMIT = 400;
const FOOD_LIMIT = 800;
const BODYWEIGHT_LIMIT = 180;
const CHECKIN_LIMIT = 20;
const MACRO_WINDOW_DAYS = 45;

// --- chat ---------------------------------------------------------------------

export interface ChatMessage {
  role: "fighter" | "ai_coach" | string;
  content: string;
  when_at: string | null;
  is_atlas: boolean;
}

/**
 * Chat transcript (both the athlete and the AI coach), oldest-first for display.
 * Fetch newest-first so the cap keeps the most RECENT CHAT_LIMIT messages (a coaching tool must
 * show current context, not the first 400 messages ever), then reverse back to oldest-first.
 */
export async function loadChat(client: SupabaseClient, fighterId: string): Promise<ChatMessage[]> {
  const { data, error } = await client
    .from("chat_messages")
    .select("role, content, created_at, is_atlas")
    .eq("fighter_id", fighterId)
    .order("created_at", { ascending: false })
    .limit(CHAT_LIMIT);
  if (error || !data) return [];
  return (data as Record<string, unknown>[])
    .map((r) => ({
      role: typeof r.role === "string" ? r.role : "unknown",
      content: typeof r.content === "string" ? r.content : "",
      when_at: typeof r.created_at === "string" ? r.created_at : null,
      is_atlas: r.is_atlas === true,
    }))
    .filter((m) => m.content.trim() !== "")
    .reverse();
}

// --- daily macros -------------------------------------------------------------

export interface MacroDay {
  date: string;
  kcal: number;
  protein_g: number;
  carbs_g: number;
  fat_g: number;
  entries: number;
}

export interface MacroTargets {
  kcal: number | null;
  /** true → `kcal` is a real prescribed intake cap; false → it's a TDEE fallback (NOT a cap). */
  kcal_is_cap: boolean;
  protein_min: number | null;
  protein_max: number | null;
  carbs_target: number | null;
}

export interface MacrosResult {
  days: MacroDay[];
  targets: MacroTargets | null;
}

/** A single food_log nutrition payload: { kcal, protein_g, carbs_g, fat_g }. */
function readNutrition(value: unknown): { kcal: number; protein_g: number; carbs_g: number; fat_g: number } {
  const n = typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
  return {
    kcal: asNum(n.kcal) ?? 0,
    protein_g: asNum(n.protein_g) ?? 0,
    carbs_g: asNum(n.carbs_g) ?? 0,
    fat_g: asNum(n.fat_g) ?? 0,
  };
}

/** ISO date `MACRO_WINDOW_DAYS` ago, for the `log_date >= …` window. */
function macroWindowStart(): string {
  const d = new Date(Date.now() - MACRO_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

/**
 * Per-day consumed macros (newest-first) + the athlete's current prescribed targets.
 * Consumed = sum of the day's food_logs nutrition. Targets come from the between-camps
 * prescription, falling back to the latest cut plan's TDEE for the kcal anchor.
 */
export async function loadMacros(client: SupabaseClient, fighterId: string): Promise<MacrosResult> {
  const [days, targets] = await Promise.all([
    loadMacroDays(client, fighterId),
    loadMacroTargets(client, fighterId),
  ]);
  return { days, targets };
}

async function loadMacroDays(client: SupabaseClient, fighterId: string): Promise<MacroDay[]> {
  const { data, error } = await client
    .from("food_logs")
    .select("log_date, nutrition")
    .eq("fighter_id", fighterId)
    .gte("log_date", macroWindowStart())
    .order("log_date", { ascending: false })
    .limit(FOOD_LIMIT);
  if (error || !data) return [];

  // Aggregate into one row per local log_date.
  const byDate = new Map<string, MacroDay>();
  for (const row of data as Record<string, unknown>[]) {
    const date = typeof row.log_date === "string" ? row.log_date : null;
    if (!date) continue;
    const nut = readNutrition(row.nutrition);
    const day = byDate.get(date) ?? { date, kcal: 0, protein_g: 0, carbs_g: 0, fat_g: 0, entries: 0 };
    day.kcal += nut.kcal;
    day.protein_g += nut.protein_g;
    day.carbs_g += nut.carbs_g;
    day.fat_g += nut.fat_g;
    day.entries += 1;
    byDate.set(date, day);
  }
  // Round the sums and return newest-first.
  return Array.from(byDate.values())
    .map((d) => ({
      ...d,
      kcal: Math.round(d.kcal),
      protein_g: Math.round(d.protein_g),
      carbs_g: Math.round(d.carbs_g),
      fat_g: Math.round(d.fat_g),
    }))
    .sort((a, b) => (a.date < b.date ? 1 : -1));
}

async function loadMacroTargets(client: SupabaseClient, fighterId: string): Promise<MacroTargets | null> {
  // Year-round prescription (one row per fighter) is the primary source.
  const [{ data: bcs }, { data: plan }] = await Promise.all([
    client
      .from("between_camps_states")
      .select("current_kcal_cap, current_protein_g_min, current_protein_g_max, current_carbs_g_target, updated_at")
      .eq("fighter_id", fighterId)
      .order("updated_at", { ascending: false })
      .limit(1),
    client
      .from("cut_plans")
      .select("tdee_kcal, created_at")
      .eq("fighter_id", fighterId)
      .order("created_at", { ascending: false })
      .limit(1),
  ]);

  const b = (bcs?.[0] ?? null) as Record<string, unknown> | null;
  const p = (plan?.[0] ?? null) as Record<string, unknown> | null;

  // A real prescribed cap only exists on the between-camps state. cut_plans.tdee_kcal is
  // maintenance energy expenditure, NOT an intake cap — surface it labeled honestly, and never
  // treat eating below TDEE during a cut as "over cap".
  const cap = asNum(b?.current_kcal_cap);
  const kcal = cap ?? asNum(p?.tdee_kcal);
  const proteinMin = asNum(b?.current_protein_g_min);
  const proteinMax = asNum(b?.current_protein_g_max);
  const carbs = asNum(b?.current_carbs_g_target);

  if (kcal === null && proteinMin === null && proteinMax === null && carbs === null) return null;
  return { kcal, kcal_is_cap: cap !== null, protein_min: proteinMin, protein_max: proteinMax, carbs_target: carbs };
}

// --- bodyweight (in-camp weight_logs + between-camps walk_around_logs) ---------

export interface BodyweightPoint {
  date: string;
  weight: number;
  source: "camp" | "walk_around";
}

/** Merged bodyweight trend across both log sources, oldest-first, capped to the recent window. */
export async function loadBodyweight(client: SupabaseClient, fighterId: string): Promise<BodyweightPoint[]> {
  const [campRes, walkRes] = await Promise.all([
    client
      .from("weight_logs")
      .select("logged_at, weight")
      .eq("fighter_id", fighterId)
      .order("logged_at", { ascending: false })
      .limit(BODYWEIGHT_LIMIT),
    client
      .from("walk_around_logs")
      .select("logged_at, weight")
      .eq("fighter_id", fighterId)
      .order("logged_at", { ascending: false })
      .limit(BODYWEIGHT_LIMIT),
  ]);

  const points: BodyweightPoint[] = [];
  const push = (rows: unknown, source: BodyweightPoint["source"]): void => {
    if (!Array.isArray(rows)) return;
    for (const row of rows as Record<string, unknown>[]) {
      const date = typeof row.logged_at === "string" ? row.logged_at : null;
      const weight = asNum(row.weight);
      if (date && weight !== null) points.push({ date, weight, source });
    }
  };
  if (!campRes.error) push(campRes.data, "camp");
  if (!walkRes.error) push(walkRes.data, "walk_around");

  // Oldest-first for charting; keep only the most recent window after the merge.
  points.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  return points.slice(-BODYWEIGHT_LIMIT);
}

// --- weekly check-ins ---------------------------------------------------------

export interface CheckinRow {
  week_number: number | null;
  energy_rating: number | null;
  training_quality_rating: number | null;
  sleep_rating: number | null;
  hunger_rating: number | null;
  mood_rating: number | null;
  macro_compliance_rating: number | null;
  notes: string | null;
  skipped: boolean;
  when_at: string | null;
}

/** Recent weekly check-ins (newest-first). */
export async function loadCheckins(client: SupabaseClient, fighterId: string): Promise<CheckinRow[]> {
  const { data, error } = await client
    .from("weekly_checkins")
    .select(
      "week_number, energy_rating, training_quality_rating, sleep_rating, hunger_rating, mood_rating, macro_compliance_rating, notes, skipped, created_at",
    )
    .eq("fighter_id", fighterId)
    .order("created_at", { ascending: false })
    .limit(CHECKIN_LIMIT);
  if (error || !data) return [];
  return (data as Record<string, unknown>[]).map((r) => ({
    week_number: asNum(r.week_number),
    energy_rating: asNum(r.energy_rating),
    training_quality_rating: asNum(r.training_quality_rating),
    sleep_rating: asNum(r.sleep_rating),
    hunger_rating: asNum(r.hunger_rating),
    mood_rating: asNum(r.mood_rating),
    macro_compliance_rating: asNum(r.macro_compliance_rating),
    notes: typeof r.notes === "string" ? r.notes : null,
    skipped: r.skipped === true,
    when_at: typeof r.created_at === "string" ? r.created_at : null,
  }));
}
