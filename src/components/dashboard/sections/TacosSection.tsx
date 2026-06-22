"use client";

import { CSSProperties, useCallback, useEffect, useMemo, useState } from "react";

import type { Tacos } from "@/lib/types";

/**
 * Taco Tracker section (magenta palette — tonal contrast to the teal analytics sections).
 *
 * - KPI strip is driven by the {@link Tacos} summary prop (total / avg_rating / last_spot / cities).
 * - The full log is self-fetched from `GET /api/tacos`, which returns `{ tacos: TacoApiRow[] }`
 *   (see src/app/api/tacos/route.ts + shared.ts). From the rows we derive:
 *     · a sortable "THE LOG" table (client-side sort, default rating desc),
 *     · a rating histogram (counts per 1–10 bucket),
 *     · a by-city grouping (count + avg rating bars).
 * - A small quick-log form POSTs to `/api/tacos` then refetches (optional nicety).
 *
 * The list may be empty in dev, so every derived view has a graceful empty state.
 */

// --- API shape (narrowed from unknown — never trust the wire) -----------------

const PRICE_TIERS = ["$", "$$", "$$$"] as const;
type PriceTier = (typeof PRICE_TIERS)[number];

/** One taco row exactly as returned by `GET /api/tacos` (mirrors TacoRow in shared.ts). */
interface TacoApiRow {
  id: number;
  place: string;
  city: string;
  state: string;
  taco_type: string;
  rating: number | null;
  price_tier: string | null;
  notes: string | null;
  photo_path: string | null;
  visited_at: string;
  created_at: string;
}

interface TacosListResponse {
  tacos: TacoApiRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Narrows one unknown row into a {@link TacoApiRow}, or null when it is malformed. */
function parseRow(value: unknown): TacoApiRow | null {
  if (!isRecord(value)) return null;
  const {
    id,
    place,
    city,
    state,
    taco_type,
    rating,
    price_tier,
    notes,
    photo_path,
    visited_at,
    created_at,
  } = value;

  if (typeof id !== "number") return null;
  if (typeof place !== "string" || typeof city !== "string") return null;
  if (typeof state !== "string" || typeof taco_type !== "string") return null;
  if (typeof visited_at !== "string" || typeof created_at !== "string") return null;

  return {
    id,
    place,
    city,
    state,
    taco_type,
    rating: typeof rating === "number" ? rating : null,
    price_tier: typeof price_tier === "string" ? price_tier : null,
    notes: typeof notes === "string" ? notes : null,
    photo_path: typeof photo_path === "string" ? photo_path : null,
    visited_at,
    created_at,
  };
}

/** Narrows the whole `GET /api/tacos` body into a row array (drops malformed rows). */
function parseListResponse(value: unknown): TacoApiRow[] {
  if (!isRecord(value) || !Array.isArray(value.tacos)) return [];
  return value.tacos
    .map(parseRow)
    .filter((row): row is TacoApiRow => row !== null);
}

// --- style tokens (magenta) ---------------------------------------------------

const DISPLAY = "'Black Han Sans',sans-serif";
const BODY = "'Barlow',sans-serif";
const MONO = "'JetBrains Mono',monospace";

const MAGENTA_FRAME = "linear-gradient(160deg,#2c1430,#180a1c)";
const FRAME_BORDER = "rgba(236,160,230,.4)";
const ACCENT_PINK = "#ff7ae6";
const ACCENT_PURPLE = "#b450ff";
const ACCENT_GOLD = "#ffd36b";
const EASE = "cubic-bezier(0.23,1,0.32,1)";

const RATING_MIN = 1;
const RATING_MAX = 10;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** A magenta Questism card frame with the angled clip-path corner. */
const card = (extra?: CSSProperties): CSSProperties => ({
  background: MAGENTA_FRAME,
  clipPath:
    "polygon(0 0,calc(100% - 14px) 0,100% 14px,100% 100%,14px 100%,0 calc(100% - 14px))",
  boxShadow: `inset 0 0 0 2px ${FRAME_BORDER}`,
  padding: "18px 20px",
  ...extra,
});

const kicker: CSSProperties = {
  fontFamily: BODY,
  fontWeight: 700,
  fontSize: 10,
  letterSpacing: ".14em",
  color: "#cf9fe0",
};

const cardHeading: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: 16,
  color: "#ffd9f4",
  letterSpacing: ".03em",
};

