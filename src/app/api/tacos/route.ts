/**
 * `/api/tacos` — collection routes.
 *
 *   GET  /api/tacos  → full list, newest first
 *   POST /api/tacos  → create a new taco (place, city, state, taco_type required;
 *                      rating 1–10, price_tier $/$$/$$$, notes, visited_at optional)
 *
 * Backed by SQLite via `getDb()` (better-sqlite3). All queries are parameterized; all input
 * is validated in shared.ts before it reaches SQL. Cloudflare Access gates this route at the
 * edge (single-user), so there is no app-side auth here.
 */

import { getDb } from "@/lib/db";
import {
  error,
  json,
  readJson,
  toPublicTaco,
  validateCreate,
  type TacoRow,
} from "./shared";

/** Newest-first by visit date, then by insert order — keeps same-day entries stable. */
const LIST_SQL = `
  SELECT id, place, city, state, taco_type, rating, price_tier, notes,
         photo_path, visited_at, created_at
  FROM tacos
  ORDER BY visited_at DESC, id DESC
`;

const INSERT_SQL = `
  INSERT INTO tacos (place, city, state, taco_type, rating, price_tier, notes, visited_at)
  VALUES (@place, @city, @state, @taco_type, @rating, @price_tier, @notes,
          COALESCE(@visited_at, date('now')))
  RETURNING id, place, city, state, taco_type, rating, price_tier, notes,
            photo_path, visited_at, created_at
`;

/** GET /api/tacos — every taco, newest first. */
export function GET(): Response {
  try {
    const rows = getDb().prepare(LIST_SQL).all() as TacoRow[];
    return json({ tacos: rows.map(toPublicTaco) });
  } catch {
    return error("failed to list tacos", 500);
  }
}

/** POST /api/tacos — create a taco from a validated JSON body. */
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (body === null) {
    return error("invalid or empty JSON body", 400);
  }

  const result = validateCreate(body);
  if (!result.ok) {
    return error("validation failed", 422, result.errors);
  }

  const { place, city, state, taco_type, rating, price_tier, notes, visited_at } =
    result.value;

  try {
    const created = getDb()
      .prepare(INSERT_SQL)
      .get({
        place,
        city,
        state,
        taco_type,
        rating,
        price_tier,
        notes,
        visited_at,
      }) as TacoRow;
    return json({ taco: toPublicTaco(created) }, 201);
  } catch {
    return error("failed to create taco", 500);
  }
}
