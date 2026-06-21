/**
 * /api/fitness/sessions
 *
 *   GET  — list workout sessions, newest first (optionally filtered by ?active=1 to return
 *          only in-progress sessions, i.e. ended_at IS NULL).
 *   POST — start a new session. Body: { template_id?: number|null, notes?: string|null }.
 *          started_at defaults to now (DB-side). Returns the created row.
 *
 * Behind Cloudflare Access (single-user); no app-side auth on these CRUD routes.
 */

import { getDb } from "@/lib/db";
import { fail, ok, parseJsonBody } from "../_lib/http";
import { asOptionalString, asPositiveInt } from "../_lib/validate";

interface WorkoutSessionRow {
  id: number;
  template_id: number | null;
  started_at: string;
  ended_at: string | null;
  notes: string | null;
}

export function GET(request: Request): Response {
  const db = getDb();
  const url = new URL(request.url);
  const activeOnly = url.searchParams.get("active") === "1";

  const sql = activeOnly
    ? `SELECT id, template_id, started_at, ended_at, notes
         FROM workout_sessions
        WHERE ended_at IS NULL
        ORDER BY started_at DESC`
    : `SELECT id, template_id, started_at, ended_at, notes
         FROM workout_sessions
        ORDER BY started_at DESC`;

  const rows = db.prepare(sql).all() as WorkoutSessionRow[];
  return ok(rows);
}

export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  // template_id is optional (freeform sessions have none); validate when present.
  let templateId: number | null = null;
  if (body.template_id !== undefined && body.template_id !== null) {
    const v = asPositiveInt("template_id", body.template_id);
    if ("error" in v) return fail(400, v.error);
    templateId = v.value;
  }

  const notesV = asOptionalString("notes", body.notes);
  if ("error" in notesV) return fail(400, notesV.error);

  const db = getDb();

  // Guard the FK explicitly to return a clean 400 instead of a SQLite constraint error.
  if (templateId !== null) {
    const exists = db
      .prepare(`SELECT 1 FROM workout_templates WHERE id = ?`)
      .get(templateId);
    if (!exists) return fail(400, `template_id ${templateId} does not exist.`);
  }

  const info = db
    .prepare(`INSERT INTO workout_sessions (template_id, notes) VALUES (?, ?)`)
    .run(templateId, notesV.value);

  const row = db
    .prepare(
      `SELECT id, template_id, started_at, ended_at, notes
         FROM workout_sessions WHERE id = ?`,
    )
    .get(info.lastInsertRowid) as WorkoutSessionRow;

  return ok(row, 201);
}
