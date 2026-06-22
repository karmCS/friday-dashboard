"use client";

/**
 * ATHLETE INSPECTOR — Deficit drill-down (the one PII surface, read LIVE on demand).
 *
 * Wires to `GET /api/inspector` (src/app/api/inspector/route.ts), two modes:
 *   ?q=<name|uuid>     → { data: { mode: "search", athletes: Athlete[] } }
 *   ?fighter_id=<uuid> → { data: { mode: "detail", athlete, timeline[], bodyweight[] } }
 *
 * ⚠ PRIVACY: this renders ONLY what the server returns. Nothing here is hardcoded or faked —
 * no sample athletes, no sample journal text. With no service_role key in dev the API returns
 * empty arrays, so the default state is a clean "Search for an athlete" prompt and a no-results
 * search shows "No athletes found." All fetched JSON is narrowed from `unknown` (no `any`).
 *
 * Mood (per design/Friday.dc.html INSPECTOR): calmer/darker than the gacha Overview — flat
 * `#0c1620`/`#0e1c27` panels with subtle 1px borders, not the bright clip-path Questism frames.
 * Charts are hand-built inline SVG (no library).
 *
 * Motion (Emil Kowalski): single custom ease, transform/opacity only, 120–250ms. Rows/chips
 * brighten on hover; the selected chip has a clear active state. Search results just appear —
 * no entrance choreography. All motion is guarded by `prefers-reduced-motion`.
 */

import { CSSProperties, useEffect, useRef, useState } from "react";

// --- API shapes (narrowed from unknown — never trust the wire) ----------------

interface Athlete {
  fighter_id: string;
  athlete: string | null;
  email: string | null;
  sport: string | null;
}

interface TimelineEntry {
  when_at: string | null;
  kind: string | null;
  source: string | null;
  camp_context: string | null;
  text: string | null;
}

interface BodyweightPoint {
  date: string | null;
  weight: number | null;
}

