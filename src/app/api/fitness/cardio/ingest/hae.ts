/**
 * Health Auto Export (HAE) → normalized cardio mapper.
 *
 * HAE's "REST API" automation POSTs its own batch JSON, NOT our clean single-object contract:
 *   { data: { workouts: [ {...}, ... ], metrics: [...] } }
 * The body isn't customizable in the app, so we adapt to it here. This is a pure function (no
 * DB / no I/O) so it's unit-testable, and it parses DEFENSIVELY — HAE's field shapes have drifted
 * across app versions, so each field tolerates a few forms and an unmappable workout is skipped
 * rather than failing the whole batch.
 *
 * Known HAE workout fields we read: name, start, end, duration (seconds), distance {qty,units},
 * avgHeartRate {qty} or heartRateData[{Avg|qty}], id.
 */

/** Normalized cardio session — the shared shape the ingest route writes to the DB. */
export interface NormalizedCardio {
  activity_type: string;
  duration_min: number;
  avg_hr: number | null;
  distance_km: number | null;
  date: string; // YYYY-MM-DD
  external_id: string | null;
}

export interface MapResult {
  workouts: NormalizedCardio[];
  skipped: number;
}

const HR_MIN = 30;
const HR_MAX = 260;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/** Finite number from a number or numeric string, else null. */
function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) return Number(v);
  return null;
}

/** Reads a `{ qty, units }` measure (HAE's shape) or a bare number → its qty + units. */
function measure(v: unknown): { qty: number; units: string } | null {
  if (isObject(v)) {
    const qty = num(v.qty);
    if (qty === null) return null;
    return { qty, units: typeof v.units === "string" ? v.units.toLowerCase() : "" };
  }
  const qty = num(v);
  return qty === null ? null : { qty, units: "" };
}

/** Converts a distance measure to km. Unknown units are assumed already-km (HAE respects the
 *  user's unit setting; default-km is the safe guess for a single user on metric). */
function toKm(m: { qty: number; units: string }): number {
  if (m.units.startsWith("mi")) return m.qty * 1.60934;
  if (m.units === "m" || m.units === "meter" || m.units === "meters") return m.qty / 1000;
  if (m.units === "yd") return m.qty * 0.0009144;
  return m.qty; // km or unspecified
}

/** Average HR from HAE's varied shapes: avgHeartRate{qty}, heartRate{qty}, or heartRateData[]. */
function avgHeartRate(w: Record<string, unknown>): number | null {
  const direct = measure(w.avgHeartRate) ?? measure(w.heartRate);
  if (direct) return clampHr(direct.qty);

  const series = w.heartRateData;
  if (Array.isArray(series) && series.length > 0) {
    const samples = series
      .map((s) => (isObject(s) ? num(s.Avg) ?? num(s.avg) ?? num(s.qty) : null))
      .filter((n): n is number => n !== null);
    if (samples.length > 0) {
      return clampHr(samples.reduce((a, b) => a + b, 0) / samples.length);
    }
  }
  return null;
}

/** Rounds + range-checks an HR; out-of-range (sensor glitch) drops to null rather than poisoning. */
function clampHr(v: number): number | null {
  const r = Math.round(v);
  return r >= HR_MIN && r <= HR_MAX ? r : null;
}

/** The local calendar date HAE recorded. start is "YYYY-MM-DD HH:mm:ss ±ZZZZ" — slice the
 *  leading date so we keep the user's WALL-CLOCK day (avoids a UTC off-by-one). */
function workoutDate(start: unknown): string | null {
  if (typeof start !== "string") return null;
  const head = start.slice(0, 10);
  return ISO_DATE.test(head) ? head : null;
}

/** Maps one HAE workout to NormalizedCardio, or null when it can't be made valid. */
function mapWorkout(w: Record<string, unknown>): NormalizedCardio | null {
  const name = typeof w.name === "string" ? w.name.trim() : typeof w.type === "string" ? w.type.trim() : "";
  if (!name) return null;

  // duration is HAE seconds; require a positive value.
  const durationSec = num(w.duration);
  if (durationSec === null || durationSec <= 0) return null;
  const duration_min = Math.round((durationSec / 60) * 100) / 100;

  const date = workoutDate(w.start);
  if (date === null) return null;

  const dist = measure(w.distance);
  const distance_km = dist ? Math.round(toKm(dist) * 100) / 100 : null;

  const external_id =
    typeof w.id === "string" && w.id.trim() !== ""
      ? w.id.trim()
      : `${name}|${typeof w.start === "string" ? w.start : ""}`;

  return {
    activity_type: name,
    duration_min,
    avg_hr: avgHeartRate(w),
    distance_km: distance_km !== null && distance_km > 0 ? distance_km : null,
    date,
    external_id,
  };
}

/** True when the payload is an HAE batch (has data.workouts or data.metrics array). */
export function isHaePayload(body: unknown): boolean {
  if (!isObject(body) || !isObject(body.data)) return false;
  const d = body.data as Record<string, unknown>;
  return Array.isArray(d.workouts) || Array.isArray(d.metrics);
}

/** Normalized daily step count (from HAE metrics). */
export interface NormalizedStep {
  date: string; // YYYY-MM-DD
  count: number;
}

/**
 * Extracts daily step counts from an HAE "All Metrics" payload.
 * Looks for any metric named "step_count" or "steps" and sums per date
 * (handles rare multi-source exports; Apple Health already deduplicates in practice).
 */
export function mapHaeSteps(body: unknown): NormalizedStep[] {
  if (!isObject(body) || !isObject(body.data)) return [];
  const data = body.data as Record<string, unknown>;
  if (!Array.isArray(data.metrics)) return [];

  const byDate = new Map<string, number>();
  for (const metric of data.metrics) {
    if (!isObject(metric)) continue;
    const name = typeof metric.name === "string" ? metric.name.toLowerCase() : "";
    if (name !== "step_count" && name !== "steps") continue;
    if (!Array.isArray(metric.data)) continue;
    for (const entry of metric.data) {
      if (!isObject(entry)) continue;
      const count = num(entry.qty);
      if (count === null || count < 0) continue;
      const date = workoutDate(entry.date);
      if (!date) continue;
      byDate.set(date, (byDate.get(date) ?? 0) + Math.round(count));
    }
  }
  return Array.from(byDate.entries()).map(([date, count]) => ({ date, count }));
}

/** Maps a full HAE payload → normalized workouts + a count of unmappable ones. */
export function mapHaePayload(body: unknown): MapResult {
  const data = isObject(body) ? (body.data as Record<string, unknown>) : {};
  const raw = Array.isArray(data.workouts) ? data.workouts : [];
  const workouts: NormalizedCardio[] = [];
  let skipped = 0;
  for (const w of raw) {
    const mapped = isObject(w) ? mapWorkout(w) : null;
    if (mapped) workouts.push(mapped);
    else skipped++;
  }
  return { workouts, skipped };
}
