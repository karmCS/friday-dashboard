/**
 * /api/fitness/templates
 *
 *   GET  — list templates (newest first), each with its ordered exercises
 *          (template_exercises joined to exercises for name/muscle group).
 *   POST — create a template. Body:
 *            { name, exercises?: [{ exercise_id, target_sets? }] }
 *          The exercises array is ordered; `order` is assigned from array position.
 *          Header row + child rows are written in a single transaction.
 *
 * Behind Cloudflare Access (single-user). A template pre-populates a session's expected
 * exercises; Mark fills in actual reps/RIR as he goes (fitness-tracker spec).
 */

import { getDb } from "@/lib/db";
import { fail, ok, parseJsonBody } from "../_lib/http";
import { asNonEmptyString, asPositiveInt } from "../_lib/validate";

interface TemplateRow {
  id: number;
  name: string;
  created_at: string;
}

interface TemplateExerciseRow {
  id: number;
  exercise_id: number;
  exercise_name: string;
  muscle_group: string;
  order: number;
  target_sets: number | null;
}

interface ParsedTemplateExercise {
  exercise_id: number;
  target_sets: number | null;
}

export function GET(): Response {
  const db = getDb();
  const templates = db
    .prepare(`SELECT id, name, created_at FROM workout_templates ORDER BY created_at DESC`)
    .all() as TemplateRow[];

  const exerciseStmt = db.prepare(
    `SELECT te.id, te.exercise_id, e.name AS exercise_name, e.muscle_group,
            te."order" AS "order", te.target_sets
       FROM template_exercises te
       JOIN exercises e ON e.id = te.exercise_id
      WHERE te.template_id = ?
      ORDER BY te."order" ASC`,
  );

  const withExercises = templates.map((t) => ({
    ...t,
    exercises: exerciseStmt.all(t.id) as TemplateExerciseRow[],
  }));

  return ok(withExercises);
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  const name = asNonEmptyString("name", body.name);
  if ("error" in name) return fail(400, name.error);

  // exercises is optional; when present it must be an array of { exercise_id, target_sets? }.
  const exercisesResult = parseExercises(body.exercises);
  if ("error" in exercisesResult) return fail(400, exercisesResult.error);
  const exercises = exercisesResult.value;

  const db = getDb();

  // Validate every referenced exercise exists before writing anything.
  for (const ex of exercises) {
    const exists = db.prepare(`SELECT 1 FROM exercises WHERE id = ?`).get(ex.exercise_id);
    if (!exists) return fail(400, `exercise_id ${ex.exercise_id} does not exist.`);
  }

  const create = db.transaction((tplName: string, items: ParsedTemplateExercise[]) => {
    const info = db
      .prepare(`INSERT INTO workout_templates (name) VALUES (?)`)
      .run(tplName);
    const templateId = Number(info.lastInsertRowid);

    const insertExercise = db.prepare(
      `INSERT INTO template_exercises (template_id, exercise_id, "order", target_sets)
       VALUES (?, ?, ?, ?)`,
    );
    items.forEach((item, index) => {
      insertExercise.run(templateId, item.exercise_id, index, item.target_sets);
    });
    return templateId;
  });

  const templateId = create(name.value, exercises);

  const template = db
    .prepare(`SELECT id, name, created_at FROM workout_templates WHERE id = ?`)
    .get(templateId) as TemplateRow;
  const templateExercises = db
    .prepare(
      `SELECT te.id, te.exercise_id, e.name AS exercise_name, e.muscle_group,
              te."order" AS "order", te.target_sets
         FROM template_exercises te
         JOIN exercises e ON e.id = te.exercise_id
        WHERE te.template_id = ?
        ORDER BY te."order" ASC`,
    )
    .all(templateId) as TemplateExerciseRow[];

  return ok({ ...template, exercises: templateExercises }, 201);
}

/** Validates the optional `exercises` array. Empty/absent → []. */
function parseExercises(
  raw: unknown,
): { value: ParsedTemplateExercise[] } | { error: string } {
  if (raw === undefined || raw === null) return { value: [] };
  if (!Array.isArray(raw)) return { error: "exercises must be an array." };

  const out: ParsedTemplateExercise[] = [];
  for (let i = 0; i < raw.length; i++) {
    const item = raw[i];
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      return { error: `exercises[${i}] must be an object.` };
    }
    const record = item as Record<string, unknown>;

    const exerciseId = asPositiveInt(`exercises[${i}].exercise_id`, record.exercise_id);
    if ("error" in exerciseId) return { error: exerciseId.error };

    let targetSets: number | null = null;
    if (record.target_sets !== undefined && record.target_sets !== null) {
      const ts = asPositiveInt(`exercises[${i}].target_sets`, record.target_sets);
      if ("error" in ts) return { error: ts.error };
      targetSets = ts.value;
    }

    out.push({ exercise_id: exerciseId.value, target_sets: targetSets });
  }
  return { value: out };
}
