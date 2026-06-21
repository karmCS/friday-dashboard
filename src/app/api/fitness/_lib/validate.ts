/**
 * Input validation for the fitness API routes.
 *
 * Every value crossing the API boundary is validated here before it touches SQLite —
 * "never trust external data." Validators return a typed value on success or an error
 * string describing the first failure. Domain bounds (reps > 0, RIR 0–5) come from the
 * fitness-tracker data model: one row per set, RIR = reps-in-reserve.
 */

/** RIR (reps in reserve) practical bound. 0 = to failure; >5 is not a meaningful logged set. */
export const RIR_MIN = 0;
export const RIR_MAX = 5;

/** Result of a single field validation: a value, or a human-readable error. */
export type Validated<T> = { value: T } | { error: string };

const ok = <T>(value: T): Validated<T> => ({ value });
const err = (error: string): Validated<never> => ({ error });

/** A finite integer. Rejects floats, NaN, Infinity, and non-numbers. */
export function asInt(field: string, raw: unknown): Validated<number> {
  if (typeof raw !== "number" || !Number.isInteger(raw)) {
    return err(`${field} must be an integer.`);
  }
  return ok(raw);
}

/** A positive integer (>= 1). */
export function asPositiveInt(field: string, raw: unknown): Validated<number> {
  const r = asInt(field, raw);
  if ("error" in r) return r;
  if (r.value < 1) return err(`${field} must be >= 1.`);
  return ok(r.value);
}

/** An integer within an inclusive [min, max] range. */
export function asIntInRange(
  field: string,
  raw: unknown,
  min: number,
  max: number,
): Validated<number> {
  const r = asInt(field, raw);
  if ("error" in r) return r;
  if (r.value < min || r.value > max) {
    return err(`${field} must be between ${min} and ${max}.`);
  }
  return ok(r.value);
}

/** RIR: integer in [RIR_MIN, RIR_MAX]. */
export function asRir(field: string, raw: unknown): Validated<number> {
  return asIntInRange(field, raw, RIR_MIN, RIR_MAX);
}

/** A finite number (int or float). */
export function asNumber(field: string, raw: unknown): Validated<number> {
  if (typeof raw !== "number" || !Number.isFinite(raw)) {
    return err(`${field} must be a finite number.`);
  }
  return ok(raw);
}

/** A positive finite number (> 0). */
export function asPositiveNumber(field: string, raw: unknown): Validated<number> {
  const r = asNumber(field, raw);
  if ("error" in r) return r;
  if (r.value <= 0) return err(`${field} must be > 0.`);
  return ok(r.value);
}

/** A non-empty trimmed string. */
export function asNonEmptyString(field: string, raw: unknown): Validated<string> {
  if (typeof raw !== "string") return err(`${field} must be a string.`);
  const trimmed = raw.trim();
  if (trimmed.length === 0) return err(`${field} must not be empty.`);
  return ok(trimmed);
}

/** An optional trimmed string: returns null when absent/null, else a non-empty string. */
export function asOptionalString(field: string, raw: unknown): Validated<string | null> {
  if (raw === undefined || raw === null) return ok(null);
  return asNonEmptyString(field, raw);
}

/** A strict ISO calendar date (YYYY-MM-DD) that is also a real date. */
export function asIsoDate(field: string, raw: unknown): Validated<string> {
  if (typeof raw !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return err(`${field} must be an ISO date (YYYY-MM-DD).`);
  }
  const [y, m, d] = raw.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return err(`${field} is not a valid calendar date.`);
  }
  return ok(raw);
}

/**
 * Parses an `[id]` route segment to a positive integer, or null if it isn't one.
 * Used by the dynamic session route.
 */
export function parseIdParam(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isSafeInteger(n) && n >= 1 ? n : null;
}
