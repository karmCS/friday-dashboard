/**
 * GET /api/inspector — Athlete Inspector (Deficit drill-down).
 *
 * Two modes:
 *   ?q=<name|uuid>       → athlete search (distinct athletes matching name or fighter UUID)
 *   ?fighter_id=<uuid>   → one athlete's detail: journal timeline (newest-first) + bodyweight
 *
 * ⚠ PRIVACY (load-bearing — see analytics-dashboard.md "Athlete Inspector"):
 *  - This is the ONLY route that returns PII (athlete names, emails, free-text journal). It is
 *    acceptable because the whole host sits behind Cloudflare Access locked to Mark — the
 *    caller is always the authenticated single user. PII never enters `/api/snapshot` or the
 *    wiki markdown; it is read LIVE here on demand.
 *  - Reads Supabase via the `service_role` key SERVER-SIDE ONLY. The key is read from
 *    process.env in this Node-runtime handler and NEVER returned to or referenced by the client.
 *  - Queries are parameterized through supabase-js (`.eq`/`.ilike` send values as encoded
 *    params — no string-built SQL, no raw PostgREST `.or()` with user input).
 *
 * Fail-soft: with no SUPABASE_* env (e.g. the service_role key isn't generated yet), every
 * mode returns empty results with 200 — same posture as the other data clients.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SEARCH_LIMIT = 25;
const TIMELINE_LIMIT = 100;
const BODYWEIGHT_LIMIT = 90;

/** Canonical UUID shape — decides search-by-id vs search-by-name without a raw `.or()`. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Athlete {
  fighter_id: string;
  athlete: string | null;
  email: string | null;
  sport: string | null;
}

interface JournalEntry {
  when_at: string | null;
  kind: string | null;
  source: string | null;
  camp_context: string | null;
  text: string | null;
}

interface BodyweightPoint {
  date: string | null;
  weight: number | null;
}

/** Lazily-built service_role client, or null when env is missing (fail-soft). */
let cached: SupabaseClient | null = null;
function getClient(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}

function json(data: unknown): Response {
  return Response.json({ data });
}

/** Distinct athletes matching a name (ilike) or an exact fighter UUID. */
async function search(client: SupabaseClient, q: string): Promise<Athlete[]> {
  let query = client
    .from("admin_athlete_journal")
    .select("fighter_id, athlete, email, sport")
    .limit(400);

  // Branch on shape — never interpolate user input into a PostgREST `.or()` string. For the
  // name path, escape ilike metacharacters (`%` `_` `\`) so a bare `%` can't force a full dump.
  const safe = q.replace(/[\\%_]/g, "\\$&");
  query = UUID_RE.test(q) ? query.eq("fighter_id", q) : query.ilike("athlete", `%${safe}%`);

  const { data, error } = await query;
  if (error || !data) return [];

  // Dedupe by fighter_id (the journal has many rows per athlete).
  const seen = new Map<string, Athlete>();
  for (const row of data as Athlete[]) {
    if (row.fighter_id && !seen.has(row.fighter_id)) seen.set(row.fighter_id, row);
  }
  return Array.from(seen.values()).slice(0, SEARCH_LIMIT);
}

/** One athlete's journal timeline (newest-first). */
async function timeline(client: SupabaseClient, fighterId: string): Promise<JournalEntry[]> {
  const { data, error } = await client
    .from("admin_athlete_journal")
    .select("when_at, kind, source, camp_context, text, athlete, email, sport")
    .eq("fighter_id", fighterId)
    .order("when_at", { ascending: false })
    .limit(TIMELINE_LIMIT);
  if (error || !data) return [];
  return data as JournalEntry[];
}

/** Best-effort bodyweight trend from `weight_logs` (schema may vary → returns [] on error). */
async function bodyweight(client: SupabaseClient, fighterId: string): Promise<BodyweightPoint[]> {
  try {
    const { data, error } = await client
      .from("weight_logs")
      .select("date, weight")
      .eq("fighter_id", fighterId)
      .order("date", { ascending: true })
      .limit(BODYWEIGHT_LIMIT);
    if (error || !data) return [];
    return data as BodyweightPoint[];
  } catch {
    return [];
  }
}

export async function GET(request: Request): Promise<Response> {
  const client = getClient();
  const { searchParams } = new URL(request.url);
  const fighterId = searchParams.get("fighter_id")?.trim();
  const q = searchParams.get("q")?.trim();

  // Reject a malformed fighter_id before it reaches the DB (defence in depth — `.eq` is already
  // injection-safe, but this keeps the value constrained to the shape we expect).
  if (fighterId && !UUID_RE.test(fighterId)) {
    return Response.json({ error: "bad_request", message: "Invalid fighter_id." }, { status: 400 });
  }

  // No env yet (service_role key pending) → empty but well-formed.
  if (!client) {
    if (fighterId) return json({ mode: "detail", athlete: null, timeline: [], bodyweight: [] });
    return json({ mode: "search", athletes: [] });
  }

  if (fighterId) {
    const [entries, bw] = await Promise.all([
      timeline(client, fighterId),
      bodyweight(client, fighterId),
    ]);
    const first = entries[0] as (JournalEntry & Partial<Athlete>) | undefined;
    const athlete: Athlete | null = first
      ? {
          fighter_id: fighterId,
          athlete: first.athlete ?? null,
          email: first.email ?? null,
          sport: first.sport ?? null,
        }
      : null;
    // Strip the athlete-identity columns back out of timeline rows (header carries them).
    const cleaned: JournalEntry[] = entries.map((e) => ({
      when_at: e.when_at,
      kind: e.kind,
      source: e.source,
      camp_context: e.camp_context,
      text: e.text,
    }));
    return json({ mode: "detail", athlete, timeline: cleaned, bodyweight: bw });
  }

  // Require ≥2 chars: a 1-char `ilike` is a full-table scan with little selectivity.
  if (q && q.length >= 2) {
    return json({ mode: "search", athletes: await search(client, q) });
  }

  return json({ mode: "search", athletes: [] });
}
