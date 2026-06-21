/**
 * /api/fitness/sets
 *
 *   POST — log one set against a session. This is the hot path during a live workout, so
 *          it's a single small insert. Body:
 *            { session_id, exercise_id, set_number, reps, rir? }
 *          Validation: positive ints for ids/set_number, reps > 0, RIR in [0,5] when given.
 *
 * Behind Cloudflare Access (single-user). One row per set — reps + RIR tracked individually
 * for per-set fatigue analysis (fitness-tracker data model).
 */

import { getDb } from "@/lib/db";
import { fail, ok, parseJsonBody } from "../_lib/http";
import { asPositiveInt, asRir } from "../_lib/validate";

interface WorkoutSetRow {
  id: number;
  session_id: number;
  exercise_id: number;
  set_number: number;
  reps: number;
  rir: number | null;
  logged_at: string;
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  const sessionId = asPositiveInt("session_id", body.session_id);
  if ("error" in sessionId) return fail(400, sessionId.error);

  const exerciseId = asPositiveInt("exercise_id", body.exercise_id);
  if ("error" in exerciseId) return fail(400, exerciseId.error);

  const setNumber = asPositiveInt("set_number", body.set_number);
  if ("error" in setNumber) return fail(400, setNumber.error);

  const reps = asPositiveInt("reps", body.reps);
  if ("error" in reps) return fail(400, reps.error);

  // RIR is optional; when present it must be 0–5.
  let rir: number | null = null;
  if (body.rir !== undefined && body.rir !== null) {
    const v = asRir("rir", body.rir);
    if ("error" in v) return fail(400, v.error);
    rir = v.value;
  }

  const db = getDb();

  // Explicit FK guards → clean 400s instead of raw SQLite constraint failures.
  const session = db
    .prepare(`SELECT ended_at FROM workout_sessions WHERE id = ?`)
    .get(sessionId.value) as { ended_at: string | null } | undefined;
  if (!session) return fail(400, `session_id ${sessionId.value} does not exist.`);
  if (session.ended_at !== null) {
    return fail(409, `session ${sessionId.value} has ended; cannot log more sets.`);
  }

  const exercise = db
    .prepare(`SELECT 1 FROM exercises WHERE id = ?`)
    .get(exerciseId.value);
  if (!exercise) return fail(400, `exercise_id ${exerciseId.value} does not exist.`);

  const info = db
    .prepare(
      `INSERT INTO workout_sets (session_id, exercise_id, set_number, reps, rir)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(sessionId.value, exerciseId.value, setNumber.value, reps.value, rir);

  const row = db
    .prepare(
      `SELECT id, session_id, exercise_id, set_number, reps, rir, logged_at
         FROM workout_sets WHERE id = ?`,
    )
    .get(info.lastInsertRowid) as WorkoutSetRow;

  return ok(row, 201);
}
