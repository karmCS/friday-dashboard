/**
 * `GET /api/tacos/[id]/photo` — stream the image attached to a taco.
 *
 * The taco's `photo_path` is an absolute server-filesystem path (written by
 * `POST /api/tacos/photo`), which the browser cannot load directly — this route reads it back.
 * Lookups are by taco id only; the stored path is never taken from the client, and we still
 * verify it resolves inside the photo store before reading (defense-in-depth vs. traversal).
 *
 * Cloudflare Access gates this route at the edge (single-user) — no app-side auth here.
 */

import { getDb } from "@/lib/db";
import { readFile, realpath } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { error, parseId } from "../../shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Photo storage dir on the mounted volume (matches api/tacos/photo/route.ts). */
const PHOTO_DIR = process.env.FRIDAY_PHOTO_DIR ?? "/data/photos";

/** File extension → response content-type (reverse of the upload route's ALLOWED_TYPES). */
const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".heic": "image/heic",
  ".heif": "image/heif",
};

const SELECT_SQL = `SELECT photo_path FROM tacos WHERE id = ?`;

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function GET(_request: Request, context: RouteContext): Promise<Response> {
  const { id: rawId } = await context.params;
  const id = parseId(rawId);
  if (id === null) return error("invalid taco id", 400);

  let row: { photo_path: string | null } | undefined;
  try {
    row = getDb().prepare(SELECT_SQL).get(id) as { photo_path: string | null } | undefined;
  } catch {
    return error("failed to look up taco", 500);
  }
  if (!row) return error("taco not found", 404);
  if (!row.photo_path) return error("no photo for this taco", 404);

  // Confine reads to the photo store. realpath resolves symlinks (and rejects on a missing
  // file) so a symlink planted inside the store can't escape it — resolve() alone wouldn't.
  let dir: string;
  try {
    dir = await realpath(resolve(PHOTO_DIR));
  } catch {
    dir = resolve(PHOTO_DIR);
  }
  let abs: string;
  try {
    abs = await realpath(row.photo_path);
  } catch {
    return error("photo file missing", 404);
  }
  if (abs !== dir && !abs.startsWith(dir + sep)) {
    return error("photo path outside store", 403);
  }

  const mime = MIME_BY_EXT[extname(abs).toLowerCase()] ?? "application/octet-stream";

  try {
    const bytes = await readFile(abs);
    return new Response(new Uint8Array(bytes), {
      status: 200,
      headers: {
        "content-type": mime,
        "content-length": String(bytes.length),
        // Stop the browser from MIME-sniffing the bytes into an executable type.
        "x-content-type-options": "nosniff",
        "content-disposition": `inline; filename="photo${extname(abs)}"`,
        // Stable URL per taco, so don't cache hard — a re-upload must show immediately.
        "cache-control": "private, no-cache",
      },
    });
  } catch {
    return error("photo file missing", 404);
  }
}
