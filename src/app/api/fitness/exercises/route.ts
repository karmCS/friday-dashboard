/**
 * /api/fitness/exercises
 *
 *   GET  — list exercises, optionally filtered by ?muscle_group=Chest (case-insensitive),
 *          ordered by muscle group then name. Drives the search/filter UI when logging a set.
 *   POST — add an exercise. Body:
 *            { name, muscle_group, secondary_muscles?, equipment? }
 *
 * Behind Cloudflare Access (single-user). Muscle groups per the fitness-tracker spec
 * (Chest, Back, Arms, Legs, Core, Shoulders) — accepted loosely (any non-empty string) so
 * the library can grow without a code change.
 */

import { getDb } from "@/lib/db";
import { fail, ok, parseJsonBody } from "../_lib/http";
import { asNonEmptyString, asOptionalString } from "../_lib/validate";

interface ExerciseRow {
  id: number;
  name: string;
  muscle_group: string;
  secondary_muscles: string | null;
  equipment: string | null;
}

export function GET(request: Request): Response {
  const db = getDb();
  const muscleGroup = new URL(request.url).searchParams.get("muscle_group");

  if (muscleGroup && muscleGroup.trim().length > 0) {
    const rows = db
      .prepare(
        `SELECT id, name, muscle_group, secondary_muscles, equipment
           FROM exercises
          WHERE muscle_group = ? COLLATE NOCASE
          ORDER BY name ASC`,
      )
      .all(muscleGroup.trim()) as ExerciseRow[];
    return ok(rows);
  }

  const rows = db
    .prepare(
      `SELECT id, name, muscle_group, secondary_muscles, equipment
         FROM exercises
        ORDER BY muscle_group ASC, name ASC`,
    )
    .all() as ExerciseRow[];
  return ok(rows);
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  const name = asNonEmptyString("name", body.name);
  if ("error" in name) return fail(400, name.error);

  const muscleGroup = asNonEmptyString("muscle_group", body.muscle_group);
  if ("error" in muscleGroup) return fail(400, muscleGroup.error);

  const secondary = asOptionalString("secondary_muscles", body.secondary_muscles);
  if ("error" in secondary) return fail(400, secondary.error);

  const equipment = asOptionalString("equipment", body.equipment);
  if ("error" in equipment) return fail(400, equipment.error);

  const db = getDb();
  const info = db
    .prepare(
      `INSERT INTO exercises (name, muscle_group, secondary_muscles, equipment)
       VALUES (?, ?, ?, ?)`,
    )
    .run(name.value, muscleGroup.value, secondary.value, equipment.value);

  const row = db
    .prepare(
      `SELECT id, name, muscle_group, secondary_muscles, equipment
         FROM exercises WHERE id = ?`,
    )
    .get(info.lastInsertRowid) as ExerciseRow;

  return ok(row, 201);
}
