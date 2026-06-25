/**
 * /api/fitness/bodyweight
 *
 *   GET  — bodyweight trend, oldest → newest (chart-ready). Optional ?limit=N caps to the
 *          most recent N entries (still returned in ascending date order). Access-gated.
 *   POST — the iOS Shortcut → Apple Health bridge: log/overwrite a day's bodyweight. Body:
 *          { date?: ISO (default today), weight, unit? }. One row per date (UNIQUE), so
 *          re-posting a date updates it (upsert).
 *
 * AUTH: like the steps bridge, the POST canNOT sit behind Cloudflare Access (a headless
 * Shortcut can't do the Access login), so it is bearer-token gated with BODYWEIGHT_TOKEN.
 * The GET read is Access-gated. Bulk in-app history loads use POST /api/fitness/bodyweight/import
 * (CSV, Access-gated) instead. See analytics-dashboard.md "Auth".
 */

import { getDb } from "@/lib/db";
import { requireBearer } from "@/lib/auth";
import { fail, ok, parseJsonBody } from "../_lib/http";
import { asIsoDate, asPositiveInt, asPositiveNumber } from "../_lib/validate";

// better-sqlite3 requires the Node runtime (not Edge).
export const runtime = "nodejs";

const ALLOWED_UNITS = new Set(["lb", "kg"]);
const DEFAULT_UNIT = "lb";

/** Window length for the trailing simple moving average rendered on the trend line. */
const MOVING_AVG_WINDOW = 7;

interface BodyweightRow {
  id: number;
  date: string;
  weight: number;
  unit: string;
}

/** One point in the smoothed series: the date and its trailing 7-day average weight. */
interface MovingAvgPoint {
  date: string;
  avg: number;
}

/** GET response: chart-ready raw entries plus a parallel 7-day moving-average series. */
interface BodyweightResponse {
  entries: BodyweightRow[];
  moving_avg: MovingAvgPoint[];
}

/**
 * Trailing simple moving average over `window` days. Rows must be ascending by date.
 * Early points (fewer than `window` prior entries) average whatever is available so the
 * series is the same length as `rows` and renders from the first point.
 */
function computeMovingAvg(rows: BodyweightRow[], window: number): MovingAvgPoint[] {
  return rows.map((row, i) => {
    const start = Math.max(0, i - window + 1);
    const slice = rows.slice(start, i + 1);
    const sum = slice.reduce((acc, r) => acc + r.weight, 0);
    return { date: row.date, avg: Math.round((sum / slice.length) * 100) / 100 };
  });
}

export function GET(request: Request): Response {
  const db = getDb();
  const limitParam = new URL(request.url).searchParams.get("limit");

  let entries: BodyweightRow[];
  if (limitParam !== null) {
    const limit = asPositiveInt("limit", Number(limitParam));
    if ("error" in limit) return fail(400, limit.error);
    // Take the most recent N, then re-sort ascending for charting.
    entries = db
      .prepare(
        `SELECT id, date, weight, unit FROM (
           SELECT id, date, weight, unit FROM bodyweight_log
            ORDER BY date DESC LIMIT ?
         ) ORDER BY date ASC`,
      )
      .all(limit.value) as BodyweightRow[];
  } else {
    entries = db
      .prepare(`SELECT id, date, weight, unit FROM bodyweight_log ORDER BY date ASC`)
      .all() as BodyweightRow[];
  }

  const response: BodyweightResponse = {
    entries,
    moving_avg: computeMovingAvg(entries, MOVING_AVG_WINDOW),
  };
  return ok(response);
}

export async function POST(request: Request): Promise<Response> {
  // Bearer-token gate first — fails closed if BODYWEIGHT_TOKEN is unset.
  const unauthorized = requireBearer(request, "BODYWEIGHT_TOKEN");
  if (unauthorized) return unauthorized;

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  // date defaults to today (UTC) when omitted.
  let date: string;
  if (body.date === undefined || body.date === null) {
    date = new Date().toISOString().slice(0, 10);
  } else {
    const v = asIsoDate("date", body.date);
    if ("error" in v) return fail(400, v.error);
    date = v.value;
  }

  const weight = asPositiveNumber("weight", body.weight);
  if ("error" in weight) return fail(400, weight.error);

  let unit = DEFAULT_UNIT;
  if (body.unit !== undefined && body.unit !== null) {
    if (typeof body.unit !== "string" || !ALLOWED_UNITS.has(body.unit)) {
      return fail(400, `unit must be one of: ${[...ALLOWED_UNITS].join(", ")}.`);
    }
    unit = body.unit;
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO bodyweight_log (date, weight, unit) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET weight = excluded.weight, unit = excluded.unit`,
  ).run(date, weight.value, unit);

  const row = db
    .prepare(`SELECT id, date, weight, unit FROM bodyweight_log WHERE date = ?`)
    .get(date) as BodyweightRow;

  return ok(row, 201);
}
