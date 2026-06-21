/**
 * /api/fitness/bodyweight
 *
 *   GET  — bodyweight trend, oldest → newest (chart-ready). Optional ?limit=N caps to the
 *          most recent N entries (still returned in ascending date order).
 *   POST — log/overwrite a day's bodyweight. Body: { date?: ISO (default today), weight, unit? }.
 *          One row per date (UNIQUE), so re-posting a date updates it (upsert).
 *
 * Behind Cloudflare Access (single-user). Renders as a trend line w/ 7d moving average on
 * desktop (fitness-tracker spec).
 */

import { getDb } from "@/lib/db";
import { fail, ok, parseJsonBody } from "../_lib/http";
import { asIsoDate, asPositiveInt, asPositiveNumber } from "../_lib/validate";

const ALLOWED_UNITS = new Set(["lb", "kg"]);
const DEFAULT_UNIT = "lb";

interface BodyweightRow {
  id: number;
  date: string;
  weight: number;
  unit: string;
}

export function GET(request: Request): Response {
  const db = getDb();
  const limitParam = new URL(request.url).searchParams.get("limit");

  if (limitParam !== null) {
    const limit = asPositiveInt("limit", Number(limitParam));
    if ("error" in limit) return fail(400, limit.error);
    // Take the most recent N, then re-sort ascending for charting.
    const rows = db
      .prepare(
        `SELECT id, date, weight, unit FROM (
           SELECT id, date, weight, unit FROM bodyweight_log
            ORDER BY date DESC LIMIT ?
         ) ORDER BY date ASC`,
      )
      .all(limit.value) as BodyweightRow[];
    return ok(rows);
  }

  const rows = db
    .prepare(`SELECT id, date, weight, unit FROM bodyweight_log ORDER BY date ASC`)
    .all() as BodyweightRow[];
  return ok(rows);
}

export async function POST(request: Request): Promise<Response> {
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
