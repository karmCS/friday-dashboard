/**
 * /api/fitness/calendar
 *
 *   GET  — workout-calendar entries, oldest → newest. Optional ?from=YYYY-MM-DD&to=YYYY-MM-DD
 *          bounds (inclusive) scope to a week/range for the calendar grid.
 *   POST — log a workout day. Body: { date, label, type: 'lift'|'cardio'|'rest', notes? }.
 *          Multiple entries per date are allowed (e.g. a lift + a cardio same day).
 *
 * The calendar stores GENERAL labels ("Upper Body", "Stationary Bike") + a coarse type — not
 * individual exercises/sets (that granular model was retired 2026-06-24). Behind Cloudflare
 * Access (single-user); all input validated before SQL; every query parameterized.
 */

import { getDb } from "@/lib/db";
import { fail, ok, parseJsonBody } from "../_lib/http";
import { asIsoDate, asNonEmptyString, asOptionalString } from "../_lib/validate";

// better-sqlite3 requires the Node runtime (not Edge).
export const runtime = "nodejs";

/** Allowed workout types (matches the CHECK constraint in the schema). */
const WORKOUT_TYPES = new Set(["lift", "cardio", "rest"]);

interface CalendarRow {
  id: number;
  date: string;
  label: string;
  type: string;
  notes: string | null;
  created_at: string;
}

const COLUMNS = `id, date, label, type, notes, created_at`;

export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const from = params.get("from");
  const to = params.get("to");

  if (from !== null) {
    const v = asIsoDate("from", from);
    if ("error" in v) return fail(400, v.error);
  }
  if (to !== null) {
    const v = asIsoDate("to", to);
    if ("error" in v) return fail(400, v.error);
  }

  const db = getDb();
  let rows: CalendarRow[];
  if (from !== null && to !== null) {
    rows = db
      .prepare(
        `SELECT ${COLUMNS} FROM workout_calendar WHERE date >= ? AND date <= ? ORDER BY date ASC, id ASC`,
      )
      .all(from, to) as CalendarRow[];
  } else if (from !== null) {
    rows = db
      .prepare(`SELECT ${COLUMNS} FROM workout_calendar WHERE date >= ? ORDER BY date ASC, id ASC`)
      .all(from) as CalendarRow[];
  } else if (to !== null) {
    rows = db
      .prepare(`SELECT ${COLUMNS} FROM workout_calendar WHERE date <= ? ORDER BY date ASC, id ASC`)
      .all(to) as CalendarRow[];
  } else {
    rows = db
      .prepare(`SELECT ${COLUMNS} FROM workout_calendar ORDER BY date ASC, id ASC`)
      .all() as CalendarRow[];
  }
  return ok(rows);
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  const date = asIsoDate("date", body.date);
  if ("error" in date) return fail(400, date.error);

  const label = asNonEmptyString("label", body.label);
  if ("error" in label) return fail(400, label.error);

  if (typeof body.type !== "string" || !WORKOUT_TYPES.has(body.type)) {
    return fail(400, `type must be one of: ${[...WORKOUT_TYPES].join(", ")}.`);
  }

  const notes = asOptionalString("notes", body.notes);
  if ("error" in notes) return fail(400, notes.error);

  const db = getDb();
  const row = db
    .prepare(
      `INSERT INTO workout_calendar (date, label, type, notes) VALUES (?, ?, ?, ?)
       RETURNING ${COLUMNS}`,
    )
    .get(date.value, label.value, body.type, notes.value) as CalendarRow;

  return ok(row, 201);
}