// --- helpers ------------------------------------------------------------------

const fmtNum = (n: number): string => n.toLocaleString("en-US");

/** "JUN 19" from a YYYY-MM-DD string (falls back to the raw value on parse failure). */
function fmtDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return iso;
  const month = MONTHS[Number(m[2]) - 1] ?? "";
  return `${month} ${m[3]}`.trim();
}

/** Rating → colour: green high, gold mid, salmon low (matches the design). */
function ratingColor(rating: number | null): string {
  if (rating === null) return "#9a7aa8";
  if (rating >= 8) return "#7dffb0";
  if (rating >= 6) return ACCENT_GOLD;
  return "#ff9a8a";
}

type SortKey = "place" | "city" | "state" | "taco_type" | "rating" | "price_tier" | "visited_at";
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
  { key: "taco_type", label: "TYPE", flex: 1.3, align: "left" },
  { key: "rating", label: "RATING", width: 64, align: "center" },
  { key: "price_tier", label: "PRICE", width: 52, align: "center" },
  { key: "visited_at", label: "DATE", width: 58, align: "right" },
];

/** Compares two rows on a sort key; nulls sort last regardless of direction. */
function compareRows(a: TacoApiRow, b: TacoApiRow, key: SortKey, dir: SortDir): number {
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
function cityStats(rows: readonly TacoApiRow[]): CityStat[] {
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
  return [...map.entries()]
    .map(([city, e]) => ({ city, count: e.count, avg: e.rated > 0 ? e.sum / e.rated : null }))
    .sort((a, b) => b.count - a.count);
}

/** Counts rows per 1–10 rating bucket (index 0 → rating 1). */
function ratingHistogram(rows: readonly TacoApiRow[]): number[] {
  const buckets = new Array<number>(RATING_MAX).fill(0);
  for (const row of rows) {
    if (row.rating !== null && row.rating >= RATING_MIN && row.rating <= RATING_MAX) {
      buckets[row.rating - 1] += 1;
    }
  }
  return buckets;
}

// --- subcomponents ------------------------------------------------------------

function KpiCard({
  label,
  value,
  sub,
  valueColor,
  subColor,
  flex = 1,
}: {
  label: string;
  value: string;
  sub: string;
  valueColor: string;
  subColor: string;
  flex?: number;
}) {
  return (
    <div style={card({ flex })}>
      <div style={kicker}>{label}</div>
      <div style={{ fontFamily: DISPLAY, fontSize: 42, lineHeight: 1, color: valueColor, marginTop: 4 }}>
        {value}
      </div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: subColor, marginTop: 4 }}>
        {sub}
      </div>
    </div>
  );
}

function cellStyle(col: Column): CSSProperties {
  return {
    width: col.width,
    flex: col.width === undefined ? col.flex : undefined,
    textAlign: col.align,
  };
}

