/**
 * `POST /api/tacos/photo` — attach a photo to an existing taco.
 *
 * Accepts a `multipart/form-data` body with:
 *   - `taco_id`  (text)  — the taco to attach the photo to
 *   - `photo`    (file)  — an image file (jpeg/png/webp/gif/heic)
 *
 * The file is written under `/data/photos/` (same Docker volume as the SQLite DB) with a
 * generated, collision-resistant name, and its path is stored on the taco row's
 * `photo_path` column. Returns the updated taco.
 *
 * Cloudflare Access gates this route at the edge (single-user) — no app-side auth here.
 */

import { getDb } from "@/lib/db";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { error, json, parseId, toPublicTaco, type TacoRow } from "../shared";

export const runtime = "nodejs";

/**
 * Detect a supported image from its leading bytes (magic number), returning the canonical
 * extension or null. The stored extension is derived from CONTENT — never from the
 * client-supplied MIME type — so a polyglot/HTML payload mislabeled as image/jpeg can't be
 * stored with an image extension and later served as script.
 */
function sniffImage(b: Buffer): string | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return ".jpg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return ".png";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return ".gif"; // "GIF8"
  if (b.length >= 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return ".webp";
  if (b.length >= 12 && b.toString("ascii", 4, 8) === "ftyp") {
    const brand = b.toString("ascii", 8, 12).toLowerCase();
    if (brand.startsWith("hei") || brand.startsWith("hev") || brand.startsWith("mif") || brand.startsWith("msf")) return ".heic";
  }
  return null;
}

/** Photo storage dir on the mounted volume (override for local dev via FRIDAY_PHOTO_DIR). */
const PHOTO_DIR = process.env.FRIDAY_PHOTO_DIR ?? "/data/photos";

/** 8 MB ceiling — phone photos comfortably fit; rejects accidental huge uploads. */
const MAX_BYTES = 8 * 1024 * 1024;

/** Accepted image MIME types → canonical file extension. */
const ALLOWED_TYPES: Record<string, string> = {
  "image/jpeg": ".jpg",
  "image/png": ".png",
  "image/webp": ".webp",
  "image/gif": ".gif",
  "image/heic": ".heic",
  "image/heif": ".heif",
};

const SELECT_SQL = `SELECT id FROM tacos WHERE id = ?`;

const UPDATE_PHOTO_SQL = `
  UPDATE tacos SET photo_path = @photo_path WHERE id = @id
  RETURNING id, place, city, state, taco_type, rating, price_tier, notes,
            photo_path, visited_at, created_at
`;

export async function POST(request: Request): Promise<Response> {
  // Parse multipart form. Reject non-multipart bodies up front.
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return error("expected multipart/form-data with a 'photo' file", 400);
  }

  const tacoIdRaw = form.get("taco_id");
  if (typeof tacoIdRaw !== "string") {
    return error("taco_id is required", 400);
  }
  const tacoId = parseId(tacoIdRaw);
  if (tacoId === null) return error("invalid taco_id", 400);

  const photo = form.get("photo");
  if (!(photo instanceof File)) {
    return error("a 'photo' file is required", 400);
  }
  if (photo.size === 0) {
    return error("photo file is empty", 400);
  }
  if (photo.size > MAX_BYTES) {
    return error(`photo exceeds ${MAX_BYTES} bytes`, 413);
  }

  // Cheap early reject on the declared type; the authoritative check is the content sniff below.
  if (!ALLOWED_TYPES[photo.type]) {
    return error(
      `unsupported image type '${photo.type}'; allowed: ${Object.keys(ALLOWED_TYPES).join(", ")}`,
      415,
    );
  }

  // Confirm the taco exists before reading/writing anything.
  let exists: { id: number } | undefined;
  try {
    exists = getDb().prepare(SELECT_SQL).get(tacoId) as { id: number } | undefined;
  } catch {
    return error("failed to look up taco", 500);
  }
  if (!exists) return error("taco not found", 404);

  // Read the bytes and derive the stored extension from the real content (NOT the client MIME),
  // so a mislabeled HTML/JS/polyglot payload can't be stored with an image extension.
  let bytes: Buffer;
  try {
    bytes = Buffer.from(await photo.arrayBuffer());
  } catch {
    return error("failed to read uploaded file", 400);
  }
  const ext = sniffImage(bytes);
  if (!ext) {
    return error("file content is not a supported image (jpeg/png/webp/gif/heic)", 415);
  }

  // Generate a safe filename; ignore any client-supplied name to avoid path traversal.
  const filename = `${tacoId}-${randomUUID()}${ext}`;
  const absPath = join(PHOTO_DIR, filename);

  try {
    await mkdir(PHOTO_DIR, { recursive: true });
    await writeFile(absPath, bytes);
  } catch {
    return error("failed to save photo", 500);
  }

  try {
    const updated = getDb()
      .prepare(UPDATE_PHOTO_SQL)
      .get({ id: tacoId, photo_path: absPath }) as TacoRow | undefined;
    if (!updated) return error("taco not found", 404);
    return json({ taco: toPublicTaco(updated) });
  } catch {
    return error("failed to record photo path", 500);
  }
}