interface DetailData {
  athlete: Athlete | null;
  timeline: TimelineEntry[];
  bodyweight: BodyweightPoint[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

/** Narrows one unknown row into an {@link Athlete}, or null when it lacks a usable id. */
function parseAthlete(value: unknown): Athlete | null {
  if (!isRecord(value)) return null;
  const fighterId = value.fighter_id;
  if (typeof fighterId !== "string" || fighterId === "") return null;
  return {
    fighter_id: fighterId,
    athlete: asString(value.athlete),
    email: asString(value.email),
    sport: asString(value.sport),
  };
}

/** Narrows `{ data: { mode: "search", athletes } }` into a clean athlete array. */
function parseSearch(value: unknown): Athlete[] {
  if (!isRecord(value) || !isRecord(value.data)) return [];
  const athletes = value.data.athletes;
  if (!Array.isArray(athletes)) return [];
  return athletes.map(parseAthlete).filter((a): a is Athlete => a !== null);
}

function parseTimelineEntry(value: unknown): TimelineEntry {
  if (!isRecord(value)) {
    return { when_at: null, kind: null, source: null, camp_context: null, text: null };
  }
  return {
    when_at: asString(value.when_at),
    kind: asString(value.kind),
    source: asString(value.source),
    camp_context: asString(value.camp_context),
    text: asString(value.text),
  };
}

function parseBodyweightPoint(value: unknown): BodyweightPoint | null {
  if (!isRecord(value)) return null;
  const weight = typeof value.weight === "number" ? value.weight : null;
  const date = asString(value.date);
  if (date === null || weight === null) return null;
  return { date, weight };
}

/** Narrows `{ data: { mode: "detail", athlete, timeline, bodyweight } }`. */
function parseDetail(value: unknown): DetailData {
  if (!isRecord(value) || !isRecord(value.data)) {
    return { athlete: null, timeline: [], bodyweight: [] };
  }
  const data = value.data;
  const timeline = Array.isArray(data.timeline) ? data.timeline.map(parseTimelineEntry) : [];
  const bodyweight = Array.isArray(data.bodyweight)
    ? data.bodyweight.map(parseBodyweightPoint).filter((p): p is BodyweightPoint => p !== null)
    : [];
  return { athlete: parseAthlete(data.athlete), timeline, bodyweight };
}

// --- style tokens (Inspector mood: flat, dark, subtle borders) ----------------

const DISPLAY = "'Black Han Sans',sans-serif";
const BODY = "'Barlow',sans-serif";
const MONO = "'JetBrains Mono',monospace";
const EASE = "cubic-bezier(0.23,1,0.32,1)";

const PANEL_BG = "#0c1620";
const ENTRY_BG = "#0e1c27";
const BORDER = "rgba(120,150,170,.18)";
const BORDER_SOFT = "rgba(120,150,170,.14)";
const TEXT = "#dceef2";
const TEXT_DIM = "#9fb4c0";
const TEXT_MUTE = "#6f8a98";
const TEXT_FAINT = "#5d7785";
const ACCENT = "#5fc8d8";
const SEARCH_DEBOUNCE_MS = 300;

/** A flat Inspector panel — no clip-path, just a soft inset 1px border. */
const panel = (extra?: CSSProperties): CSSProperties => ({
  background: PANEL_BG,
  boxShadow: `inset 0 0 0 1px ${BORDER}`,
  borderRadius: 11,
  padding: "18px 20px",
  ...extra,
});

const panelHeading: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: 16,
  color: TEXT,
  letterSpacing: ".03em",
};

const panelMeta: CSSProperties = {
  fontFamily: MONO,
  fontSize: 9,
  color: TEXT_FAINT,
};

/**
 * Timeline entries are colour-coded by `kind` (left border + tag), matching the design's
 * post-comp / coach-chat / weekly-check-in / camp-debrief swatches. The match is fuzzy on
 * normalized kind text so server variants (e.g. "post_comp_review", "weekly check-in") land.
 */
interface KindStyle {
  border: string;
  tagBg: string;
  tagColor: string;
}

const KIND_FALLBACK: KindStyle = {
  border: "#6f8a98",
  tagBg: "rgba(120,150,170,.16)",
  tagColor: "#9fb4c0",
};

const KIND_RULES: ReadonlyArray<{ match: readonly string[]; style: KindStyle }> = [
  {
    match: ["post-comp", "postcomp", "post comp", "post-fight", "post fight"],
    style: { border: "#ffce85", tagBg: "rgba(255,180,80,.14)", tagColor: "#ffce85" },
  },
  {
    match: ["coach"],
    style: { border: "#8fdfe8", tagBg: "rgba(95,184,200,.16)", tagColor: "#8fdfe8" },
  },
  {
    match: ["debrief", "camp-debrief"],
    style: { border: "#c2acff", tagBg: "rgba(160,130,255,.16)", tagColor: "#c2acff" },
  },
  {
    match: ["check-in", "checkin", "check in", "weekly"],
    style: { border: "#9fc2ff", tagBg: "rgba(90,160,255,.16)", tagColor: "#9fc2ff" },
  },
];

function kindStyle(kind: string | null): KindStyle {
  if (!kind) return KIND_FALLBACK;
  const norm = kind.toLowerCase();
  for (const rule of KIND_RULES) {
    if (rule.match.some((m) => norm.includes(m))) return rule.style;
  }
  return KIND_FALLBACK;
}

// --- helpers ------------------------------------------------------------------

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

/** First letter of a name for the avatar disc; "?" when unknown. */
function initial(name: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?";
}

/** A safe display name — never leaks an empty string. */
function displayName(athlete: Athlete): string {
  const name = (athlete.athlete ?? "").trim();
  return name.length > 0 ? name : "Unknown athlete";
}

/** Short uuid prefix for chips ("a7f3"); "—" when missing. */
function shortId(fighterId: string): string {
  const head = fighterId.split("-")[0] ?? fighterId;
  return head.slice(0, 4) || "—";
}

/** "JUN 18" from an ISO/`YYYY-MM-DD` string ("—" on parse failure). */
function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** Uppercased, space-normalized tag label from a raw kind ("WEEKLY CHECK-IN"). */
function tagLabel(kind: string | null): string {
  if (!kind) return "ENTRY";
  return kind.replace(/[_-]+/g, " ").trim().toUpperCase() || "ENTRY";
}

/** Joins source + camp_context into the entry's sub-line ("Fight Camp 3 · welter"). */
function entrySubline(entry: TimelineEntry): string {
  return [entry.source, entry.camp_context].filter((s): s is string => !!s && s.trim() !== "").join(" · ");
}

// --- networking ---------------------------------------------------------------

const SEARCH_PATH = "/api/inspector";

async function fetchJson(url: string, signal: AbortSignal): Promise<unknown> {
  const res = await fetch(url, { headers: { accept: "application/json" }, signal });
  if (!res.ok) throw new Error(`Request failed (${res.status}).`);
  return (await res.json()) as unknown;
}

// --- subcomponents ------------------------------------------------------------

function SearchBar({
  value,
  onChange,
  busy,
}: {
  value: string;
  onChange: (v: string) => void;
  busy: boolean;
}) {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        alignItems: "center",
        gap: 11,
        background: "#0d1a24",
        boxShadow: "inset 0 0 0 1px rgba(120,150,170,.2)",
        borderRadius: 9,
        padding: "11px 17px",
      }}
    >
      <span style={{ color: ACCENT, fontSize: 16 }} aria-hidden>
        ⌕
      </span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search athlete by name or UUID…"
        aria-label="Search athlete by name or UUID"
        spellCheck={false}
        autoComplete="off"
        style={{
          flex: 1,
          background: "transparent",
          border: "none",
          outline: "none",
          fontFamily: BODY,
          fontSize: 13.5,
          color: TEXT,
          padding: 0,
        }}
      />
      <span
        style={{
          fontFamily: MONO,
          fontSize: 10,
          color: busy ? ACCENT : "#3f5666",
          letterSpacing: ".08em",
          transition: `color 150ms ${EASE}`,
        }}
      >
        {busy ? "…" : "⌘K"}
      </span>
    </div>
  );
}

