/**
 * Bearer-token auth for the routes that can't sit behind Cloudflare Access:
 *   - `GET /api/snapshot`  → SNAPSHOT_TOKEN (headless Claude Code fetch)
 *   - `POST /api/fitness/steps` → STEPS_TOKEN (iOS Shortcut bridge)
 *
 * Cloudflare Access gates everything else (locked to Mark's email), so there's no
 * app-side session code — only these two token-gated exceptions.
 */

/**
 * Validates the `Authorization: Bearer <token>` header against the secret named by
 * `envName` (e.g. "SNAPSHOT_TOKEN").
 *
 * @returns `null` when the header is present and matches `process.env[envName]` — i.e.
 *          the caller is authorized and the handler should proceed. Otherwise returns a
 *          ready-to-return `401` `Response` (missing/misconfigured secret, missing header,
 *          or token mismatch).
 *
 * Usage in a route handler:
 * ```ts
 * const unauthorized = requireBearer(request, "SNAPSHOT_TOKEN");
 * if (unauthorized) return unauthorized;
 * // ...authorized work...
 * ```
 */
export function requireBearer(request: Request, envName: string): Response | null {
  const expected = process.env[envName];

  // Fail closed if the secret isn't configured — never treat an unset env as "open".
  if (!expected) {
    return unauthorized("Server auth is not configured.");
  }

  const header = request.headers.get("authorization");
  if (!header) {
    return unauthorized("Missing Authorization header.");
  }

  const [scheme, token] = header.split(" ");
  if (scheme !== "Bearer" || !token) {
    return unauthorized("Malformed Authorization header.");
  }

  if (!timingSafeEqual(token, expected)) {
    return unauthorized("Invalid token.");
  }

  return null;
}

/** Builds a uniform 401 JSON response. */
function unauthorized(message: string): Response {
  return new Response(JSON.stringify({ error: "unauthorized", message }), {
    status: 401,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Length-constant string comparison to avoid leaking token length/contents via timing.
 * Pure JS (no Buffer dependency) so it runs in any runtime.
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
