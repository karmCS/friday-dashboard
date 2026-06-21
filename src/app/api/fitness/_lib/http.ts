/**
 * Small HTTP helpers shared across the fitness API routes.
 *
 * Keeps every route's response shape uniform (a `{ data }` / `{ error, message }`
 * envelope) and centralizes JSON-body parsing + validation so individual handlers stay
 * focused on their table logic. Server-side only — these run in Next.js route handlers.
 */

/** Standard JSON success response. */
export function ok(data: unknown, status = 200): Response {
  return Response.json({ data }, { status });
}

/** Standard JSON error response. `message` is safe, non-sensitive text. */
export function fail(status: number, message: string): Response {
  return Response.json({ error: httpErrorName(status), message }, { status });
}

/** Maps a status code to a short machine-readable error name. */
function httpErrorName(status: number): string {
  switch (status) {
    case 400:
      return "bad_request";
    case 404:
      return "not_found";
    case 405:
      return "method_not_allowed";
    case 409:
      return "conflict";
    default:
      return "error";
  }
}

/**
 * Parses a request's JSON body, returning either the parsed object or a ready-to-return
 * 400 `Response`. We never trust the body shape here — callers validate fields after.
 */
export async function parseJsonBody(
  request: Request,
): Promise<{ body: Record<string, unknown> } | { error: Response }> {
  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return { error: fail(400, "Request body must be valid JSON.") };
  }
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { error: fail(400, "Request body must be a JSON object.") };
  }
  return { body: raw as Record<string, unknown> };
}