function AthleteChip({
  athlete,
  selected,
  onSelect,
}: {
  athlete: Athlete;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`insp-chip${selected ? " insp-chip-on" : ""}`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        background: selected ? "#0d2027" : PANEL_BG,
        boxShadow: selected
          ? "inset 0 0 0 1px rgba(95,184,200,.5),0 0 16px rgba(70,160,180,.12)"
          : "inset 0 0 0 1px rgba(120,150,170,.16)",
        borderRadius: 9,
        border: "none",
        padding: "9px 14px 9px 10px",
        cursor: "pointer",
        textAlign: "left",
        transition: `transform 120ms ${EASE}, box-shadow 150ms ${EASE}, background 150ms ${EASE}`,
      }}
    >
      <span
        style={{
          width: 30,
          height: 30,
          flex: "none",
          borderRadius: "50%",
          background: selected ? "linear-gradient(135deg,#3f8a98,#5fc8d8)" : "#27323b",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: DISPLAY,
          fontSize: 14,
          color: selected ? "#06222a" : "#8aa0ac",
        }}
        aria-hidden
      >
        {initial(athlete.athlete)}
      </span>
      <span style={{ minWidth: 0 }}>
        <span
          style={{
            display: "block",
            fontFamily: BODY,
            fontWeight: 700,
            fontSize: 12.5,
            color: selected ? TEXT : TEXT_DIM,
            lineHeight: 1,
            maxWidth: 150,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {displayName(athlete)}
        </span>
        <span style={{ display: "block", fontFamily: MONO, fontSize: 9, color: selected ? "#5d8590" : "#4f6975", marginTop: 3 }}>
          {shortId(athlete.fighter_id)}
          {athlete.sport ? ` · ${athlete.sport.toLowerCase()}` : ""}
        </span>
      </span>
    </button>
  );
}

