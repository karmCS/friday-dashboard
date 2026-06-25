/**
 * Shared types, validation, and helpers for the Taco Tracker API routes.
 *
 * Data model (analytics-dashboard.md → Taco Tracker):
 *   tacos(id, place, city, state, taco_type, rating, price_tier, notes,
 *         photo_path, visited_at, created_at)
 *
 * The `tacos` table is created idempotently by `getDb()` (see @/lib/db). These routes
 * own CRUD + photo upload. All input is validated at the boundary before it touches SQL,
 * and every query is parameterized (never string-built).
 */

/** A taco row as stored in SQLite. */
export interface TacoRow {
  id: number;
  place: string;
  city: string;
  state: string;
  taco_type: string;
  rating: number | null;
  price_tier: string | null;
  notes: string | null;
  photo_path: string | null;
  visited_at: string;
  created_at: string;
}

/**
 * A taco as exposed to the client. Identical to {@link TacoRow} except the on-disk
 * `photo_path` (an absolute server path) is replaced by a `has_photo` boolean — the browser
 * only needs to know a photo exists; it builds the serving URL from the id. Keeps the server
 * filesystem layout out of API responses.
 */
export type PublicTaco = Omit<TacoRow, "photo_path"> & { has_photo: boolean };

/** Project a stored row into its client-safe shape (drops the absolute photo path). */
export function toPublicTaco(row: TacoRow): PublicTaco {
  const { photo_path, ...rest } = row;
  return { ...rest, has_photo: photo_path !== null };
}

/** Allowed `price_tier` values (matches the CHECK constraint in the schema). */
export const PRICE_TIERS = ["$", "$$", "$$$"] as const;
export type PriceTier = (typeof PRICE_TIERS)[number];

/** Inclusive rating bounds (matches the CHECK constraint in the schema). */
export const RATING_MIN = 1;
export const RATING_MAX = 10;

/** Validated fields for creating a taco (POST). Required fields are non-optional here. */
export interface TacoCreateInput {
  place: string;
  city: string;
  state: string;
  taco_type: string;
  rating: number | null;
  price_tier: PriceTier | null;
  notes: string | null;
  /** ISO date (YYYY-MM-DD); when omitted the DB default `date('now')` is used. */
  visited_at: string | null;
}

/** Validated, partial fields for updating a taco (PATCH). Only present keys are applied. */
export type TacoPatchInput = Partial<TacoCreateInput>;

/** Result of a validation pass: either the parsed value or a list of error messages. */
export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: string[] };

/** JSON 200/201 helper. */
export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Uniform error envelope. */
export function error(message: string, status: number, details?: string[]): Response {
  const body: Record<string, unknown> = { error: message };
  if (details && details.length > 0) body.details = details;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/** Parses a route `[id]` param into a positive integer, or returns null when invalid. */
export function parseId(raw: string): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) return null;
  return n;
}

// --- Field-level validators --------------------------------------------------

/** A non-empty trimmed string, else an error keyed by `field`. */
function requireString(
  value: unknown,
  field: string,
  errors: string[],
): string | undefined {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${field} is required and must be a non-empty string`);
    return undefined;
  }
  return value.trim();
}

/** An optional string → trimmed string or null (empty/absent → null). */
function optionalString(value: unknown, field: string, errors: string[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    errors.push(`${field} must be a string`);
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Validates rating: null/absent allowed; otherwise an integer in [RATING_MIN, RATING_MAX]. */
function validateRating(value: unknown, errors: string[]): number | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "number" || !Number.isInteger(value)) {
    errors.push("rating must be an integer");
    return null;
  }
  if (value < RATING_MIN || value > RATING_MAX) {
    errors.push(`rating must be between ${RATING_MIN} and ${RATING_MAX}`);
    return null;
  }
  return value;
}

/** Validates price_tier: null/absent allowed; otherwise one of PRICE_TIERS. */
function validatePriceTier(value: unknown, errors: string[]): PriceTier | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !PRICE_TIERS.includes(value as PriceTier)) {
    errors.push(`price_tier must be one of ${PRICE_TIERS.join(", ")}`);
    return null;
  }
  return value as PriceTier;
}

/** Validates visited_at: null/absent allowed; otherwise a YYYY-MM-DD calendar date. */
function validateVisitedAt(value: unknown, errors: string[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") {
    errors.push("visited_at must be a string (YYYY-MM-DD)");
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "") return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    errors.push("visited_at must be an ISO date (YYYY-MM-DD)");
    return null;
  }
  // Reject impossible calendar dates (e.g. 2026-13-40).
  const parsed = new Date(`${trimmed}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== trimmed) {
    errors.push("visited_at is not a valid calendar date");
    return null;
  }
  return trimmed;
}

/** True for a JSON object (not array, not null). */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// --- Body validators ---------------------------------------------------------

/** Validates a POST body into a {@link TacoCreateInput}. */
export function validateCreate(body: unknown): ValidationResult<TacoCreateInput> {
  if (!isRecord(body)) {
    return { ok: false, errors: ["request body must be a JSON object"] };
  }
  const errors: string[] = [];

  const place = requireString(body.place, "place", errors);
  const city = requireString(body.city, "city", errors);
  const state = requireString(body.state, "state", errors);
  const taco_type = requireString(body.taco_type, "taco_type", errors);
  const rating = validateRating(body.rating, errors);
  const price_tier = validatePriceTier(body.price_tier, errors);
  const notes = optionalString(body.notes, "notes", errors);
  const visited_at = validateVisitedAt(body.visited_at, errors);

  if (errors.length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      place: place!,
      city: city!,
      state: state!,
      taco_type: taco_type!,
      rating,
      price_tier,
      notes,
      visited_at,
    },
  };
}

/**
 * Validates a PATCH body into a {@link TacoPatchInput}. Only keys actually present in the
 * body are validated and returned — absent keys are left untouched on update. Requires at
 * least one updatable field.
 */
export function validatePatch(body: unknown): ValidationResult<TacoPatchInput> {
  if (!isRecord(body)) {
    return { ok: false, errors: ["request body must be a JSON object"] };
  }
  const errors: string[] = [];
  const patch: TacoPatchInput = {};

  if ("place" in body) {
    const v = requireString(body.place, "place", errors);
    if (v !== undefined) patch.place = v;
  }
  if ("city" in body) {
    const v = requireString(body.city, "city", errors);
    if (v !== undefined) patch.city = v;
  }
  if ("state" in body) {
    const v = requireString(body.state, "state", errors);
    if (v !== undefined) patch.state = v;
  }
  if ("taco_type" in body) {
    const v = requireString(body.taco_type, "taco_type", errors);
    if (v !== undefined) patch.taco_type = v;
  }
  if ("rating" in body) {
    patch.rating = validateRating(body.rating, errors);
  }
  if ("price_tier" in body) {
    patch.price_tier = validatePriceTier(body.price_tier, errors);
  }
  if ("notes" in body) {
    patch.notes = optionalString(body.notes, "notes", errors);
  }
  if ("visited_at" in body) {
    patch.visited_at = validateVisitedAt(body.visited_at, errors);
  }

  if (errors.length > 0) return { ok: false, errors };
  if (Object.keys(patch).length === 0) {
    return { ok: false, errors: ["no updatable fields provided"] };
  }
  return { ok: true, value: patch };
}

/** Safely parses a JSON request body, returning null on malformed/empty input. */
export async function readJson(request: Request): Promise<unknown | null> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
