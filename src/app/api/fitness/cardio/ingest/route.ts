/**
 * POST /api/fitness/cardio/ingest — auto-capture cardio from the phone.
 *
 * Accepts TWO body shapes (auto-detected):
 *   1. Health Auto Export (HAE) batch — what the iOS app's REST automation POSTs verbatim:
 *        { data: { workouts: [ {...} ], metrics: [...] } }
 *      Mapped + normalized in ./hae.ts. This is the true auto-capture path (Apple Watch → HAE).
 *   2. Manual single object — { activity_type, duration_min, avg_hr?, distance_km?, date?, external_id? }
 *      for a hand-rolled Shortcut or curl.
 *
 * Each normalized workout writes two rows in one transaction:
 *   • cardio_sessions  — rich record (type, duration, avg HR, distance) for the cardio chart
 *   • workout_calendar — a 'cardio' chip on the workout's day → the WORKOUT WEEK auto-populate.
 * Idempotent on external_id, so a re-fired/overlapping export never duplicates.
 *
 * AUTH: bearer-token (CARDIO_TOKEN) — headless, so this sub-path is exempt from the session gate
 * in middleware.ts (only /ingest, not the GET read).
 */

import type Database from "better-sqlite3";
import { writeFileSync } from "fs";

import { getDb } from "@/lib/db";
import { requireBearer } from "@/lib/auth";
import { fail, ok, parseJsonBody } from "../../_lib/http";
import { asIntInRange, asIsoDate, asNonEmptyString, asPositiveNumber } from "../../_lib/validate";
import { isHaePayload, mapHaePayload, mapHaeSteps, type NormalizedCardio } from "./hae";

// better-sqlite3 + process.env secrets require the Node runtime (not Edge).
export const runtime = "nodejs";

const HR_MIN = 30;
const HR_MAX = 260;
// HAE full-history exports embed per-second HR arrays in each workout (~11 MB for ~165 workouts),
// so the cap is generous for a one-time backfill while still bounding memory on this bearer
// endpoint. Ongoing per-workout exports are tiny. ponytail: 50 MB ≈ 700+ workouts; raise if hit.
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_WORKOUTS = 2000; // sanity cap on one batch (years of workouts fit)

