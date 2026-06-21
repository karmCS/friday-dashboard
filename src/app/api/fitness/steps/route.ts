/**
 * /api/fitness/steps
 *
 *   POST ONLY — the iOS Shortcut → Apple Health bridge. An iOS Automation reads today's step
 *   count and POSTs { date, count } here nightly. Body:
 *     { date?: ISO (default today), count, source? }
 *   One row per date (UNIQUE) → re-posting a date updates it (the nightly run is idempotent).
 *
 * AUTH: this endpoint canNOT sit behind Cloudflare Access (a headless Shortcut can't do the
 * Access login), so it is bearer-token gated with STEPS_TOKEN. Every other fitness route is
 * Access-gated instead. See analytics-dashboard.md "Auth".
 */

import { getDb } from "@/lib/db";
import { requireBearer } from "@/lib/auth";
import { fail, ok, parseJsonBody } from "../_lib/http";
import { asIsoDate, asInt, asNonEmptyString } from "../_lib/validate";

const DEFAULT_SOURCE = "apple-health-shortcut";

interface StepsRow {
  id: number;
  date: string;
  count: number;
  source: string;
}

export async function POST(request: Request): Promise<Response> {
  // Bearer-token gate first — fails closed if STEPS_TOKEN is unset.
  const unauthorized = requireBearer(request, "STEPS_TOKEN");
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

  // count: non-negative integer (a zero-step day is valid).
  const countV = asInt("count", body.count);
  if ("error" in countV) return fail(400, countV.error);
  if (countV.value < 0) return fail(400, "count must be >= 0.");

  let source = DEFAULT_SOURCE;
  if (body.source !== undefined && body.source !== null) {
    const v = asNonEmptyString("source", body.source);
    if ("error" in v) return fail(400, v.error);
    source = v.value;
  }

  const db = getDb();
  db.prepare(
    `INSERT INTO steps_log (date, count, source) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET count = excluded.count, source = excluded.source`,
  ).run(date, countV.value, source);

  const row = db
    .prepare(`SELECT id, date, count, source FROM steps_log WHERE date = ?`)
    .get(date) as StepsRow;

  return ok(row, 201);
}
