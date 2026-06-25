/**
 * POST /api/fitness/bodyweight/manual — in-app single bodyweight entry (Access-gated).
 *
 * The daily HEADLESS path is the bearer-gated POST /api/fitness/bodyweight (iOS Shortcut),
 * which a browser can't call (no token). This Access-gated sibling is the in-app manual add —
 * e.g. logging today's weight or correcting a day after a CSV import. Body:
 *   { date?: ISO (default today), weight, unit? }. One row per date (UNIQUE) → upsert.
 *
 * Behind Cloudflare Access (single-user). Same upsert as the bearer route; separate URL so
 * Access can gate this while exempting the Shortcut bridge.
 */

import { getDb } from "@/lib/db";
import { fail, ok, parseJsonBody } from "../../_lib/http";
import { asIsoDate, asPositiveNumber } from "../../_lib/validate";

// better-sqlite3 requires the Node runtime (not Edge).
export const runtime = "nodejs";

const ALLOWED_UNITS = new Set(["lb", "kg"]);

interface BodyweightRow {
  id: number;
  date: string;
  weight: number;
  unit: string;
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

  let unit = "lb";
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
