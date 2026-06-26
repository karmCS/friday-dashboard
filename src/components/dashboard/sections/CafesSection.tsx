"use client";

import { CSSProperties, ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { t, tabularNum, buttonReset } from "@/components/dashboard/tokens";
import { Skeleton, srOnly } from "@/components/dashboard/ui";
import { fmtNum } from "@/lib/format";
import type { Cafes } from "@/lib/types";
import { photoUrlFor, validatePhoto, PHOTO_ACCEPT, PHOTO_HINT } from "./cafes/photo";
import { EntryDetail, type DetailPalette } from "./shared/entry-detail";

/**
 * Cafe Tracker section (warm espresso palette — tonal sibling of the Taco Tracker, distinct
 * from its magenta). Same flow as tacos by design: a summary KPI strip from the {@link Cafes}
 * prop, the full log self-fetched from `GET /api/cafes`, a sortable table, a rating histogram,
 * a by-city grouping, and an optimistic quick-log form with optional photo.
 *
 * The cafe analogue of the taco's `taco_type` is `order_item` (the drink/item ordered).
 */

// --- API shape (narrowed from unknown — never trust the wire) -----------------

const PRICE_TIERS = ["$", "$$", "$$$"] as const;
type PriceTier = (typeof PRICE_TIERS)[number];

/** Human names for price tiers — used as accessible labels on the otherwise glyph-only chips. */
const PRICE_TIER_NAMES: Record<PriceTier, string> = {
  $: "Budget",
  $$: "Moderate",
  $$$: "Expensive",
};

/** One cafe row exactly as returned by `GET /api/cafes` (mirrors PublicCafe in shared.ts). */
interface CafeApiRow {
  id: number;
  place: string;
  city: string;
  state: string;
  order_item: string;
  rating: number | null;
  price_tier: string | null;
  notes: string | null;
  has_photo: boolean;
  visited_at: string;
  created_at: string;
}

/** A row in component state: the wire row plus an optional just-picked-photo object URL. */
type LogRow = CafeApiRow & { localPhotoUrl?: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrows one unknown row into a {@link CafeApiRow}, or null when it is malformed. */
function parseRow(value: unknown): CafeApiRow | null {
  if (!isRecord(value)) return null;
  const { id, place, city, state, order_item, rating, price_tier, notes, has_photo, visited_at, created_at } = value;

  if (typeof id !== "number") return null;
  if (typeof place !== "string" || typeof city !== "string") return null;
  if (typeof state !== "string" || typeof order_item !== "string") return null;
  if (typeof visited_at !== "string" || typeof created_at !== "string") return null;

  return {
    id, place, city, state, order_item, visited_at, created_at,
    rating: typeof rating === "number" ? rating : null,
    price_tier: typeof price_tier === "string" ? price_tier : null,
    notes: typeof notes === "string" ? notes : null,
    has_photo: has_photo === true,
  };
}

/** Narrows the whole `GET /api/cafes` body into a row array (drops malformed rows). */
function parseListResponse(value: unknown): CafeApiRow[] {
  if (!isRecord(value) || !Array.isArray(value.cafes)) return [];
  return value.cafes
    .map(parseRow)
    .filter((row): row is CafeApiRow => row !== null);
}

/** Narrows the POST response — either `{ cafe: row }` or a bare row. Null when unusable. */
function parsePostResponse(value: unknown): CafeApiRow | null {
  if (isRecord(value) && "cafe" in value) return parseRow((value as Record<string, unknown>).cafe);
  return parseRow(value);
}

// --- style tokens (espresso art palette; text/frame tokenized via foundation) --

const DISPLAY = t.font.display;
const BODY = t.font.body;
const MONO = t.font.mono;

// Warm espresso art (the cafe-section signature): card frame + accent gradient stops.
const ESPRESSO_FRAME = "linear-gradient(160deg,#2a1a10,#150c07)";
const FRAME_BORDER = "rgba(226,184,124,.42)";
const ACCENT_CARAMEL = "#e3a866";
const ACCENT_ROAST = "#c97b3c";
const ACCENT_GOLD = "#f0c878";

const RATING_MIN = 1;
const RATING_MAX = 10;

/** An espresso Questism card frame with the angled clip-path corner. */
const card = (extra?: CSSProperties): CSSProperties => ({
  background: ESPRESSO_FRAME,
  clipPath:
    "polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))",
  boxShadow: `inset 0 0 0 2px ${FRAME_BORDER}`,
  padding: "18px 20px",
  ...extra,
});

const kicker: CSSProperties = { fontFamily: BODY, fontWeight: 700, fontSize: 10, letterSpacing: ".14em", color: "#c2a17f" };

const cardHeading: CSSProperties = { fontFamily: DISPLAY, fontSize: 16, color: "#f6e6d2", letterSpacing: ".03em" };

// --- helpers ------------------------------------------------------------------

/** Rating → colour: green high, gold mid, salmon low (warm-leaning to match the palette). */
function ratingColor(rating: number | null): string {
  if (rating === null) return "#a88a6a";
  if (rating >= 8) return "#8fe6a8";
  if (rating >= 6) return ACCENT_GOLD;
  return "#f0a07e";
}

/** Espresso palette for the shared full-screen EntryDetail. */
const CAFE_DETAIL_PALETTE: DetailPalette = {
  frameBg: ESPRESSO_FRAME,
  frameBorder: FRAME_BORDER,
  accent: ACCENT_CARAMEL,
  accent2: ACCENT_ROAST,
  gold: ACCENT_GOLD,
  heading: "#f6e6d2",
  body: "#e9d6bf",
  muted: "#c2a17f",
  dim: "#a88a6a",
  inputBg: "#1d130c",
  ratingColor,
};

/** A row's thumbnail (presentational; the cell's button owns the click). */
function RowThumb({ row }: { row: LogRow }) {
  const [failed, setFailed] = useState(false);
  const src = photoUrlFor(row);
  if (!src) return <span aria-hidden style={{ opacity: 0.28, fontSize: 14 }}>☕</span>;
  if (failed)
    return (
      <span aria-hidden style={{ display: "flex", width: 30, height: 30, alignItems: "center", justifyContent: "center", borderRadius: 6, fontSize: 8, fontWeight: 800, color: "#e3a866", background: "#1d130c", boxShadow: `inset 0 0 0 1px ${FRAME_BORDER}` }}>
        IMG
      </span>
    );
  return (
    /* eslint-disable-next-line @next/next/no-img-element -- user upload served from our own API */
    <img src={src} alt="" onError={() => setFailed(true)} style={{ width: 30, height: 30, objectFit: "cover", borderRadius: 6, display: "block", boxShadow: `inset 0 0 0 1px ${FRAME_BORDER}` }} />
  );
}

type SortKey = "place" | "city" | "state" | "order_item" | "rating" | "price_tier";
type SortDir = "asc" | "desc";

interface Column {
  key: SortKey;
  label: string;
  /** flex weight, or a fixed pixel width */
  flex?: number;
  width?: number;
  align: "left" | "center" | "right";
}

const COLUMNS: readonly Column[] = [
  { key: "place", label: "PLACE", flex: 2, align: "left" },
  { key: "city", label: "CITY", flex: 1, align: "left" },
  { key: "state", label: "STATE", width: 52, align: "left" },
  { key: "order_item", label: "ORDER", flex: 1.3, align: "left" },
  { key: "rating", label: "RATING", width: 64, align: "center" },
  { key: "price_tier", label: "PRICE", width: 52, align: "center" },
];

/** Compares two rows on a sort key; nulls sort last regardless of direction. */
function compareRows(a: CafeApiRow, b: CafeApiRow, key: SortKey, dir: SortDir): number {
  const av = a[key];
  const bv = b[key];
  const factor = dir === "asc" ? 1 : -1;

  if (av === null && bv === null) return 0;
  if (av === null) return 1;
  if (bv === null) return -1;

  if (typeof av === "number" && typeof bv === "number") return (av - bv) * factor;
  return String(av).localeCompare(String(bv)) * factor;
}

interface CityStat {
  city: string;
  count: number;
  avg: number | null;
}

/** Aggregates rows into per-city count + avg-rating, sorted by count desc. */
function cityStats(rows: readonly CafeApiRow[]): CityStat[] {
  const map = new Map<string, { count: number; sum: number; rated: number }>();
  for (const row of rows) {
    const entry = map.get(row.city) ?? { count: 0, sum: 0, rated: 0 };
    entry.count += 1;
    if (row.rating !== null) {
      entry.sum += row.rating;
      entry.rated += 1;
    }
    map.set(row.city, entry);
  }
  return [...map.entries()].map(([city, e]) => ({ city, count: e.count, avg: e.rated > 0 ? e.sum / e.rated : null })).sort((a, b) => b.count - a.count);
}

/** Counts rows per 1–10 rating bucket (index 0 → rating 1). */
function ratingHistogram(rows: readonly CafeApiRow[]): number[] {
  const buckets = new Array<number>(RATING_MAX).fill(0);
  for (const row of rows) {
    if (row.rating !== null && row.rating >= RATING_MIN && row.rating <= RATING_MAX) {
      buckets[row.rating - 1] += 1;
    }
  }
  return buckets;
}

/** One-shot first-paint flag → mounts bars at scale 0, then animates to real value once. */
function useFirstPaint(): boolean {
  const [painted, setPainted] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setPainted(true));
    return () => cancelAnimationFrame(id);
  }, []);
  return painted;
}

