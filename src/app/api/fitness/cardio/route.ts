/**
 * /api/fitness/cardio
 *
 *   GET — list cardio sessions, newest first. Rows are written either manually or by the
 *         Strava webhook (see ./strava-webhook). Read-only here; Access-gated like the other
 *         fitness reads. Drives the cardio kanban cards + the cardio HR trend chart.
 *
 * Behind Cloudflare Access (single-user); no app-side auth on this read route.
 */

import { getDb } from "@/lib/db";
import { ok } from "../_lib/http";

// better-sqlite3 requires the Node runtime (not Edge).
export const runtime = "nodejs";

interface CardioSessionRow {
  id: number;
  activity_type: string;
  duration_min: number;
  avg_hr: number | null;
  distance_km: number | null;
  source: string;
  strava_activity_id: string | null;
  logged_at: string;
}

export function GET(): Response {
  const db = getDb();
  const rows = db
    .prepare(
      `SELECT id, activity_type, duration_min, avg_hr, distance_km,
              source, strava_activity_id, logged_at
         FROM cardio_sessions
        ORDER BY logged_at DESC`,
    )
    .all() as CardioSessionRow[];
  return ok(rows);
}
