/**
 * /api/fitness/calendar/[id]
 *
 *   PATCH  — edit a workout-calendar entry (any subset of date/label/type/notes).
 *   DELETE — remove an entry.
 *
 * `[id]` is parsed to a positive integer before any SQL. The SET clause is built from a fixed
 * allow-list of column names (literals) with parameterized values — never string-built from
 * user input. Behind Cloudflare Access (single-user).
 */

import { getDb } from "@/lib/db";
import { fail, ok, parseJsonBody } from "../../_lib/http";
import { asIsoDate, asNonEmptyString, asOptionalString, parseIdParam } from "../../_lib/validate";

// better-sqlite3 requires the Node runtime (not Edge).
export const runtime = "nodejs";

const WORKOUT_TYPES = new Set(["lift", "cardio", "rest"]);
const COLUMNS = `id, date, label, type, notes, created_at`;

interface CalendarRow {
  id: number;
  date: string;
  label: string;
  type: string;
  notes: string | null;
  created_at: string;
}

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = parseIdParam(rawId);
  if (id === null) return fail(400, "invalid calendar id.");

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  // Fixed column allow-list → safe to interpolate the names; values stay parameterized.
  const sets: string[] = [];
  const args: unknown[] = [];

  if ("date" in body) {
    const v = asIsoDate("date", body.date);
    if ("error" in v) return fail(400, v.error);
    sets.push("date = ?");
    args.push(v.value);
  }
  if ("label" in body) {
    const v = asNonEmptyString("label", body.label);
    if ("error" in v) return fail(400, v.error);
    sets.push("label = ?");
    args.push(v.value);
  }
  if ("type" in body) {
    if (typeof body.type !== "string" || !WORKOUT_TYPES.has(body.type)) {
      return fail(400, `type must be one of: ${[...WORKOUT_TYPES].join(", ")}.`);
    }
    sets.push("type = ?");
    args.push(body.type);
  }
  if ("notes" in body) {
    const v = asOptionalString("notes", body.notes);
    if ("error" in v) return fail(400, v.error);
    sets.push("notes = ?");
    args.push(v.value);
  }

  if (sets.length === 0) return fail(400, "no updatable fields provided.");

  const db = getDb();
  const row = db
    .prepare(`UPDATE workout_calendar SET ${sets.join(", ")} WHERE id = ? RETURNING ${COLUMNS}`)
    .get(...args, id) as CalendarRow | undefined;
  if (!row) return fail(404, "calendar entry not found.");
  return ok(row);
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = parseIdParam(rawId);
  if (id === null) return fail(400, "invalid calendar id.");

  const db = getDb();
  const info = db.prepare(`DELETE FROM workout_calendar WHERE id = ?`).run(id);
  if (info.changes === 0) return fail(404, "calendar entry not found.");
  return ok({ deleted: id });
}
