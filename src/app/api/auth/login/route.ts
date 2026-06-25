/**
 * POST /api/auth/login — single-operator sign-in.
 *
 * Order of checks (all fail closed): rate-limit → Turnstile (bot) → credentials (scrypt). On
 * success, sets the httpOnly signed session cookie. Errors are deliberately generic so the
 * response can't be used to enumerate the email vs the password.
 */

import { NextResponse } from "next/server";
import { verifyCredentials } from "@/lib/credentials";
import { verifyTurnstile } from "@/lib/turnstile";
import { createSessionToken, SESSION_COOKIE, SESSION_TTL_SEC } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Best-effort in-memory throttle (per instance). Single Docker instance → adequate; a brute-force
// across restarts is still bounded by scrypt cost + Turnstile.
const MAX_ATTEMPTS = 8;
const WINDOW_MS = 60_000;
const attempts = new Map<string, { count: number; resetAt: number }>();

function clientIp(request: Request): string | null {
  return (
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    null
  );
}

function allowAttempt(ip: string | null): boolean {
  const key = ip ?? "unknown";
  const now = Date.now();
  const rec = attempts.get(key);
  if (!rec || rec.resetAt < now) {
    attempts.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }
  if (rec.count >= MAX_ATTEMPTS) return false;
  rec.count += 1;
  return true;
}

interface Creds {
  email: string;
  password: string;
  turnstileToken: string | null;
}

/** Accept either JSON (our client) or a classic form POST (progressive enhancement). */
async function readCreds(request: Request): Promise<Creds> {
  const ct = request.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return {
      email: String(body.email ?? ""),
      password: String(body.password ?? ""),
      turnstileToken: typeof body.turnstileToken === "string" ? body.turnstileToken : null,
    };
  }
  const form = await request.formData();
  return {
    email: String(form.get("email") ?? ""),
    password: String(form.get("password") ?? ""),
    turnstileToken: (form.get("cf-turnstile-response") as string) || null,
  };
}

export async function POST(request: Request): Promise<Response> {
  const secret = process.env.AUTH_SESSION_SECRET;
  // Require a real key (≥32 chars) — a short/guessable secret makes the session HMAC forgeable.
  if (!secret || secret.length < 32) {
    return NextResponse.json(
      { error: "auth_unconfigured", message: "Login is not configured on the server." },
      { status: 500 },
    );
  }

  const ip = clientIp(request);
  if (!allowAttempt(ip)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts. Wait a minute and try again." },
      { status: 429 },
    );
  }

  const { email, password, turnstileToken } = await readCreds(request);

  const human = await verifyTurnstile(turnstileToken, ip);
  if (!human) {
    return NextResponse.json(
      { error: "challenge_failed", message: "Bot check failed — complete the challenge and try again." },
      { status: 400 },
    );
  }

  if (!verifyCredentials(email, password)) {
    return NextResponse.json({ error: "invalid_credentials", message: "Invalid email or password." }, { status: 401 });
  }

  attempts.delete(ip ?? "unknown");
  const token = await createSessionToken(email.trim().toLowerCase(), secret);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production", // behind cloudflared TLS in prod; http in dev
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SEC,
  });
  return response;
}