function Timeline({ entries }: { entries: readonly TimelineEntry[] }) {
  return (
    <div style={panel({ flex: 1.55 })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 16 }}>
        <div style={{ ...panelHeading, fontSize: 18 }}>TIMELINE</div>
        <div style={panelMeta}>
          {entries.length === 0
            ? "NO ENTRIES"
            : `${entries.length} ${entries.length === 1 ? "ENTRY" : "ENTRIES"} · NEWEST FIRST`}
        </div>
      </div>

      {entries.length === 0 ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: TEXT_MUTE, padding: "28px 4px", textAlign: "center" }}>
          No journal entries for this athlete yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 11 }}>
          {entries.map((entry, i) => {
            const ks = kindStyle(entry.kind);
            const sub = entrySubline(entry);
            return (
              <article
                key={i}
                className="insp-entry"
                style={{
                  background: ENTRY_BG,
                  boxShadow: `inset 0 0 0 1px ${BORDER_SOFT}`,
                  borderRadius: 8,
                  padding: "14px 16px",
                  borderLeft: `2px solid ${ks.border}`,
                  transition: `transform 120ms ${EASE}, box-shadow 150ms ${EASE}`,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 9, marginBottom: 9, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontFamily: BODY,
                      fontWeight: 800,
                      fontSize: 9.5,
                      letterSpacing: ".1em",
                      padding: "3px 8px",
                      borderRadius: 4,
                      background: ks.tagBg,
                      color: ks.tagColor,
                    }}
                  >
                    {tagLabel(entry.kind)}
                  </span>
                  {sub ? <span style={{ fontFamily: BODY, fontSize: 11, color: TEXT_MUTE }}>{sub}</span> : null}
                  <span style={{ marginLeft: "auto", fontFamily: MONO, fontSize: 10, color: TEXT_FAINT }}>
                    {fmtDay(entry.when_at)}
                  </span>
                </div>
                <div style={{ fontFamily: BODY, fontSize: 13.5, lineHeight: 1.6, color: "#c4d6e0", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                  {entry.text && entry.text.trim() !== "" ? entry.text : <span style={{ color: TEXT_FAINT }}>—</span>}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function AthleteHeader({ athlete }: { athlete: Athlete }) {
  return (
    <div style={panel()}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 15 }}>
        <div
          style={{
            width: 44,
            height: 44,
            flex: "none",
            borderRadius: "50%",
            background: "linear-gradient(135deg,#3f8a98,#5fc8d8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: DISPLAY,
            fontSize: 22,
            color: "#06222a",
          }}
          aria-hidden
        >
          {initial(athlete.athlete)}
        </div>
        <div style={{ minWidth: 0 }}>
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: 20,
              color: TEXT,
              lineHeight: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName(athlete).toUpperCase()}
          </div>
          <div style={{ fontFamily: MONO, fontSize: 10, color: "#5d8590", marginTop: 4, wordBreak: "break-all" }}>
            uuid {athlete.fighter_id}
            {athlete.sport ? ` · ${athlete.sport}` : ""}
          </div>
          {athlete.email ? (
            <div style={{ fontFamily: MONO, fontSize: 10, color: TEXT_FAINT, marginTop: 3, wordBreak: "break-all" }}>
              {athlete.email}
            </div>
          ) : null}
        </div>
      </div>

      {/* Weight-class / weigh-in / made-weight aren't in the API yet — labeled placeholders. */}
      <div style={{ display: "flex", gap: 10 }}>
        <PlaceholderTile label="WEIGHT CLASS" />
        <PlaceholderTile label="TO WEIGH-IN" />
        <PlaceholderTile label="MADE WEIGHT" />
      </div>
    </div>
  );
}

function PlaceholderTile({ label }: { label: string }) {
  return (
    <div style={{ flex: 1, background: ENTRY_BG, boxShadow: `inset 0 0 0 1px ${BORDER_SOFT}`, borderRadius: 7, padding: "10px 12px" }}>
      <div style={{ fontFamily: DISPLAY, fontSize: 20, color: TEXT_FAINT, lineHeight: 1 }}>—</div>
      <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 8.5, letterSpacing: ".08em", color: TEXT_MUTE, marginTop: 5 }}>
        {label}
      </div>
    </div>
  );
}

/** DAILY MACROS — labeled placeholder; macros aren't in the inspector response yet. */
function MacrosPanel() {
  return (
    <div style={panel()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 13 }}>
        <div style={panelHeading}>DAILY MACROS</div>
        <div style={panelMeta}>PENDING</div>
      </div>
      <div
        style={{
          fontFamily: BODY,
          fontSize: 12.5,
          lineHeight: 1.55,
          color: TEXT_MUTE,
          background: ENTRY_BG,
          boxShadow: `inset 0 0 0 1px ${BORDER_SOFT}`,
          borderRadius: 7,
          padding: "16px 16px",
          textAlign: "center",
        }}
      >
        pending — to be read live from Supabase
      </div>
    </div>
  );
}

