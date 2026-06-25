/**
 * `/api/tacos/[id]` — single-taco routes.
 *
 *   GET    /api/tacos/[id]  → one taco
 *   PATCH  /api/tacos/[id]  → partial update (only provided fields)
 *   DELETE /api/tacos/[id]  → remove
 *
 * All queries are parameterized; `[id]` is parsed to a positive integer before any SQL.
 * Cloudflare Access gates these routes at the edge (single-user) — no app-side auth here.
 */

import { getDb } from "@/lib/db";
import {
  error,
  json,
  parseId,
  readJson,
  toPublicTaco,
  validatePatch,
  type TacoPatchInput,
  type TacoRow,
} from "../shared";

/** Next.js 15 passes route params as a Promise. */
interface RouteContext {
  params: Promise<{ id: string }>;
}

const SELECT_SQL = `
  SELECT id, place, city, state, taco_type, rating, price_tier, notes,
         photo_path, visited_at, created_at
  FROM tacos
  WHERE id = ?
`;

const DELETE_SQL = `DELETE FROM tacos WHERE id = ?`;

/** Columns a PATCH may touch, mapped to their input keys (all parameterized). */
const PATCHABLE_COLUMNS: ReadonlyArray<keyof TacoPatchInput> = [
  "place",
  "city",
  "state",
  "taco_type",
  "rating",
  "price_tier",
  "notes",
  "visited_at",
];

/** GET /api/tacos/[id] */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return error("invalid taco id", 400);

  try {
    const row = getDb().prepare(SELECT_SQL).get(id) as TacoRow | undefined;
    if (!row) return error("taco not found", 404);
    return json({ taco: toPublicTaco(row) });
  } catch {
    return error("failed to fetch taco", 500);
  }
}

/** PATCH /api/tacos/[id] — partial update of any subset of the validated fields. */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return error("invalid taco id", 400);

  const body = await readJson(request);
  if (body === null) return error("invalid or empty JSON body", 400);

  const result = validatePatch(body);
  if (!result.ok) return error("validation failed", 422, result.errors);

  const patch = result.value;

  // Build a parameterized SET clause from only the columns present in the validated patch.
  const columns = PATCHABLE_COLUMNS.filter((col) => col in patch);
  const setClause = columns.map((col) => `${col} = @${col}`).join(", ");
  const params: Record<string, unknown> = { id };
  for (const col of columns) params[col] = patch[col];

  const updateSql = `
    UPDATE tacos SET ${setClause} WHERE id = @id
    RETURNING id, place, city, state, taco_type, rating, price_tier, notes,
              photo_path, visited_at, created_at
  `;

  try {
    const updated = getDb().prepare(updateSql).get(params) as TacoRow | undefined;
    if (!updated) return error("taco not found", 404);
    return json({ taco: toPublicTaco(updated) });
  } catch {
    return error("failed to update taco", 500);
  }
}

/** DELETE /api/tacos/[id] */
export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return error("invalid taco id", 400);

  try {
    const info = getDb().prepare(DELETE_SQL).run(id);
    if (info.changes === 0) return error("taco not found", 404);
    return json({ deleted: id });
  } catch {
    return error("failed to delete taco", 500);
  }
}
