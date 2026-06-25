/**
 * POST /api/grades/tick — advance the BODY-stat streak for the current ISO week.
 *
 * Meant to run once a week (Sunday 23:59 / Monday 00:01) from the same GitHub-Actions cron
 * that hits /api/snapshot. Computes this week's base BODY grade and, if it's S, credits the
 * streak (idempotent within a week via `last_s_week`); a sub-S week pauses, never resets, the
 * streak. BUILDER/SYSTEM/TOTAL are computed live in the snapshot and need no tick.
 *
 * Gating: bearer SNAPSHOT_TOKEN — the same headless service token the cron already holds, since
 * this route (like /api/snapshot) is exempt from Cloudflare Access. Fails CLOSED.
 */

import { NextResponse } from "next/server";

import { requireBearer } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { computeAndPersistBodyGrade } from "@/lib/grades";

/** Reads SQLite + env secrets — Node runtime only. */
export const runtime = "nodejs";

export async function POST(request: Request): Promise<Response> {
  const unauthorized = requireBearer(request, "SNAPSHOT_TOKEN");
  if (unauthorized) return unauthorized;

  const body = computeAndPersistBodyGrade(getDb());
  return NextResponse.json({ body });
}
