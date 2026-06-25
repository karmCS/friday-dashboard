/**
 * Athlete Inspector — client-side API types + narrowing parsers.
 *
 * Every wire value is treated as `unknown` and narrowed here before it reaches a component —
 * the server is trusted, but the contract is enforced at the boundary so the UI never renders
 * `undefined`. Shapes mirror /api/inspector (see the route + ./detail.ts on the server).
 */

const PATH = "/api/inspector";

// --- shapes -------------------------------------------------------------------

export interface Athlete {
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

export interface ChatMessage {
  role: string;
  content: string;
  when_at: string | null;
  is_atlas: boolean;
}

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
  kcal_is_cap: boolean;
  protein_min: number | null;
  protein_max: number | null;
  carbs_target: number | null;
}

export interface BodyweightPoint {
  date: string;
  weight: number;
  source: "camp" | "walk_around" | string;
}

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

export interface DetailData {
  athlete: Athlete | null;
  chat: ChatMessage[];
  macros: { days: MacroDay[]; targets: MacroTargets | null };
  bodyweight: BodyweightPoint[];
  checkins: CheckinRow[];
}

// --- primitive narrowing ------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function str(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}
function num(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
function numOr0(value: unknown): number {
  return num(value) ?? 0;
}
function bool(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

// --- parsers ------------------------------------------------------------------

export function parseAthlete(value: unknown): Athlete | null {
  if (!isRecord(value)) return null;
  const fighterId = value.fighter_id;
  if (typeof fighterId !== "string" || fighterId === "") return null;
  return {
    fighter_id: fighterId,
    athlete: str(value.athlete),
    email: str(value.email),
    sport: str(value.sport),
    sex: str(value.sex),
    age: num(value.age),
    subscription_tier: str(value.subscription_tier),
    created_at: str(value.created_at),
    walk_around_weight: num(value.walk_around_weight),
    current_weight: num(value.current_weight),
    current_weight_at: str(value.current_weight_at),
    weight_class_label: str(value.weight_class_label),
    target_weight: num(value.target_weight),
    weigh_in_at: str(value.weigh_in_at),
    event_status: str(value.event_status),
    made_weight: bool(value.made_weight),
    in_camp: value.in_camp === true,
    camps_completed: numOr0(value.camps_completed),
    camps_total: numOr0(value.camps_total),
    weekly_checkins_completed: numOr0(value.weekly_checkins_completed),
    last_active_at: str(value.last_active_at),
    active_days_30d: numOr0(value.active_days_30d),
  };
}

function parseChat(value: unknown): ChatMessage | null {
  if (!isRecord(value)) return null;
  const content = str(value.content);
  if (content === null || content.trim() === "") return null;
  return {
    role: str(value.role) ?? "unknown",
    content,
    when_at: str(value.when_at),
    is_atlas: value.is_atlas === true,
  };
}

function parseMacroDay(value: unknown): MacroDay | null {
  if (!isRecord(value)) return null;
  const date = str(value.date);
  if (date === null) return null;
  return {
    date,
    kcal: numOr0(value.kcal),
    protein_g: numOr0(value.protein_g),
    carbs_g: numOr0(value.carbs_g),
    fat_g: numOr0(value.fat_g),
    entries: numOr0(value.entries),
  };
}

function parseTargets(value: unknown): MacroTargets | null {
  if (!isRecord(value)) return null;
  return {
    kcal: num(value.kcal),
    kcal_is_cap: value.kcal_is_cap === true,
    protein_min: num(value.protein_min),
    protein_max: num(value.protein_max),
    carbs_target: num(value.carbs_target),
  };
}

function parseBodyweight(value: unknown): BodyweightPoint | null {
  if (!isRecord(value)) return null;
  const date = str(value.date);
  const weight = num(value.weight);
  if (date === null || weight === null) return null;
  return { date, weight, source: str(value.source) ?? "camp" };
}

function parseCheckin(value: unknown): CheckinRow | null {
  if (!isRecord(value)) return null;
  return {
    week_number: num(value.week_number),
    energy_rating: num(value.energy_rating),
    training_quality_rating: num(value.training_quality_rating),
    sleep_rating: num(value.sleep_rating),
    hunger_rating: num(value.hunger_rating),
    mood_rating: num(value.mood_rating),
    macro_compliance_rating: num(value.macro_compliance_rating),
    notes: str(value.notes),
    skipped: value.skipped === true,
    when_at: str(value.when_at),
  };
}

function arr<T>(value: unknown, parse: (v: unknown) => T | null): T[] {
  if (!Array.isArray(value)) return [];
  return value.map(parse).filter((x): x is T => x !== null);
}

export function parseList(value: unknown): Athlete[] {
  if (!isRecord(value) || !isRecord(value.data)) return [];
  return arr(value.data.athletes, parseAthlete);
}

export function parseDetail(value: unknown): DetailData {
  const empty: DetailData = { athlete: null, chat: [], macros: { days: [], targets: null }, bodyweight: [], checkins: [] };
  if (!isRecord(value) || !isRecord(value.data)) return empty;
  const data = value.data;
  const macros = isRecord(data.macros) ? data.macros : {};
  return {
    athlete: parseAthlete(data.athlete),
    chat: arr(data.chat, parseChat),
    macros: { days: arr(macros.days, parseMacroDay), targets: parseTargets(macros.targets) },
    bodyweight: arr(data.bodyweight, parseBodyweight),
    checkins: arr(data.checkins, parseCheckin),
  };
}

// --- fetch --------------------------------------------------------------------

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return (await res.json()) as unknown;
}

export async function fetchRoster(signal: AbortSignal): Promise<Athlete[]> {
  return parseList(await fetchJson(PATH, signal));
}

export async function fetchDetail(fighterId: string, signal: AbortSignal): Promise<DetailData> {
  return parseDetail(await fetchJson(`${PATH}?fighter_id=${encodeURIComponent(fighterId)}`, signal));
}