// --- subcomponents ------------------------------------------------------------

function KpiCard({ label, value, sub, valueColor, subColor, flex = 1 }: {
  label: string; value: string; sub: string; valueColor: string; subColor: string; flex?: number;
}) {
  return (
    <div className="fr-card" style={card({ flex })}>
      <div style={kicker}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 42, lineHeight: 1, color: valueColor, marginTop: 4, ...tabularNum }}>
        {value}
      </div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: subColor, marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

function cellStyle(col: Column): CSSProperties {
  return { width: col.width, flex: col.width === undefined ? col.flex : undefined, textAlign: col.align };
}

/** aria-sort value for a header cell given the active sort state. */
function ariaSortFor(col: Column, sortKey: SortKey, sortDir: SortDir): "ascending" | "descending" | "none" {
  if (col.key !== sortKey) return "none";
  return sortDir === "desc" ? "descending" : "ascending";
}

function LogTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  highlightId,
  onOpenDetail,
}: {
  rows: readonly LogRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  highlightId: number | null;
  onOpenDetail: (row: LogRow) => void;
}) {
  return (
    <div className="fr-card" style={card({ flex: 1.6 })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 13 }}>
        <div style={{ ...cardHeading, fontSize: 18 }}>THE LOG</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: "#b8946a", ...tabularNum }}>
          SORTED BY {sortKey.toUpperCase().replace("_", " ")}{" "}
          <span aria-hidden>{sortDir === "desc" ? "▼" : "▲"}</span> · {rows.length}{" "}
          {rows.length === 1 ? "ENTRY" : "ENTRIES"}
        </div>
      </div>

      {/* role=* re-asserts table semantics that the display:flex layout would otherwise strip from AT */}
      <table role="table" style={{ width: "100%", borderCollapse: "collapse", tableLayout: "fixed" }}>
        <thead role="rowgroup">
          <tr role="row" style={{ display: "flex", borderBottom: `1px solid rgba(226,184,124,.2)` }}>
            <th role="columnheader" scope="col" style={{ width: 44, flex: "none", padding: "0 4px 9px" }}>
              <span style={srOnly}>Photo</span>
            </th>
            {COLUMNS.map((col) => {
              const active = col.key === sortKey;
              return (
                <th
                  key={col.key}
                  role="columnheader"
                  scope="col"
                  aria-sort={ariaSortFor(col, sortKey, sortDir)}
                  style={{ ...cellStyle(col), padding: "0 8px 9px" }}
                >
                  <button
                    type="button"
                    onClick={() => onSort(col.key)}
                    className="fr-pressable"
                    style={{
                      appearance: "none", background: "transparent", border: "none", padding: 0, width: "100%", cursor: "pointer",
                      fontFamily: BODY, fontWeight: 800, fontSize: 9.5, letterSpacing: ".1em",
                      color: active ? ACCENT_GOLD : "#b8946a", textAlign: col.align,
                    }}
                  >
                    {col.label}
                    {active ? <span aria-hidden>{sortDir === "desc" ? " ▼" : " ▲"}</span> : ""}
                  </button>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody role="rowgroup" style={{ display: "flex", flexDirection: "column" }}>
          {rows.length === 0 ? (
            <tr role="row">
              <td
                role="cell"
                colSpan={COLUMNS.length + 1}
                style={{ fontFamily: BODY, fontSize: 13, color: "#a88a6a", padding: "22px 8px", textAlign: "center" }}
              >
                No cafes logged yet. Log your first one to start the map. ☕
              </td>
            </tr>
          ) : (
            rows.map((row, i) => (
              <tr
                key={row.id}
                role="row"
                onClick={() => onOpenDetail(row)}
                className={row.id === highlightId ? "fr-pulse-alert" : undefined}
                style={{
                  display: "flex", alignItems: "center", fontFamily: BODY, fontSize: 13, color: "#e9d6bf", padding: "9px 8px",
                  cursor: "pointer",
                  borderBottom: i < rows.length - 1 ? `1px solid rgba(226,184,124,.1)` : "none",
                  background: row.id === highlightId ? "rgba(226,184,124,.1)" : "transparent",
                }}
              >
                <td role="cell" style={{ width: 44, flex: "none", display: "flex", justifyContent: "center" }}>
                  <button
                    type="button"
                    className="fr-pressable"
                    aria-label={`Open ${row.place}`}
                    onClick={(e) => { e.stopPropagation(); onOpenDetail(row); }}
                    style={{ ...buttonReset, cursor: "pointer", lineHeight: 0, borderRadius: 6 }}
                  >
                    <RowThumb row={row} />
                  </button>
                </td>
                <td role="cell" style={{ ...cellStyle(COLUMNS[0]), fontWeight: 700 }}>{row.place}</td>
                <td role="cell" style={{ ...cellStyle(COLUMNS[1]), color: "#cbac88" }}>{row.city}</td>
                <td role="cell" style={{ ...cellStyle(COLUMNS[2]), color: "#cbac88" }}>{row.state}</td>
                <td role="cell" style={{ ...cellStyle(COLUMNS[3]), color: "#cbac88" }}>{row.order_item}</td>
                <td role="cell" style={{ ...cellStyle(COLUMNS[4]), fontFamily: DISPLAY, fontSize: 17, color: ratingColor(row.rating), ...tabularNum }}>
                  {row.rating ?? "—"}
                </td>
                <td role="cell" style={{ ...cellStyle(COLUMNS[5]), color: "#e0a85a", fontWeight: 700 }}>
                  {row.price_tier ?? "—"}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Shape-matching skeleton for the log while the initial fetch is in flight. */
function LogSkeleton() {
  return (
    <div className="fr-card" style={card({ flex: 1.6 })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 13 }}>
        <div style={{ ...cardHeading, fontSize: 18 }}>THE LOG</div>
        <Skeleton width={120} height={10} />
      </div>
      <div style={{ borderBottom: `1px solid rgba(226,184,124,.2)`, padding: "0 8px 9px" }}>
        <Skeleton width="40%" height={9} />
      </div>
      <div style={{ display: "flex", flexDirection: "column" }}>
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} style={{ padding: "9px 8px", borderBottom: i < 5 ? `1px solid rgba(226,184,124,.1)` : "none" }}>
            <Skeleton height={15} />
          </div>
        ))}
      </div>
    </div>
  );
}

function RatingHistogram({ rows }: { rows: readonly CafeApiRow[] }) {
  const painted = useFirstPaint();
  const buckets = ratingHistogram(rows);
  const max = Math.max(1, ...buckets);
  const rated = buckets.reduce((s, n) => s + n, 0);
  const modeIndex = buckets.reduce((best, n, i) => (n > buckets[best] ? i : best), 0);

  return (
    <div className="fr-card" style={card({ flex: 1 })}>
      <div style={{ ...cardHeading, marginBottom: 2 }}>RATING SPREAD</div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: "#b8946a", marginBottom: 16, ...tabularNum }}>
        {rated > 0 ? `${rated} RATED · MODE ${modeIndex + 1}` : "NO RATINGS YET"}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 120, padding: "0 4px" }}>
        {buckets.map((count, i) => {
          const rating = i + 1;
          const pct = Math.round((count / max) * 100);
          const isMode = count > 0 && i === modeIndex;
          return (
            <div key={rating} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
              <div style={{ fontFamily: DISPLAY, fontSize: 12, color: count > 0 ? "#c2a17f" : "#5a4126", marginBottom: 4, ...tabularNum }}>
                {count}
              </div>
              <div
                style={{
                  width: "100%", height: `${Math.max(count > 0 ? 6 : 2, pct)}%`, transformOrigin: "bottom",
                  transform: `scaleY(${painted ? 1 : 0})`, borderRadius: "4px 4px 0 0",
                  background: count === 0 ? "rgba(226,184,124,.1)" : `linear-gradient(180deg,${ACCENT_GOLD},${ACCENT_CARAMEL})`,
                  boxShadow: isMode ? "0 0 14px rgba(240,180,60,.4)" : "none",
                  transition: `transform ${t.dur.normal} ${t.ease}`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, fontFamily: BODY, fontWeight: 800, fontSize: 10, color: "#b8946a", marginTop: 7, padding: "0 4px" }}>
        {buckets.map((_, i) => (
          <span key={i} style={{ flex: 1, textAlign: "center", color: i === modeIndex ? ACCENT_GOLD : "#b8946a", ...tabularNum }}>
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

function ByCity({ rows }: { rows: readonly CafeApiRow[] }) {
  const painted = useFirstPaint();
  const stats = cityStats(rows);
  const maxCount = Math.max(1, ...stats.map((s) => s.count));

  return (
    <div className="fr-card" style={card({ flex: 1 })}>
      <div style={{ ...cardHeading, marginBottom: 2 }}>BY CITY</div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: "#b8946a", marginBottom: 14 }}>COUNT · AVG RATING</div>
      {stats.length === 0 ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: "#a88a6a", padding: "18px 0", textAlign: "center" }}>
          No cities yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stats.map((s) => (
            <div key={s.city} style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span
                style={{ width: 84, fontFamily: BODY, fontWeight: 700, fontSize: 12, color: "#e9d6bf", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={s.city}
              >
                {s.city}
              </span>
              <div style={{ flex: 1, height: 14, borderRadius: 4, background: "rgba(226,184,124,.12)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.round((s.count / maxCount) * 100)}%`, height: "100%", transformOrigin: "left",
                    transform: `scaleX(${painted ? 1 : 0})`, background: `linear-gradient(90deg,${ACCENT_CARAMEL},#cf7a25)`,
                    transition: `transform ${t.dur.normal} ${t.ease}`,
                  }}
                />
              </div>
              <span style={{ width: 56, textAlign: "right", fontFamily: DISPLAY, fontSize: 14, color: "#fff", ...tabularNum }}>
                {s.count}{" "}
                <span style={{ fontSize: 10, color: s.avg !== null && s.avg >= 8 ? "#8fe6a8" : ACCENT_GOLD }}>
                  {s.avg !== null ? `·${s.avg.toFixed(1)}` : ""}
                </span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// --- quick-log form -----------------------------------------------------------

interface FormState {
  place: string;
  city: string;
  state: string;
  order_item: string;
  rating: number;
  price_tier: PriceTier;
  notes: string;
}

const EMPTY_FORM: FormState = {
  place: "",
  city: "",
  state: "",
  order_item: "",
  rating: 8,
  price_tier: "$$",
  notes: "",
};

const fieldLabel: CSSProperties = { display: "block", fontFamily: BODY, fontWeight: 800, fontSize: 9, letterSpacing: ".12em", color: "#b8946a", marginBottom: 5 };

const inputStyle: CSSProperties = { width: "100%", background: "#1d130c", boxShadow: `inset 0 0 0 1px rgba(226,184,124,.28)`, border: "none", borderRadius: 9, padding: "10px 13px", fontFamily: BODY, fontWeight: 700, fontSize: 14, color: "#f6e6d2", boxSizing: "border-box" };

/** A quick-log submission payload (no id yet — server assigns it). Same shape as FormState. */
type CafeDraft = FormState;

function QuickLog({ onSubmit }: { onSubmit: (draft: CafeDraft, photo: File | null) => Promise<void> }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [photo, setPhoto] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sole owner of preview-URL revocation: this cleanup runs with the previous value when
  // `preview` changes (replace) and with the current value on unmount. onPick/clearPhoto must
  // NOT revoke inline or they'd double-free.
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const canSubmit =
    form.place.trim() !== "" &&
    form.city.trim() !== "" &&
    form.state.trim() !== "" &&
    form.order_item.trim() !== "";

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const onPick = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0] ?? null;
    if (fileRef.current) fileRef.current.value = ""; // allow re-picking the same file
    if (!file) return;
    const err = validatePhoto(file);
    if (err) { setPhotoErr(err); return; }
    setPhotoErr(null);
    setPhoto(file);
    setPreview(URL.createObjectURL(file)); // the [preview] effect revokes the prior URL
  };

  const clearPhoto = () => {
    setPreview(null); // the [preview] effect revokes the outgoing URL
    setPhoto(null);
    setPhotoErr(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    const draft: CafeDraft = {
      place: form.place.trim(),
      city: form.city.trim(),
      state: form.state.trim(),
      order_item: form.order_item.trim(),
      rating: form.rating,
      price_tier: form.price_tier,
      notes: form.notes.trim(),
    };
    const photoToSend = photo;
    // Reset the text fields immediately for an optimistic feel; the parent owns the row list.
    setForm(EMPTY_FORM);
    try {
      await onSubmit(draft, photoToSend);
      clearPhoto(); // success → drop the now-logged photo
    } catch {
      // Roll back: restore the draft (photo stays selected) so the user can retry.
      setForm({ ...draft });
      setErrorMsg("Could not log cafe — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ width: 298, flex: "none" }}>
      <div style={{ background: "#0c0805", borderRadius: 38, boxShadow: "inset 0 0 0 2px #3a281a,0 0 0 6px #160d08,0 14px 40px rgba(0,0,0,.5)", padding: 12 }}>
        <div style={{ background: "radial-gradient(120% 80% at 50% 0%,#2a1a10,#160d08)", borderRadius: 28, overflow: "hidden", display: "flex", flexDirection: "column", paddingBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px 8px", fontFamily: MONO, fontSize: 10, color: "#c2a17f" }} aria-hidden>
            <span>9:41</span>
            <span style={{ width: 54, height: 16, background: "#0c0805", borderRadius: "0 0 10px 10px" }} />
            <span>▮▮▮</span>
          </div>
          <form
            onSubmit={(e) => { e.preventDefault(); void submit(); }}
            style={{ padding: "6px 16px 0", display: "flex", flexDirection: "column", gap: 11 }}
          >
            <div style={{ fontFamily: DISPLAY, fontSize: 22, color: "#f6e6d2", lineHeight: 1 }}>
              LOG A CAFE <span aria-hidden style={{ fontSize: 18 }}>☕</span>
            </div>

            <div>
              <label htmlFor="cafe-place" style={fieldLabel}>PLACE</label>
              <input id="cafe-place" style={inputStyle} value={form.place} placeholder="Sightglass" onChange={(e) => update("place", e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: 9 }}>
              <div style={{ flex: 1.3 }}>
                <label htmlFor="cafe-city" style={fieldLabel}>CITY</label>
                <input id="cafe-city" style={inputStyle} value={form.city} placeholder="SF" onChange={(e) => update("city", e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <label htmlFor="cafe-state" style={fieldLabel}>STATE</label>
                <input id="cafe-state" style={inputStyle} value={form.state} placeholder="CA" onChange={(e) => update("state", e.target.value)} />
              </div>
            </div>

            <div>
              <label htmlFor="cafe-order" style={fieldLabel}>ORDER</label>
              <input id="cafe-order" style={inputStyle} value={form.order_item} placeholder="Oat Cortado" onChange={(e) => update("order_item", e.target.value)} />
            </div>

            <div>
              <label htmlFor="cafe-notes" style={fieldLabel}>NOTES <span style={{ fontWeight: 700, color: "#c2a17f" }}>· OPTIONAL</span></label>
              <textarea id="cafe-notes" style={{ ...inputStyle, minHeight: 60, resize: "vertical", lineHeight: 1.4 }} value={form.notes} placeholder="Cozy corner, dialed-in espresso…" onChange={(e) => update("notes", e.target.value)} />
            </div>

            <div>
              <span style={fieldLabel}>PHOTO <span style={{ fontWeight: 700, color: "#c2a17f" }}>· OPTIONAL</span></span>
              {preview ? (
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local object URL preview */}
                  <img src={preview} alt="Selected cafe" style={{ width: 52, height: 52, objectFit: "cover", borderRadius: 10, boxShadow: `inset 0 0 0 1px ${FRAME_BORDER}`, outline: "1px solid rgba(0,0,0,.18)", outlineOffset: -1 }} />
                  <button
                    type="button"
                    className="fr-pressable"
                    onClick={clearPhoto}
                    style={{ flex: 1, height: 44, border: "none", borderRadius: 9, cursor: "pointer", background: "#1d130c", boxShadow: `inset 0 0 0 1px rgba(226,184,124,.28)`, color: "#c2a17f", fontFamily: BODY, fontWeight: 800, fontSize: 11, letterSpacing: ".08em" }}
                  >
                    REMOVE PHOTO
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="fr-pressable"
                  onClick={() => fileRef.current?.click()}
                  aria-describedby="cafe-photo-hint"
                  style={{ display: "flex", width: "100%", alignItems: "center", justifyContent: "center", gap: 8, height: 44, border: "none", borderRadius: 9, cursor: "pointer", background: "#1d130c", boxShadow: `inset 0 0 0 1px rgba(226,184,124,.28)`, color: "#c2a17f", fontFamily: BODY, fontWeight: 800, fontSize: 12, letterSpacing: ".06em" }}
                >
                  <span aria-hidden style={{ fontSize: 16 }}>📷</span> ADD PHOTO
                </button>
              )}
              <input ref={fileRef} type="file" accept={PHOTO_ACCEPT} onChange={onPick} tabIndex={-1} aria-hidden style={srOnly} />
              <div id="cafe-photo-hint" style={{ marginTop: 6, fontFamily: BODY, fontWeight: 600, fontSize: 10, color: "#c2a17f" }}>{PHOTO_HINT}</div>
              {photoErr ? <div role="alert" style={{ marginTop: 6, fontFamily: BODY, fontWeight: 700, fontSize: 11, color: "#f0a07e" }}>{photoErr}</div> : null}
            </div>

            <div role="radiogroup" aria-label="Rating out of 10">
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={fieldLabel}>RATING</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 20, color: ratingColor(form.rating), lineHeight: 1, ...tabularNum }}>
                  {form.rating}
                  <span style={{ fontSize: 11, color: "#b8946a" }}>/10</span>
                </span>
              </div>
              <div style={{ display: "flex", gap: 3 }}>
                {Array.from({ length: RATING_MAX }, (_, i) => {
                  const value = i + 1;
                  const lit = value <= form.rating;
                  return (
                    <button
                      key={value}
                      type="button"
                      role="radio"
                      aria-checked={form.rating === value}
                      aria-label={`Rate ${value} out of 10`}
                      className="fr-pressable"
                      onClick={() => update("rating", value)}
                      style={{
                        flex: 1, height: 24, border: "none", borderRadius: 4, cursor: "pointer",
                        background: lit ? `linear-gradient(180deg,${ACCENT_CARAMEL},${ACCENT_ROAST})` : "#1d130c",
                        boxShadow: lit ? "none" : `inset 0 0 0 1px rgba(226,184,124,.28)`,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div role="radiogroup" aria-label="Price tier">
              <span style={fieldLabel}>PRICE TIER</span>
              <div style={{ display: "flex", gap: 8 }}>
                {PRICE_TIERS.map((tier) => {
                  const active = form.price_tier === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      role="radio"
                      aria-checked={active}
                      aria-label={PRICE_TIER_NAMES[tier]}
                      className="fr-pressable"
                      onClick={() => update("price_tier", tier)}
                      style={{
                        flex: 1, height: 44, border: "none", borderRadius: 9, cursor: "pointer", fontFamily: DISPLAY, fontSize: 18,
                        background: active ? "linear-gradient(180deg,#e9b15a,#cf7a25)" : "#1d130c",
                        color: active ? "#2a1606" : "#8a6f4a",
                        boxShadow: active ? "0 0 14px rgba(210,130,50,.35)" : `inset 0 0 0 1px rgba(226,184,124,.28)`,
                      }}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            </div>

            <div aria-live="polite" style={srOnly}>
              {errorMsg ?? ""}
            </div>
            {errorMsg ? (
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: "#f0a07e" }}>{errorMsg}</div>
            ) : null}

            <button
              type="submit"
              className="fr-pressable"
              disabled={!canSubmit || submitting}
              style={{ height: 56, border: "none", borderRadius: 12, cursor: canSubmit && !submitting ? "pointer" : "not-allowed", background: `linear-gradient(90deg,${ACCENT_CARAMEL},${ACCENT_ROAST})`, boxShadow: "0 0 20px rgba(210,130,50,.4)", fontFamily: DISPLAY, fontSize: 18, color: "#2a1606", letterSpacing: ".04em", opacity: canSubmit && !submitting ? 1 : 0.5 }}
            >
              {submitting ? "LOGGING…" : "LOG CAFE →"}
            </button>

            {!canSubmit ? (
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 10, color: "#a88a6a", textAlign: "center" }}>
                add place, city, state &amp; order
              </div>
            ) : null}
          </form>
        </div>
      </div>
    </div>
  );
}

// --- main section -------------------------------------------------------------

interface CafesSectionProps {
  cafes: Cafes;
}

/**
 * Cafe Tracker — KPI strip (from the summary prop) + the full log self-fetched from
 * `/api/cafes`, rendered as a sortable table, a rating histogram, and a by-city grouping.
 */
export function CafesSection({ cafes }: CafesSectionProps) {
  const [rows, setRows] = useState<LogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("rating");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [highlightId, setHighlightId] = useState<number | null>(null);
  const [detailRow, setDetailRow] = useState<LogRow | null>(null);
  const [photoWarn, setPhotoWarn] = useState<string | null>(null);
  const tempId = useRef(-1);
  // Object URLs we minted for instant photo previews — revoked on unmount to avoid leaks.
  const objectUrls = useRef<Set<string>>(new Set());
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; objectUrls.current.forEach((u) => URL.revokeObjectURL(u)); };
  }, []);

  /** Revoke + forget a tracked preview object URL. */
  const dropObjectUrl = useCallback((url?: string) => {
    if (url) { URL.revokeObjectURL(url); objectUrls.current.delete(url); }
  }, []);

  const load = useCallback(async () => {
    // Only the initial empty load shows the full skeleton; refetches keep rows visible.
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/cafes", { headers: { accept: "application/json" } });
      if (!res.ok) {
        setLoadError(true);
        return;
      }
      const body: unknown = await res.json();
      setRows(parseListResponse(body));
    } catch {
      setLoadError(true);
    } finally {
      setLoading(false);
      setHasLoaded(true);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  /**
   * Optimistic submit: prepend a temp row immediately, POST to create, then (if a photo was
   * picked) upload it in a second hop and reconcile the row. A create failure rolls the row
   * back and re-throws so QuickLog restores its draft; a photo-upload failure leaves the cafe
   * saved and surfaces a non-fatal warning (the cafe is real even if its photo didn't land).
   */
  const handleSubmit = useCallback(async (draft: CafeDraft, photo: File | null) => {
    const id = tempId.current;
    tempId.current -= 1;
    const now = new Date().toISOString().slice(0, 10);
    const localPhotoUrl = photo ? URL.createObjectURL(photo) : undefined;
    if (localPhotoUrl) objectUrls.current.add(localPhotoUrl);
    const optimistic: LogRow = { ...draft, id, notes: draft.notes || null, has_photo: false, visited_at: now, created_at: now, localPhotoUrl };
    setRows((prev) => [optimistic, ...prev]);
    setHighlightId(id);
    setPhotoWarn(null);

    let created: CafeApiRow;
    try {
      const res = await fetch("/api/cafes", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(draft) });
      if (!res.ok) throw new Error("POST failed");
      const serverRow = parsePostResponse(await res.json());
      if (!mounted.current) return;
      if (!serverRow) {
        // Couldn't parse the row — fall back to a silent background refetch (photo upload skipped).
        dropObjectUrl(localPhotoUrl);
        void load();
        return;
      }
      created = serverRow;
      // Reconcile: swap the temp row for the server row, keeping the local preview while the
      // photo (if any) is still uploading — has_photo is still false at this point.
      setRows((prev) => prev.map((r) => (r.id === id ? { ...created, localPhotoUrl } : r)));
      setHighlightId(created.id);
    } catch (err) {
      // Roll back the optimistic row and re-throw so the form restores its draft.
      setRows((prev) => prev.filter((r) => r.id !== id));
      setHighlightId(null);
      dropObjectUrl(localPhotoUrl);
      throw err;
    }

    // Cafe is saved. Attach the photo best-effort — a failure here does NOT roll back the cafe.
    if (photo) {
      try {
        const fd = new FormData();
        fd.append("cafe_id", String(created.id));
        fd.append("photo", photo);
        const res = await fetch("/api/cafes/photo", { method: "POST", body: fd });
        if (!res.ok) throw new Error("photo upload failed");
        const updated = parsePostResponse(await res.json());
        if (!mounted.current) return;
        if (updated) {
          // Photo is persisted: switch the thumbnail to the served URL and free the local blob.
          setRows((prev) => prev.map((r) => (r.id === created.id ? { ...updated } : r)));
          dropObjectUrl(localPhotoUrl);
        } else {
          // Saved but response unparseable — refetch so has_photo/served URL reconcile.
          dropObjectUrl(localPhotoUrl);
          void load();
        }
      } catch {
        if (!mounted.current) return;
        // Photo failed but the cafe is real: drop the misleading local preview so the row's
        // (no-photo) state matches the warning below.
        setRows((prev) => prev.map((r) => (r.id === created.id ? { ...r, localPhotoUrl: undefined } : r)));
        dropObjectUrl(localPhotoUrl);
        setPhotoWarn(`Logged ${created.place}, but the photo didn’t upload. Try adding it again later.`);
      }
    }
  }, [load, dropObjectUrl]);

  // Clear the new-row highlight shortly after it appears.
  useEffect(() => {
    if (highlightId === null) return;
    const timer = setTimeout(() => setHighlightId(null), 1400);
    return () => clearTimeout(timer);
  }, [highlightId]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      // Sensible defaults: rating starts desc, text starts asc.
      setSortDir(key === "rating" ? "desc" : "asc");
    }
  };

  const sortedRows = useMemo(() => [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)), [rows, sortKey, sortDir]);

  // KPI strip is driven by the summary prop (authoritative, non-PII roll-up).
  const avgRating = cafes.avg_rating;

  // Show the full skeleton only on the initial load (empty + never loaded).
  const showSkeleton = loading && !hasLoaded;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      <div aria-live="polite" style={srOnly}>
        {showSkeleton ? "Loading cafe log" : loadError ? "Could not load the cafe log" : ""}
      </div>

      {photoWarn ? (
        <div
          role="status"
          style={{ fontFamily: BODY, fontWeight: 700, fontSize: 12, color: "#f0c878", background: "rgba(80,50,16,.4)", boxShadow: `inset 0 0 0 1px rgba(240,180,80,.3)`, borderRadius: 9, padding: "9px 13px" }}
        >
          {photoWarn}
        </div>
      ) : null}

      {/* KPI strip */}
      <div style={{ display: "flex", gap: 13 }}>
        <KpiCard label="TOTAL LOGGED" value={fmtNum(cafes.total)} sub={cafes.total === 0 ? "NO CAFES YET" : "ALL TIME"} valueColor="#fff" subColor={ACCENT_CARAMEL} />
        <KpiCard label="AVG RATING" value={avgRating === null ? "—" : avgRating.toFixed(1)} sub="OUT OF 10" valueColor={ACCENT_GOLD} subColor="#c2a17f" />
        <KpiCard label="LAST SPOT" value={cafes.last_spot ?? "—"} sub={cafes.last_spot ? "MOST RECENT VISIT" : "AWAITING FIRST LOG"} valueColor="#fff" subColor="#c2a17f" flex={1.4} />
        <KpiCard label="CITIES" value={fmtNum(cafes.cities)} sub={cafes.cities === 1 ? "1 CITY" : "DISTINCT CITIES"} valueColor="#e0a85a" subColor="#c2a17f" />
      </div>

      {/* table + quick-log phone */}
      <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
        {showSkeleton ? (
          <LogSkeleton />
        ) : loadError && rows.length === 0 ? (
          <div className="fr-card" style={card({ flex: 1.6 })}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "22px 8px" }}>
              <div style={{ fontFamily: BODY, fontSize: 13, color: "#f0a07e" }}>Could not load the cafe log.</div>
              <button
                type="button"
                className="fr-pressable"
                onClick={() => void load()}
                style={{ border: "none", borderRadius: 9, cursor: "pointer", padding: "9px 18px", background: `linear-gradient(90deg,${ACCENT_CARAMEL},${ACCENT_ROAST})`, fontFamily: DISPLAY, fontSize: 14, color: "#2a1606" }}
              >
                RETRY
              </button>
            </div>
          </div>
        ) : (
          <LogTable rows={sortedRows} sortKey={sortKey} sortDir={sortDir} onSort={onSort} highlightId={highlightId} onOpenDetail={setDetailRow} />
        )}

        <QuickLog onSubmit={handleSubmit} />
      </div>

      {/* histogram + cities */}
      <div style={{ display: "flex", gap: 13, alignItems: "stretch" }}>
        <RatingHistogram rows={rows} />
        <ByCity rows={rows} />
      </div>

      {detailRow ? (
        <EntryDetail
          row={{ ...detailRow, type: detailRow.order_item }}
          apiBase="/api/cafes"
          typeKey="order_item"
          typeLabel="ORDER"
          emoji="☕"
          palette={CAFE_DETAIL_PALETTE}
          onClose={(changed) => {
            setDetailRow(null);
            if (changed) void load();
          }}
        />
      ) : null}
    </div>
  );
}
