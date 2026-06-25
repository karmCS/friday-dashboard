/**
 * GET /api/inspector — Athlete Inspector (Deficit drill-down).
 *
 * Two modes:
 *   (no params)          → roster: ALL athletes (summary row each), for the scrollable list.
 *   ?fighter_id=<uuid>   → detail: one athlete's summary + chat transcript + daily macros +
 *                          bodyweight trend + weekly check-ins.
 *
 * The whole roster is returned and filtered CLIENT-SIDE (name / sport / weight class / age) —
 * the dataset is small and behind single-operator Cloudflare Access, so an instant in-memory
 * filter beats a round-trip per keystroke.
 *
 * See ./shared.ts for the privacy posture (PII via service_role, server-only, fail-soft).
 */

import { getClient, json, parseRoster, ROSTER_COLUMNS, UUID_RE, type RosterAthlete } from "./shared";
import { loadChat, loadMacros, loadBodyweight, loadCheckins } from "./detail";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROSTER_LIMIT = 1000;

/** Full athlete roster (one summary row each), name-ordered by the view. */
async function loadRoster(client: NonNullable<ReturnType<typeof getClient>>): Promise<RosterAthlete[]> {
  const { data, error } = await client
    .from("admin_athlete_roster")
    .select(ROSTER_COLUMNS)
    .order("athlete", { ascending: true })
    .limit(ROSTER_LIMIT);
  if (error || !data) return [];
  return (data as unknown[]).map(parseRoster).filter((a): a is RosterAthlete => a !== null);
}

/** One athlete's summary row (header stats), or null when not found. */
async function loadSummary(
  client: NonNullable<ReturnType<typeof getClient>>,
  fighterId: string,
): Promise<RosterAthlete | null> {
  const { data, error } = await client
    .from("admin_athlete_roster")
    .select(ROSTER_COLUMNS)
    .eq("fighter_id", fighterId)
    .limit(1);
  if (error || !data || data.length === 0) return null;
  return parseRoster(data[0]);
}

export async function GET(request: Request): Promise<Response> {
  const client = getClient();
  const { searchParams } = new URL(request.url);
  const fighterId = searchParams.get("fighter_id")?.trim();

  // Reject a malformed fighter_id before it reaches the DB (defence in depth).
  if (fighterId && !UUID_RE.test(fighterId)) {
    return Response.json({ error: "bad_request", message: "Invalid fighter_id." }, { status: 400 });
  }

  // No env yet (service_role key pending) → empty but well-formed.
  if (!client) {
    if (fighterId) {
      return json({ mode: "detail", athlete: null, chat: [], macros: { days: [], targets: null }, bodyweight: [], checkins: [] });
    }
    return json({ mode: "list", athletes: [] });
  }

  if (fighterId) {
    const [athlete, chat, macros, bodyweight, checkins] = await Promise.all([
      loadSummary(client, fighterId),
      loadChat(client, fighterId),
      loadMacros(client, fighterId),
      loadBodyweight(client, fighterId),
      loadCheckins(client, fighterId),
    ]);
    return json({ mode: "detail", athlete, chat, macros, bodyweight, checkins });
  }

  return json({ mode: "list", athletes: await loadRoster(client) });
}
