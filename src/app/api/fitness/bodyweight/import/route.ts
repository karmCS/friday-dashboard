/**
 * POST /api/fitness/bodyweight/import — bulk CSV import of historical bodyweight.
 *
 * Body: raw CSV text (Content-Type text/csv or text/plain). Columns: `date, weight, unit?`.
 * A header row is auto-detected and skipped. Dates accept `YYYY-MM-DD` or `M/D/YYYY`;
 * unit defaults to `lb`. Each valid row upserts one day (one row per date), so re-importing
 * an overlapping export is idempotent. Returns { imported, skipped, errors }.
 *
 * Behind Cloudflare Access (single-user, in-app bulk import). The daily single-entry path is
 * the bearer-gated `POST /api/fitness/bodyweight` (iOS Shortcut) instead.
 *
 * ponytail: naive comma split — date/weight/unit have no embedded commas, so a full RFC-4180
 * quoted-field parser would be over-engineering. Upgrade if a source ever quotes cells.
 */

import { getDb } from "@/lib/db";
import { fail, ok } from "../../_lib/http";

// better-sqlite3 requires the Node runtime (not Edge).
export const runtime = "nodejs";

const ALLOWED_UNITS = new Set(["lb", "kg"]);
const MAX_ROWS = 5000; // sanity cap on one import
const MAX_ERRORS = 25; // cap the reported reasons so the response stays small

interface ImportResult {
  imported: number;
  skipped: number;
  errors: string[];
}

/** Normalize a date cell to YYYY-MM-DD, or null if unrecognized. Accepts ISO + M/D/YYYY. */
function normalizeDate(raw: string): string | null {
  const s = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    const d = new Date(`${s}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s ? null : s;
  }
  const us = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (us) {
    const [, mm, dd, yyyy] = us;
    const iso = `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
    const d = new Date(`${iso}T00:00:00Z`);
    return Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== iso ? null : iso;
  }
  return null;
}

export async function POST(request: Request): Promise<Response> {
  // Bound the body before buffering it — ~2 MB is far above 5000 rows of "date,weight,unit".
  const MAX_BYTES = 2 * 1024 * 1024;
  const declaredLen = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLen) && declaredLen > MAX_BYTES) {
    return fail(413, `CSV body exceeds ${MAX_BYTES} bytes.`);
  }

  let text: string;
  try {
    text = await request.text();
  } catch {
    return fail(400, "Could not read request body.");
  }
  if (!text.trim()) return fail(400, "CSV body is empty.");

  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);
  if (lines.length === 0) return fail(400, "CSV has no rows.");
  if (lines.length > MAX_ROWS + 1) return fail(413, `CSV exceeds ${MAX_ROWS} rows.`);

  // Treat the first line as a header when its weight cell isn't numeric (e.g. "date,weight").
  const firstCells = lines[0].split(",");
  const looksLikeHeader =
    firstCells.length >= 2 && !Number.isFinite(Number((firstCells[1] ?? "").trim()));
  const dataLines = looksLikeHeader ? lines.slice(1) : lines;

  const db = getDb();
  const upsert = db.prepare(
    `INSERT INTO bodyweight_log (date, weight, unit) VALUES (?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET weight = excluded.weight, unit = excluded.unit`,
  );

  const result: ImportResult = { imported: 0, skipped: 0, errors: [] };
  const pushErr = (msg: string) => {
    if (result.errors.length < MAX_ERRORS) result.errors.push(msg);
  };

  const run = db.transaction(() => {
    dataLines.forEach((line, i) => {
      const rowNo = looksLikeHeader ? i + 2 : i + 1;
      const cells = line.split(",").map((c) => c.trim());

      const date = normalizeDate(cells[0] ?? "");
      if (date === null) {
        result.skipped++;
        pushErr(`row ${rowNo}: unrecognized date '${cells[0] ?? ""}'`);
        return;
      }

      const weight = Number(cells[1]);
      if (!Number.isFinite(weight) || weight <= 0) {
        result.skipped++;
        pushErr(`row ${rowNo}: invalid weight '${cells[1] ?? ""}'`);
        return;
      }

      const unit = (cells[2] ?? "").toLowerCase() || "lb";
      if (!ALLOWED_UNITS.has(unit)) {
        result.skipped++;
        pushErr(`row ${rowNo}: unit must be lb or kg, got '${cells[2] ?? ""}'`);
        return;
      }

      upsert.run(date, weight, unit);
      result.imported++;
    });
  });
  run();

  return ok(result, result.imported > 0 ? 201 : 200);
}
