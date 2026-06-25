/**
 * The dashboard gate. Every request to friday.markcalip.com hits this first: without a valid
 * session cookie, page navigations are redirected to /login and API calls get a 401. This is the
 * single choke point that puts the whole HUD (and its athlete PII) behind email+password login.
 *
 * EXEMPT (must stay reachable without a session):
 *   - /login and /api/auth/*        → the login surface itself
 *   - /api/snapshot                 → bearer-token (SNAPSHOT_TOKEN), headless Claude Code cron
 *   - /api/fitness/steps            → bearer-token (STEPS_TOKEN), iOS Shortcut bridge
 *   - /api/fitness/cardio/ingest    → bearer-token (CARDIO_TOKEN), iOS Shortcut (Apple Health)
 * These keep their own Authorization checks (see src/lib/auth.ts) — the session gate would break
 * the machine integrations. NOTE: only the /ingest SUB-path is public; GET /api/fitness/cardio
 * (the read) stays login-gated like every other fitness read.
 *
 * Runs on the Edge runtime, so session verification uses Web Crypto only (see src/lib/session.ts).
 */

import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySessionToken } from "@/lib/session";

const PUBLIC_PAGES = ["/login"];
const PUBLIC_APIS = [
  "/api/auth",
  "/api/snapshot",
  "/api/fitness/steps",
  "/api/fitness/cardio/ingest",
];

function isExempt(pathname: string): boolean {
  if (PUBLIC_PAGES.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  if (PUBLIC_APIS.some((p) => pathname === p || pathname.startsWith(p + "/"))) return true;
  return false;
}

export async function middleware(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (isExempt(pathname)) return NextResponse.next();

  const secret = process.env.AUTH_SESSION_SECRET;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const session = secret ? await verifySessionToken(token, secret) : null;
  if (session) return NextResponse.next();

  // Unauthenticated. APIs get a clean 401; everything else is sent to the login page with a
  // `next` param so we can bounce back after sign-in.
  if (pathname.startsWith("/api/")) {
    return new NextResponse(JSON.stringify({ error: "unauthorized", message: "Login required." }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  const url = request.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname && pathname !== "/" ? `?next=${encodeURIComponent(pathname)}` : "";
  return NextResponse.redirect(url);
}

// Run on everything except Next's build assets / favicon (the JS+CSS bundles must load on the
// unauthenticated login page). NOTE: `_next/image` is deliberately NOT excluded — the image
// optimizer serves files from `public/` and would otherwise be an ungated read path. (Sensitive
// uploads are served via /api/* anyway, never from public/.)
//
// `api/fitness/cardio/ingest` is ALSO excluded: it's bearer-gated (not session-gated), and when
// middleware runs on a route Next caps the buffered body (~10MB) and truncates larger ones —
// which corrupts big Health Auto Export batches. Skipping middleware here removes that cap; the
// route's own CARDIO_TOKEN check still protects it.
export const config = {
  matcher: ["/((?!_next/static|favicon.ico|robots.txt|api/fitness/cardio/ingest).*)"],
};