function LogTable({
  rows,
  sortKey,
  sortDir,
  onSort,
}: {
  rows: readonly TacoApiRow[];
  sortKey: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
}) {
  return (
    <div style={card({ flex: 1.6 })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 13 }}>
        <div style={{ ...cardHeading, fontSize: 18 }}>THE LOG</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: "#b07ec0" }}>
          SORTED BY {sortKey.toUpperCase().replace("_", " ")} {sortDir === "desc" ? "▼" : "▲"} ·{" "}
          {rows.length} {rows.length === 1 ? "ENTRY" : "ENTRIES"}
        </div>
      </div>

      {/* header */}
      <div
        style={{
          display: "flex",
          fontFamily: BODY,
          fontWeight: 800,
          fontSize: 9.5,
          letterSpacing: ".1em",
          color: "#b07ec0",
          padding: "0 8px 9px",
          borderBottom: `1px solid rgba(236,160,230,.18)`,
        }}
      >
        {COLUMNS.map((col) => {
          const active = col.key === sortKey;
          return (
            <button
              key={col.key}
              type="button"
              onClick={() => onSort(col.key)}
              className="tacos-sort"
              style={{
                ...cellStyle(col),
                appearance: "none",
                background: "transparent",
                border: "none",
                padding: 0,
                cursor: "pointer",
                fontFamily: BODY,
                fontWeight: 800,
                fontSize: 9.5,
                letterSpacing: ".1em",
                color: active ? ACCENT_GOLD : "#b07ec0",
                textAlign: col.align,
                transition: `transform 120ms ${EASE}, color 120ms ${EASE}`,
              }}
            >
              {col.label}
              {active ? (sortDir === "desc" ? " ▼" : " ▲") : ""}
            </button>
          );
        })}
      </div>

      {/* rows */}
      {rows.length === 0 ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: "#9a7aa8", padding: "22px 8px", textAlign: "center" }}>
          No tacos logged yet. Log your first one to start the map. 🌮
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column" }}>
          {rows.map((row, i) => (
            <div
              key={row.id}
              className="tacos-row"
              style={{
                display: "flex",
                alignItems: "center",
                fontFamily: BODY,
                fontSize: 13,
                color: "#e8d2e6",
                padding: "9px 8px",
                borderBottom: i < rows.length - 1 ? `1px solid rgba(236,160,230,.08)` : "none",
                transition: `background 120ms ${EASE}`,
              }}
            >
              <span style={{ ...cellStyle(COLUMNS[0]), fontWeight: 700 }}>{row.place}</span>
              <span style={{ ...cellStyle(COLUMNS[1]), color: "#c9a9d6" }}>{row.city}</span>
              <span style={{ ...cellStyle(COLUMNS[2]), color: "#c9a9d6" }}>{row.state}</span>
              <span style={{ ...cellStyle(COLUMNS[3]), color: "#c9a9d6" }}>{row.taco_type}</span>
              <span
                style={{
                  ...cellStyle(COLUMNS[4]),
                  fontFamily: DISPLAY,
                  fontSize: 17,
                  color: ratingColor(row.rating),
                }}
              >
                {row.rating ?? "—"}
              </span>
              <span style={{ ...cellStyle(COLUMNS[5]), color: "#ffa24d", fontWeight: 700 }}>
                {row.price_tier ?? "—"}
              </span>
              <span style={{ ...cellStyle(COLUMNS[6]), fontFamily: MONO, fontSize: 10, color: "#9a7aa8" }}>
                {fmtDate(row.visited_at)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function RatingHistogram({ rows }: { rows: readonly TacoApiRow[] }) {
  const buckets = ratingHistogram(rows);
  const max = Math.max(1, ...buckets);
  const rated = buckets.reduce((s, n) => s + n, 0);
  const modeIndex = buckets.reduce((best, n, i) => (n > buckets[best] ? i : best), 0);

  return (
    <div style={card({ flex: 1 })}>
      <div style={{ ...cardHeading, marginBottom: 2 }}>RATING SPREAD</div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: "#b07ec0", marginBottom: 16 }}>
        {rated > 0 ? `${rated} RATED · MODE ${modeIndex + 1}` : "NO RATINGS YET"}
      </div>
      <div style={{ display: "flex", gap: 6, alignItems: "flex-end", height: 120, padding: "0 4px" }}>
        {buckets.map((count, i) => {
          const rating = i + 1;
          const pct = Math.round((count / max) * 100);
          const isMode = count > 0 && i === modeIndex;
          return (
            <div
              key={rating}
              style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}
            >
              <div style={{ fontFamily: DISPLAY, fontSize: 12, color: count > 0 ? "#cf9fe0" : "#5a3a62", marginBottom: 4 }}>
                {count}
              </div>
              <div
                style={{
                  width: "100%",
                  height: `${Math.max(count > 0 ? 6 : 2, pct)}%`,
                  background:
                    count === 0
                      ? "rgba(236,160,230,.1)"
                      : `linear-gradient(180deg,${ACCENT_GOLD},${ACCENT_PINK})`,
                  borderRadius: "4px 4px 0 0",
                  boxShadow: isMode ? "0 0 14px rgba(255,180,60,.4)" : "none",
                  transition: `height 250ms ${EASE}`,
                }}
              />
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", gap: 6, fontFamily: BODY, fontWeight: 800, fontSize: 10, color: "#b07ec0", marginTop: 7, padding: "0 4px" }}>
        {buckets.map((_, i) => (
          <span key={i} style={{ flex: 1, textAlign: "center", color: i === modeIndex ? ACCENT_GOLD : "#b07ec0" }}>
            {i + 1}
          </span>
        ))}
      </div>
    </div>
  );
}

function ByCity({ rows }: { rows: readonly TacoApiRow[] }) {
  const stats = cityStats(rows);
  const maxCount = Math.max(1, ...stats.map((s) => s.count));

  return (
    <div style={card({ flex: 1 })}>
      <div style={{ ...cardHeading, marginBottom: 2 }}>BY CITY</div>
      <div style={{ fontFamily: MONO, fontSize: 9, color: "#b07ec0", marginBottom: 14 }}>COUNT · AVG RATING</div>
      {stats.length === 0 ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: "#9a7aa8", padding: "18px 0", textAlign: "center" }}>
          No cities yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {stats.map((s) => (
            <div key={s.city} style={{ display: "flex", alignItems: "center", gap: 11 }}>
              <span
                style={{ width: 84, fontFamily: BODY, fontWeight: 700, fontSize: 12, color: "#e8d2e6", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                title={s.city}
              >
                {s.city}
              </span>
              <div style={{ flex: 1, height: 14, borderRadius: 4, background: "rgba(236,160,230,.12)", overflow: "hidden" }}>
                <div
                  style={{
                    width: `${Math.round((s.count / maxCount) * 100)}%`,
                    height: "100%",
                    background: `linear-gradient(90deg,${ACCENT_PINK},#ffb24d)`,
                    transition: `width 250ms ${EASE}`,
                  }}
                />
              </div>
              <span style={{ width: 56, textAlign: "right", fontFamily: DISPLAY, fontSize: 14, color: "#fff" }}>
                {s.count}{" "}
                <span style={{ fontSize: 10, color: s.avg !== null && s.avg >= 8 ? "#7dffb0" : ACCENT_GOLD }}>
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

// --- quick-log form (optional nicety) ----------------------------------------

interface FormState {
  place: string;
  city: string;
  state: string;
  taco_type: string;
  rating: number;
  price_tier: PriceTier;
}

const EMPTY_FORM: FormState = {
  place: "",
  city: "",
  state: "",
  taco_type: "",
  rating: 8,
  price_tier: "$",
};

const fieldLabel: CSSProperties = {
  fontFamily: BODY,
  fontWeight: 800,
  fontSize: 9,
  letterSpacing: ".12em",
  color: "#b07ec0",
  marginBottom: 5,
};

const inputStyle: CSSProperties = {
  width: "100%",
  background: "#1c0f22",
  boxShadow: `inset 0 0 0 1px rgba(236,160,230,.25)`,
  border: "none",
  borderRadius: 9,
  padding: "10px 13px",
  fontFamily: BODY,
  fontWeight: 700,
  fontSize: 14,
  color: "#ffd9f4",
  outline: "none",
  boxSizing: "border-box",
};

function QuickLog({ onLogged }: { onLogged: () => void }) {
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const canSubmit =
    form.place.trim() !== "" &&
    form.city.trim() !== "" &&
    form.state.trim() !== "" &&
    form.taco_type.trim() !== "";

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const res = await fetch("/api/tacos", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          place: form.place.trim(),
          city: form.city.trim(),
          state: form.state.trim(),
          taco_type: form.taco_type.trim(),
          rating: form.rating,
          price_tier: form.price_tier,
        }),
      });
      if (!res.ok) {
        setErrorMsg("Could not log taco — try again.");
        return;
      }
      setForm(EMPTY_FORM);
      onLogged();
    } catch {
      setErrorMsg("Network error — try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ width: 298, flex: "none" }}>
      <div style={{ background: "#0a0510", borderRadius: 38, boxShadow: "inset 0 0 0 2px #3a1e3e,0 0 0 6px #160a18,0 14px 40px rgba(0,0,0,.5)", padding: 12 }}>
        <div style={{ background: "radial-gradient(120% 80% at 50% 0%,#2a1430,#160a1c)", borderRadius: 28, overflow: "hidden", display: "flex", flexDirection: "column", paddingBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 18px 8px", fontFamily: MONO, fontSize: 10, color: "#cf9fe0" }}>
            <span>9:41</span>
            <span style={{ width: 54, height: 16, background: "#0a0510", borderRadius: "0 0 10px 10px" }} />
            <span>▮▮▮</span>
          </div>
          <div style={{ padding: "6px 16px 0", display: "flex", flexDirection: "column", gap: 11 }}>
            <div style={{ fontFamily: DISPLAY, fontSize: 22, color: "#ffd9f4", lineHeight: 1 }}>
              LOG A TACO <span style={{ fontSize: 18 }}>🌮</span>
            </div>

            <div>
              <div style={fieldLabel}>PLACE</div>
              <input style={inputStyle} value={form.place} placeholder="El Farolito" onChange={(e) => update("place", e.target.value)} />
            </div>

            <div style={{ display: "flex", gap: 9 }}>
              <div style={{ flex: 1.3 }}>
                <div style={fieldLabel}>CITY</div>
                <input style={inputStyle} value={form.city} placeholder="SF" onChange={(e) => update("city", e.target.value)} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={fieldLabel}>STATE</div>
                <input style={inputStyle} value={form.state} placeholder="CA" onChange={(e) => update("state", e.target.value)} />
              </div>
            </div>

            <div>
              <div style={fieldLabel}>TYPE</div>
              <input style={inputStyle} value={form.taco_type} placeholder="Al Pastor" onChange={(e) => update("taco_type", e.target.value)} />
            </div>

            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
                <span style={fieldLabel}>RATING</span>
                <span style={{ fontFamily: DISPLAY, fontSize: 20, color: ratingColor(form.rating), lineHeight: 1 }}>
                  {form.rating}
                  <span style={{ fontSize: 11, color: "#b07ec0" }}>/10</span>
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
                      aria-label={`Rate ${value}`}
                      className="tacos-press"
                      onClick={() => update("rating", value)}
                      style={{
                        flex: 1,
                        height: 24,
                        border: "none",
                        borderRadius: 4,
                        cursor: "pointer",
                        background: lit ? `linear-gradient(180deg,${ACCENT_PINK},${ACCENT_PURPLE})` : "#1c0f22",
                        boxShadow: lit ? "none" : `inset 0 0 0 1px rgba(236,160,230,.25)`,
                        transition: `transform 120ms ${EASE}`,
                      }}
                    />
                  );
                })}
              </div>
            </div>

            <div>
              <div style={fieldLabel}>PRICE TIER</div>
              <div style={{ display: "flex", gap: 8 }}>
                {PRICE_TIERS.map((tier) => {
                  const active = form.price_tier === tier;
                  return (
                    <button
                      key={tier}
                      type="button"
                      className="tacos-press"
                      onClick={() => update("price_tier", tier)}
                      style={{
                        flex: 1,
                        height: 44,
                        border: "none",
                        borderRadius: 9,
                        cursor: "pointer",
                        fontFamily: DISPLAY,
                        fontSize: 18,
                        background: active ? "linear-gradient(180deg,#ffb24d,#ff7a18)" : "#1c0f22",
                        color: active ? "#2a1000" : "#8a6a98",
                        boxShadow: active ? "0 0 14px rgba(255,150,40,.35)" : `inset 0 0 0 1px rgba(236,160,230,.25)`,
                        transition: `transform 120ms ${EASE}`,
                      }}
                    >
                      {tier}
                    </button>
                  );
                })}
              </div>
            </div>

            {errorMsg ? (
              <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11, color: "#ff9a8a" }}>{errorMsg}</div>
            ) : null}

            <button
              type="button"
              className="tacos-press"
              disabled={!canSubmit || submitting}
              onClick={submit}
              style={{
                height: 56,
                border: "none",
                borderRadius: 12,
                cursor: canSubmit && !submitting ? "pointer" : "not-allowed",
                background: `linear-gradient(90deg,${ACCENT_PINK},${ACCENT_PURPLE})`,
                boxShadow: "0 0 20px rgba(220,90,255,.4)",
                fontFamily: DISPLAY,
                fontSize: 18,
                color: "#fff",
                letterSpacing: ".04em",
                opacity: canSubmit && !submitting ? 1 : 0.5,
                transition: `transform 120ms ${EASE}, opacity 120ms ${EASE}`,
              }}
            >
              {submitting ? "LOGGING…" : "LOG TACO →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- main section -------------------------------------------------------------

interface TacosSectionProps {
  tacos: Tacos;
}

/**
 * Taco Tracker — KPI strip (from the summary prop) + the full log self-fetched from
 * `/api/tacos`, rendered as a sortable table, a rating histogram, and a by-city grouping.
 */
export function TacosSection({ tacos }: TacosSectionProps) {
  const [rows, setRows] = useState<TacoApiRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [sortKey, setSortKey] = useState<SortKey>("rating");
  const [sortDir, setSortDir] = useState<SortDir>("desc");

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    try {
      const res = await fetch("/api/tacos", { headers: { accept: "application/json" } });
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
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const onSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      // Sensible defaults: numbers/dates start desc, text starts asc.
      setSortDir(key === "rating" || key === "visited_at" ? "desc" : "asc");
    }
  };

  const sortedRows = useMemo(
    () => [...rows].sort((a, b) => compareRows(a, b, sortKey, sortDir)),
    [rows, sortKey, sortDir],
  );

  // KPI strip is driven by the summary prop (authoritative, non-PII roll-up).
  const avgRating = tacos.avg_rating;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      <style>{`
        .tacos-row:hover { background: rgba(236,160,230,.06); }
        .tacos-sort:hover { color: #ffd9f4; }
        .tacos-sort:active { transform: scale(0.97); }
        .tacos-press:active { transform: scale(0.97); }
        @media (prefers-reduced-motion: reduce) {
          .tacos-row, .tacos-sort, .tacos-press { transition: none !important; }
          .tacos-sort:active, .tacos-press:active { transform: none !important; }
        }
      `}</style>

      {/* KPI strip */}
      <div style={{ display: "flex", gap: 13 }}>
        <KpiCard
          label="TOTAL LOGGED"
          value={fmtNum(tacos.total)}
          sub={tacos.total === 0 ? "NO TACOS YET" : "ALL TIME"}
          valueColor="#fff"
          subColor={ACCENT_PINK}
        />
        <KpiCard
          label="AVG RATING"
          value={avgRating === null ? "—" : avgRating.toFixed(1)}
          sub="OUT OF 10"
          valueColor={ACCENT_GOLD}
          subColor="#cf9fe0"
        />
        <KpiCard
          label="LAST SPOT"
          value={tacos.last_spot ?? "—"}
          sub={tacos.last_spot ? "MOST RECENT VISIT" : "AWAITING FIRST LOG"}
          valueColor="#fff"
          subColor="#cf9fe0"
          flex={1.4}
        />
        <KpiCard
          label="CITIES"
          value={fmtNum(tacos.cities)}
          sub={tacos.cities === 1 ? "1 CITY" : "DISTINCT CITIES"}
          valueColor="#ffa24d"
          subColor="#cf9fe0"
        />
      </div>

      {/* table + quick-log phone */}
      <div style={{ display: "flex", gap: 13, alignItems: "flex-start" }}>
        {loading ? (
          <div style={card({ flex: 1.6 })}>
            <div style={{ fontFamily: BODY, fontSize: 13, color: "#9a7aa8", padding: "22px 8px", textAlign: "center" }}>
              Loading the log…
            </div>
          </div>
        ) : loadError ? (
          <div style={card({ flex: 1.6 })}>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, padding: "22px 8px" }}>
              <div style={{ fontFamily: BODY, fontSize: 13, color: "#ff9a8a" }}>Could not load the taco log.</div>
              <button
                type="button"
                className="tacos-press"
                onClick={() => void load()}
                style={{
                  border: "none",
                  borderRadius: 9,
                  cursor: "pointer",
                  padding: "9px 18px",
                  background: `linear-gradient(90deg,${ACCENT_PINK},${ACCENT_PURPLE})`,
                  fontFamily: DISPLAY,
                  fontSize: 14,
                  color: "#fff",
                  transition: `transform 120ms ${EASE}`,
                }}
              >
                RETRY
              </button>
            </div>
          </div>
        ) : (
          <LogTable rows={sortedRows} sortKey={sortKey} sortDir={sortDir} onSort={onSort} />
        )}

        <QuickLog onLogged={() => void load()} />
      </div>

      {/* histogram + cities */}
      <div style={{ display: "flex", gap: 13, alignItems: "stretch" }}>
        <RatingHistogram rows={rows} />
        <ByCity rows={rows} />
      </div>
    </div>
  );
}