// --- bodyweight SVG (hand-built, no library) ----------------------------------

const BW_W = 300;
const BW_H = 96;
const BW_PAD_X = 12;
const BW_PAD_TOP = 14;
const BW_PAD_BOTTOM = 18;

/** A bodyweight point guaranteed to have a numeric weight (nulls filtered out upstream). */
type PlottablePoint = { date: string | null; weight: number };

interface ScaledPoint {
  x: number;
  y: number;
  point: PlottablePoint;
}

/** Maps weight points into SVG coords; a single point sits centered, flat. */
function scalePoints(points: readonly PlottablePoint[]): ScaledPoint[] {
  if (points.length === 0) return [];
  const weights = points.map((p) => p.weight);
  const min = Math.min(...weights);
  const max = Math.max(...weights);
  const span = max - min;
  const innerW = BW_W - BW_PAD_X * 2;
  const innerH = BW_H - BW_PAD_TOP - BW_PAD_BOTTOM;

  return points.map((point, i) => {
    const x = points.length === 1 ? BW_W / 2 : BW_PAD_X + (innerW * i) / (points.length - 1);
    // Higher weight → higher on chart (smaller y). Flat line when span is 0.
    const t = span === 0 ? 0.5 : (point.weight - min) / span;
    const y = BW_PAD_TOP + innerH * (1 - t);
    return { x, y, point };
  });
}

function BodyweightPanel({ points }: { points: readonly BodyweightPoint[] }) {
  // Keep only points with a numeric weight, then the chart math is null-free.
  const plottable: PlottablePoint[] = points.filter(
    (p): p is PlottablePoint => typeof p.weight === "number",
  );
  const scaled = scalePoints(plottable);
  const hasData = scaled.length > 0;

  const first = plottable[0];
  const last = plottable[plottable.length - 1];
  const delta = hasData && first && last ? last.weight - first.weight : null;
  const deltaColor = delta === null ? TEXT_MUTE : delta <= 0 ? "#7dd6a0" : "#ff9a8a";
  const deltaArrow = delta === null ? "" : delta <= 0 ? "▼" : "▲";

  const line = scaled.map((s) => `${s.x.toFixed(1)},${s.y.toFixed(1)}`).join(" ");
  const area = hasData
    ? `${line} ${scaled[scaled.length - 1].x.toFixed(1)},${BW_H} ${scaled[0].x.toFixed(1)},${BW_H}`
    : "";
  const tail = hasData ? scaled[scaled.length - 1] : null;

  return (
    <div style={panel()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <div style={panelHeading}>BODYWEIGHT</div>
        <div style={panelMeta}>{hasData ? `${plottable.length} PT${plottable.length === 1 ? "" : "S"}` : "NO DATA"}</div>
      </div>

      {hasData ? (
        <>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 6 }}>
            <span style={{ fontFamily: DISPLAY, fontSize: 28, color: TEXT, lineHeight: 1 }}>
              {last ? last.weight.toFixed(1) : "—"}
            </span>
            {delta !== null ? (
              <span style={{ fontFamily: BODY, fontWeight: 700, fontSize: 12, color: deltaColor }}>
                {deltaArrow} {Math.abs(delta).toFixed(1)} lb
              </span>
            ) : null}
          </div>
          <svg viewBox={`0 0 ${BW_W} ${BW_H}`} style={{ width: "100%", height: 84, display: "block" }} role="img" aria-label="Bodyweight trend">
            <polygon points={area} fill={ACCENT} opacity={0.08} />
            <polyline points={line} fill="none" stroke={ACCENT} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" />
            {tail ? (
              <>
                <circle cx={tail.x} cy={tail.y} r={4} fill="#7dd6a0" />
                <circle cx={tail.x} cy={tail.y} r={7} fill="none" stroke="#7dd6a0" strokeWidth={1.5} opacity={0.4} />
              </>
            ) : null}
          </svg>
          <div style={{ display: "flex", justifyContent: "space-between", fontFamily: MONO, fontSize: 9, color: "#4f6975", marginTop: 2 }}>
            <span>{fmtDay(first?.date ?? null)}</span>
            <span>{fmtDay(last?.date ?? null)}</span>
          </div>
        </>
      ) : (
        <div style={{ fontFamily: BODY, fontSize: 13, color: TEXT_MUTE, padding: "22px 4px", textAlign: "center" }}>
          —<br />
          <span style={{ fontSize: 11, color: TEXT_FAINT }}>No bodyweight logs.</span>
        </div>
      )}
    </div>
  );
}

