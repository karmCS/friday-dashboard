/**
 * GET /api/snapshot — the single non-PII aggregate that powers the dashboard and feeds
 * headless Claude Code (analytics-dashboard.md "the CC-readable layer"). One call returns
 * current state across every property in the STABLE schema defined by {@link Snapshot}
 * (`src/lib/types.ts`); field names must not drift between sessions. Assembly lives in
 * {@link buildSnapshot} (`src/lib/snapshot.ts`), shared with the dashboard's server render.
 *
 * Gating: bearer token via {@link requireBearer}(request, "SNAPSHOT_TOKEN"). The dashboard UI
 * sits behind Cloudflare Access (locked to Mark), but this route is exempt from Access so CC
 * can fetch it headlessly over WireGuard — hence the separate service token. Fails CLOSED:
 * `requireBearer` returns 401 if SNAPSHOT_TOKEN is unset, missing, malformed, or wrong.
 *
 * Caching: `revalidate = 300` (~5 min) matches the wiki spec's "cache ~5 min".
 */

import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth";
import { buildSnapshot } from "@/lib/snapshot";

/** Re-aggregate ~every 5 minutes (wiki spec: "cache ~5 min"). */
export const revalidate = 300;

/** This route reads `process.env` secrets and SQLite — it must run on the Node runtime. */
export const runtime = "nodejs";

export async function GET(request: Request): Promise<Response> {
  // Gate — fails closed if SNAPSHOT_TOKEN is unset / header missing / token wrong.
  const unauthorized = requireBearer(request, "SNAPSHOT_TOKEN");
  if (unauthorized) return unauthorized;

  return NextResponse.json(await buildSnapshot());
}
