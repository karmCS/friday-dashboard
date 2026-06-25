/**
 * `/api/cafes/[id]` — single-cafe routes.
 *
 *   GET    /api/cafes/[id]  → one cafe
 *   PATCH  /api/cafes/[id]  → partial update (only provided fields)
 *   DELETE /api/cafes/[id]  → remove
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
  toPublicCafe,
  validatePatch,
  type CafePatchInput,
  type CafeRow,
} from "../shared";

/** Next.js 15 passes route params as a Promise. */
interface RouteContext {
  params: Promise<{ id: string }>;
}

const SELECT_SQL = `
  SELECT id, place, city, state, order_item, rating, price_tier, notes,
         photo_path, visited_at, created_at
  FROM cafes
  WHERE id = ?
`;

const DELETE_SQL = `DELETE FROM cafes WHERE id = ?`;

/** Columns a PATCH may touch, mapped to their input keys (all parameterized). */
const PATCHABLE_COLUMNS: ReadonlyArray<keyof CafePatchInput> = [
  "place",
  "city",
  "state",
  "order_item",
  "rating",
  "price_tier",
  "notes",
  "visited_at",
];

/** GET /api/cafes/[id] */
export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return error("invalid cafe id", 400);

  try {
    const row = getDb().prepare(SELECT_SQL).get(id) as CafeRow | undefined;
    if (!row) return error("cafe not found", 404);
    return json({ cafe: toPublicCafe(row) });
  } catch {
    return error("failed to fetch cafe", 500);
  }
}

/** PATCH /api/cafes/[id] — partial update of any subset of the validated fields. */
export async function PATCH(request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return error("invalid cafe id", 400);

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
    UPDATE cafes SET ${setClause} WHERE id = @id
    RETURNING id, place, city, state, order_item, rating, price_tier, notes,
              photo_path, visited_at, created_at
  `;

  try {
    const updated = getDb().prepare(updateSql).get(params) as CafeRow | undefined;
    if (!updated) return error("cafe not found", 404);
    return json({ cafe: toPublicCafe(updated) });
  } catch {
    return error("failed to update cafe", 500);
  }
}

/** DELETE /api/cafes/[id] */
export async function DELETE(_request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return error("invalid cafe id", 400);

  try {
    const info = getDb().prepare(DELETE_SQL).run(id);
    if (info.changes === 0) return error("cafe not found", 404);
    return json({ deleted: id });
  } catch {
    return error("failed to delete cafe", 500);
  }
}