// --- prompts (empty / loading / error fillers) --------------------------------

function CenteredPanel({ children, tone = "mute" }: { children: React.ReactNode; tone?: "mute" | "error" }) {
  return (
    <div style={panel({ marginTop: 13 })}>
      <div
        style={{
          fontFamily: BODY,
          fontWeight: 700,
          fontSize: 13.5,
          letterSpacing: ".02em",
          color: tone === "error" ? "#ff9a8a" : TEXT_MUTE,
          textAlign: "center",
          padding: "44px 20px",
          lineHeight: 1.6,
        }}
      >
        {children}
      </div>
    </div>
  );
}

// --- main section -------------------------------------------------------------

type DetailStatus = "idle" | "loading" | "ready" | "error";

/**
 * Athlete Inspector — debounced search → selectable chips → live detail (header + tagged
 * timeline + bodyweight trend + macros placeholder). Renders only server data; clean empty,
 * loading, and error states throughout.
 */
export function InspectorSection(): React.JSX.Element {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Athlete[]>([]);
  const [searching, setSearching] = useState(false);
  const [searched, setSearched] = useState(false); // a search has completed at least once for the current query
  const [searchError, setSearchError] = useState(false);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailStatus, setDetailStatus] = useState<DetailStatus>("idle");

  // Tiny inline debounce (no library): re-armed on every keystroke.
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const searchAbortRef = useRef<AbortController | null>(null);
  const detailAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const trimmed = query.trim();

    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (trimmed === "") {
      searchAbortRef.current?.abort();
      setResults([]);
      setSearching(false);
      setSearched(false);
      setSearchError(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(() => {
      searchAbortRef.current?.abort();
      const controller = new AbortController();
      searchAbortRef.current = controller;

      void (async () => {
        try {
          const body = await fetchJson(`${SEARCH_PATH}?q=${encodeURIComponent(trimmed)}`, controller.signal);
          setResults(parseSearch(body));
          setSearchError(false);
          setSearched(true);
        } catch (e: unknown) {
          if (e instanceof DOMException && e.name === "AbortError") return;
          setResults([]);
          setSearchError(true);
          setSearched(true);
        } finally {
          if (!controller.signal.aborted) setSearching(false);
        }
      })();
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  // Tear down in-flight requests on unmount.
  useEffect(() => {
    return () => {
      searchAbortRef.current?.abort();
      detailAbortRef.current?.abort();
    };
  }, []);

  function selectAthlete(athlete: Athlete): void {
    if (athlete.fighter_id === selectedId) return;
    setSelectedId(athlete.fighter_id);
    setDetailStatus("loading");
    setDetail(null);

    detailAbortRef.current?.abort();
    const controller = new AbortController();
    detailAbortRef.current = controller;

    void (async () => {
      try {
        const body = await fetchJson(
          `${SEARCH_PATH}?fighter_id=${encodeURIComponent(athlete.fighter_id)}`,
          controller.signal,
        );
        const parsed = parseDetail(body);
        // The header always shows: prefer the API's athlete, fall back to the chip we clicked.
        setDetail({ ...parsed, athlete: parsed.athlete ?? athlete });
        setDetailStatus("ready");
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setDetailStatus("error");
      }
    })();
  }

  const queryIsUuid = UUID_RE.test(query.trim());
  const showNoResults = searched && !searching && !searchError && results.length === 0;

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      <style>{`
        .insp-chip:hover { box-shadow: inset 0 0 0 1px rgba(120,150,170,.34); }
        .insp-chip-on:hover { box-shadow: inset 0 0 0 1px rgba(95,184,200,.6),0 0 18px rgba(70,160,180,.16); }
        .insp-chip:active { transform: scale(0.98); }
        .insp-entry:hover { box-shadow: inset 0 0 0 1px rgba(120,150,170,.3); }
        @media (prefers-reduced-motion: reduce) {
          .insp-chip, .insp-entry { transition: none !important; }
          .insp-chip:active { transform: none !important; }
        }
      `}</style>

      {/* search + result chips */}
      <div style={{ display: "flex", gap: 11, alignItems: "center", flexWrap: "wrap" }}>
        <SearchBar value={query} onChange={setQuery} busy={searching} />
        {results.map((athlete) => (
          <AthleteChip
            key={athlete.fighter_id}
            athlete={athlete}
            selected={athlete.fighter_id === selectedId}
            onSelect={() => selectAthlete(athlete)}
          />
        ))}
      </div>

      {/* search-level messaging */}
      {searchError ? (
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11.5, color: "#ff9a8a", padding: "0 4px" }}>
          Search failed — check the connection and try again.
        </div>
      ) : showNoResults ? (
        <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11.5, color: TEXT_MUTE, padding: "0 4px" }}>
          No athletes found{queryIsUuid ? " for that UUID" : ` for “${query.trim()}”`}.
        </div>
      ) : null}

      {/* body: prompt | loading | error | detail */}
      {detailStatus === "idle" ? (
        <CenteredPanel>
          Search for an athlete
          <br />
          <span style={{ fontWeight: 600, fontSize: 11.5, color: TEXT_FAINT, letterSpacing: ".06em" }}>
            BY NAME OR UUID TO OPEN THEIR JOURNAL TIMELINE
          </span>
        </CenteredPanel>
      ) : detailStatus === "loading" ? (
        <CenteredPanel>Loading athlete…</CenteredPanel>
      ) : detailStatus === "error" ? (
        <CenteredPanel tone="error">
          Could not load this athlete.
          <br />
          <span style={{ fontWeight: 600, fontSize: 11.5, color: TEXT_FAINT }}>Select the chip again to retry.</span>
        </CenteredPanel>
      ) : detail && detail.athlete ? (
        <div style={{ display: "flex", gap: 13, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div style={{ flex: "1.55 1 380px", minWidth: 300 }}>
            <Timeline entries={detail.timeline} />
          </div>
          <div style={{ flex: "1 1 280px", minWidth: 260, display: "flex", flexDirection: "column", gap: 13 }}>
            <AthleteHeader athlete={detail.athlete} />
            <MacrosPanel />
            <BodyweightPanel points={detail.bodyweight} />
          </div>
        </div>
      ) : (
        // ready but the API returned no athlete (e.g. fighter_id with no rows)
        <CenteredPanel>No record found for this athlete.</CenteredPanel>
      )}
    </div>
  );
}