/** Human summary for the calendar chip's notes — only the parts we actually have. */
function summarize(n: NormalizedCardio): string {
  const durationRounded = Math.round(n.duration_min);
  return [
    n.distance_km !== null ? `${n.distance_km} km` : null,
    durationRounded > 0 ? `${durationRounded} min` : null,
    n.avg_hr !== null ? `${n.avg_hr} bpm` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/** Writes one normalized session: rich cardio row + calendar chip. Caller wraps in a transaction. */
function insertCardio(db: Database.Database, n: NormalizedCardio): void {
  // Rich cardio row. strava_activity_id is reused as the external dedup key; a NULL id (UNIQUE
  // allows many NULLs) makes the upsert a plain insert.
  db.prepare(
    `INSERT INTO cardio_sessions
       (activity_type, duration_min, avg_hr, distance_km, source, strava_activity_id, logged_at)
     VALUES (?, ?, ?, ?, 'manual', ?, ?)
     ON CONFLICT(strava_activity_id) DO UPDATE SET
       activity_type = excluded.activity_type,
       duration_min  = excluded.duration_min,
       avg_hr        = excluded.avg_hr,
       distance_km   = excluded.distance_km,
       logged_at     = excluded.logged_at`,
  ).run(n.activity_type, n.duration_min, n.avg_hr, n.distance_km, n.external_id, n.date);

  // Calendar chip — the auto-populate. Conflict target repeats the partial index's WHERE
  // (SQLite requires it); a NULL external_id just inserts a fresh row each time.
  db.prepare(
    `INSERT INTO workout_calendar (date, label, type, notes, external_id)
     VALUES (?, ?, 'cardio', ?, ?)
     ON CONFLICT(external_id) WHERE external_id IS NOT NULL DO NOTHING`,
  ).run(n.date, n.activity_type, summarize(n) || null, n.external_id);
}

/** Validates the manual single-object body into a NormalizedCardio, or an error string. */
function validateSingle(body: Record<string, unknown>): { value: NormalizedCardio } | { error: string } {
  const activityType = asNonEmptyString("activity_type", body.activity_type);
  if ("error" in activityType) return { error: activityType.error };

  const durationMin = asPositiveNumber("duration_min", body.duration_min);
  if ("error" in durationMin) return { error: durationMin.error };

  let avg_hr: number | null = null;
  if (body.avg_hr !== undefined && body.avg_hr !== null) {
    const v = asIntInRange("avg_hr", body.avg_hr, HR_MIN, HR_MAX);
    if ("error" in v) return { error: v.error };
    avg_hr = v.value;
  }

  let distance_km: number | null = null;
  if (body.distance_km !== undefined && body.distance_km !== null) {
    const v = asPositiveNumber("distance_km", body.distance_km);
    if ("error" in v) return { error: v.error };
    distance_km = Math.round(v.value * 100) / 100;
  }

  let date: string;
  if (body.date === undefined || body.date === null) {
    date = new Date().toISOString().slice(0, 10);
  } else {
    const v = asIsoDate("date", body.date);
    if ("error" in v) return { error: v.error };
    date = v.value;
  }

  let external_id: string | null = null;
  if (body.external_id !== undefined && body.external_id !== null) {
    const v = asNonEmptyString("external_id", body.external_id);
    if ("error" in v) return { error: v.error };
    external_id = v.value;
  }

  return { value: { activity_type: activityType.value, duration_min: durationMin.value, avg_hr, distance_km, date, external_id } };
}

export async function POST(request: Request): Promise<Response> {
  // Bearer-token gate first — fails closed if CARDIO_TOKEN is unset.
  const unauthorized = requireBearer(request, "CARDIO_TOKEN");
  if (unauthorized) return unauthorized;

  const declaredLen = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BYTES) {
    return fail(413, `Body exceeds ${MAX_BYTES} bytes.`);
  }

  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const { body } = parsed;

  // --- Health Auto Export batch ---------------------------------------------
  // temp diagnostic: write body shape to /data so we can inspect it via ssh
  try {
    writeFileSync("/data/ingest-debug.json", JSON.stringify({
      topKeys: Object.keys(body),
      isHae: isHaePayload(body),
      dataType: typeof body.data,
      dataKeys: body.data && typeof body.data === "object" && !Array.isArray(body.data)
        ? Object.keys(body.data as object) : null,
    }));
  } catch {}
  if (isHaePayload(body)) {
    const { workouts, skipped } = mapHaePayload(body);
    const steps = mapHaeSteps(body);
    if (workouts.length > MAX_WORKOUTS) {
      return fail(413, `Too many workouts (${workouts.length}); cap is ${MAX_WORKOUTS}.`);
    }
    const db = getDb();
    db.transaction(() => {
      for (const w of workouts) insertCardio(db, w);
      if (steps.length > 0) {
        const upsertStep = db.prepare(
          `INSERT INTO steps_log (date, count, source) VALUES (?, ?, 'health-auto-export')
           ON CONFLICT(date) DO UPDATE SET count = excluded.count, source = excluded.source`,
        );
        for (const s of steps) upsertStep.run(s.date, s.count);
      }
    })();
    return ok(
      { received: true, source: "health-auto-export", imported: workouts.length, skipped, steps_imported: steps.length },
      201,
    );
  }

  // --- manual single object --------------------------------------------------
  const single = validateSingle(body);
  if ("error" in single) return fail(400, single.error);

  const db = getDb();
  db.transaction(() => insertCardio(db, single.value))();
  return ok(
    {
      received: true,
      source: "manual",
      imported: 1,
      date: single.value.date,
      activity_type: single.value.activity_type,
    },
    201,
  );
}
