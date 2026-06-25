/**
 * `/api/cafes` — collection routes.
 *
 *   GET  /api/cafes  → full list, newest first
 *   POST /api/cafes  → create a new cafe (place, city, state, order_item required;
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
  toPublicCafe,
  validateCreate,
  type CafeRow,
} from "./shared";

/** Newest-first by visit date, then by insert order — keeps same-day entries stable. */
const LIST_SQL = `
  SELECT id, place, city, state, order_item, rating, price_tier, notes,
         photo_path, visited_at, created_at
  FROM cafes
  ORDER BY visited_at DESC, id DESC
`;

const INSERT_SQL = `
  INSERT INTO cafes (place, city, state, order_item, rating, price_tier, notes, visited_at)
  VALUES (@place, @city, @state, @order_item, @rating, @price_tier, @notes,
          COALESCE(@visited_at, date('now')))
  RETURNING id, place, city, state, order_item, rating, price_tier, notes,
            photo_path, visited_at, created_at
`;

/** GET /api/cafes — every cafe, newest first. */
export function GET(): Response {
  try {
    const rows = getDb().prepare(LIST_SQL).all() as CafeRow[];
    return json({ cafes: rows.map(toPublicCafe) });
  } catch {
    return error("failed to list cafes", 500);
  }
}

/** POST /api/cafes — create a cafe from a validated JSON body. */
export async function POST(request: Request): Promise<Response> {
  const body = await readJson(request);
  if (body === null) {
    return error("invalid or empty JSON body", 400);
  }

  const result = validateCreate(body);
  if (!result.ok) {
    return error("validation failed", 422, result.errors);
  }

  const { place, city, state, order_item, rating, price_tier, notes, visited_at } =
    result.value;

  try {
    const created = getDb()
      .prepare(INSERT_SQL)
      .get({
        place,
        city,
        state,
        order_item,
        rating,
        price_tier,
        notes,
        visited_at,
      }) as CafeRow;
    return json({ cafe: toPublicCafe(created) }, 201);
  } catch {
    return error("failed to create cafe", 500);
  }
}
