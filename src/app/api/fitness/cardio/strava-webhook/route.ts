/**
 * /api/fitness/cardio/strava-webhook
 *
 *   GET  — Strava webhook subscription VALIDATION. When Mark registers the subscription,
 *          Strava issues a GET with ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 *          and expects `{ "hub.challenge": "<value>" }` echoed back. We also check
 *          hub.verify_token against STRAVA_VERIFY_TOKEN when that secret is configured.
 *          (https://developers.strava.com/docs/webhooks/)
 *
 *   POST — webhook EVENT delivery. Strava fires this when Mark saves an activity. Body shape:
 *          { object_type: "activity", aspect_type: "create"|"update"|"delete",
 *            object_id: <activityId>, owner_id, ... }
 *          STUB: this writes a placeholder `cardio_sessions` row keyed by strava_activity_id
 *          so the pipeline is wired end-to-end. The real activity detail (type, duration,
 *          avg HR, distance) requires an authenticated GET /activities/{id}.
 *
 *   // TODO full Strava OAuth: exchange code → tokens, refresh on expiry, then on a "create"
 *   //  event call GET https://www.strava.com/api/v3/activities/{object_id} with the access
 *   //  token and backfill activity_type / duration_min / avg_hr / distance_km on the row.
 *
 * No Cloudflare Access (Strava is headless); validated by the Strava verify token on GET and
 * by the subscription contract on POST. Server-side only.
 */

import { getDb } from "@/lib/db";
import { fail, ok, parseJsonBody } from "../../_lib/http";

const PLACEHOLDER_ACTIVITY = "strava-pending";

/** Strava subscription validation handshake. */
export function GET(request: Request): Response {
  const params = new URL(request.url).searchParams;
  const mode = params.get("hub.mode");
  const challenge = params.get("hub.challenge");
  const verifyToken = params.get("hub.verify_token");

  if (mode !== "subscribe" || !challenge) {
    return fail(400, "Expected a Strava subscription validation request.");
  }

  // If a verify token is configured, enforce it; otherwise accept the handshake (dev).
  const expected = process.env.STRAVA_VERIFY_TOKEN;
  if (expected && verifyToken !== expected) {
    return fail(400, "Strava verify token mismatch.");
  }

  // Strava expects this exact key echoed back verbatim.
  return Response.json({ "hub.challenge": challenge });
}

interface StravaEvent {
  object_type?: unknown;
  aspect_type?: unknown;
  object_id?: unknown;
}

/**
 * Webhook event delivery. STUB: records the activity id as a pending cardio row. Strava
 * requires a 200 promptly, so we always ack even when we ignore the event.
 */
export async function POST(request: Request): Promise<Response> {
  const parsed = await parseJsonBody(request);
  if ("error" in parsed) return parsed.error;
  const event = parsed.body as StravaEvent;

  // Only act on new activity creations; ack everything else (updates/deletes/athlete events).
  const isActivityCreate =
    event.object_type === "activity" && event.aspect_type === "create";

  if (!isActivityCreate) {
    return ok({ received: true, handled: false });
  }

  const activityId =
    typeof event.object_id === "number" || typeof event.object_id === "string"
      ? String(event.object_id)
      : null;
  if (!activityId) {
    // Malformed create event — still ack so Strava doesn't retry forever.
    return ok({ received: true, handled: false });
  }

  const db = getDb();

  // STUB write: a placeholder row with source='strava', deduped on strava_activity_id.
  // duration_min is NOT NULL in the schema, so seed 0 until the real fetch backfills it.
  // ON CONFLICT keeps the webhook idempotent if Strava redelivers the same event.
  db.prepare(
    `INSERT INTO cardio_sessions
       (activity_type, duration_min, avg_hr, distance_km, source, strava_activity_id)
     VALUES (?, 0, NULL, NULL, 'strava', ?)
     ON CONFLICT(strava_activity_id) DO NOTHING`,
  ).run(PLACEHOLDER_ACTIVITY, activityId);

  // TODO full Strava OAuth: fetch GET /activities/{activityId} and backfill the real
  // activity_type / duration_min / avg_hr / distance_km here.

  return ok({ received: true, handled: true, strava_activity_id: activityId });
}
