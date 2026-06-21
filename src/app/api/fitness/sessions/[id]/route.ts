/**
 * /api/fitness/sessions/[id]
 *
 *   GET    — session detail plus its sets (joined to exercise name/muscle group),
 *            ordered by set logging order.
 *   PATCH  — end (or amend) a session. Body: { ended_at?: ISO|null|"now", notes?: string|null }.
 *            Passing ended_at:"now" (or omitting it on an open session) stamps the current time.
 *   DELETE — remove a session; its sets cascade (FK ON DELETE CASCADE).
 *
 * Behind Cloudflare Access (single-user). Next.js 15 passes route params as a Promise.
 */

import { getDb } from "@/lib/db";
import { fail, ok, parseJsonBody } from "../../_lib/http";
import { asIsoDate, asOptionalString, parseIdParam } from "../../_lib/validate";

interface RouteContext {
  params: Promise<{ id: string }>;
}

interface WorkoutSessionRow {
  id: number;
  template_id: number | null;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
}

interface SessionSetRow {
  id: number;
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  set_number: number;
  reps: number;
  rir: number | null;
  logged_at: string;
}

async function resolveId(context: RouteContext): Promise<number | null> {
  const { id } = await context.params;
  return parseIdParam(id);
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const id = await resolveId(context);
  if (id === null) return fail(400, "Invalid session id.");

  const db = getDb();
  const session = db
    .prepare(
      `SELECT id, template_id, started_at, ended_at, notes
         FROM workout_sessions WHERE id = ?`,
    )
    .get(id) as WorkoutSessionRow | undefined;

  if (!session) return fail(404, `Session ${id} not found.`);

  const sets = db
    .prepare(
      `SELECT ws.id, ws.exercise_id, e.name AS exercise_name, e.muscle_group,
              ws.set_number, ws.reps, ws.rir, ws.logged_at
         FROM workout_sets ws
         JOIN exercises e ON e.id = ws.exercise_id
        WHERE ws.session_id = ?
        ORDER BY ws.logged_at ASC, ws.set_number ASC`,
    )
    .all(id) as SessionSetRow[];

  return ok({ ...session, sets });
}

export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const id = await resolveId(context);
  if (id === null) return fail(400, "Invalid session id.");

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  // Resolve ended_at: "now" / absent-but-ending → current timestamp; ISO date accepted;
  // explicit null clears it (re-opens the session).
  let endedAt: string | null | undefined;
  let clearEnded = false;
  if (body.ended_at === "now") {
    endedAt = nowTimestamp();
  } else if (body.ended_at === null) {
    clearEnded = true;
  } else if (body.ended_at !== undefined) {
    const v = asIsoDate("ended_at", body.ended_at);
    if ("error" in v) return fail(400, v.error);
    endedAt = v.value;
  }

  const notesProvided = body.notes !== undefined;
  let notes: string | null = null;
  if (notesProvided) {
    const v = asOptionalString("notes", body.notes);
    if ("error" in v) return fail(400, v.error);
    notes = v.value;
  }

  const db = getDb();
  const existing = db
    .prepare(`SELECT id, ended_at FROM workout_sessions WHERE id = ?`)
    .get(id) as { id: number; ended_at: string | null } | undefined;
  if (!existing) return fail(404, `Session ${id} not found.`);

  // Default behavior: PATCH with no ended_at on an open session ends it now.
  if (endedAt === undefined && !clearEnded && !notesProvided && existing.ended_at === null) {
    endedAt = nowTimestamp();
  }

  const sets: string[] = [];
  const args: (string | null)[] = [];
  if (endedAt !== undefined) {
    sets.push("ended_at = ?");
    args.push(endedAt);
  } else if (clearEnded) {
    sets.push("ended_at = ?");
    args.push(null);
  }
  if (notesProvided) {
    sets.push("notes = ?");
    args.push(notes);
  }

  if (sets.length === 0) return fail(400, "No updatable fields provided.");

  args.push(String(id));
  db.prepare(`UPDATE workout_sessions SET ${sets.join(", ")} WHERE id = ?`).run(...args);

  const row = db
    .prepare(
      `SELECT id, template_id, started_at, ended_at, notes
         FROM workout_sessions WHERE id = ?`,
    )
    .get(id) as WorkoutSessionRow;

  return ok(row);
}

export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const id = await resolveId(context);
  if (id === null) return fail(400, "Invalid session id.");

  const db = getDb();
  const info = db.prepare(`DELETE FROM workout_sessions WHERE id = ?`).run(id);
  if (info.changes === 0) return fail(404, `Session ${id} not found.`);

  return ok({ id, deleted: true });
}

/** Matches the DB's `datetime('now')` format (UTC, second precision). */
function nowTimestamp(): string {
  return new Date().toISOString().replace("T", " ").slice(0, 19);
}
