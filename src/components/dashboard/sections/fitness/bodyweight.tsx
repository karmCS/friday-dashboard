"use client";

/**
 * Hero bodyweight chart — the FITNESS section's centerpiece.
 *
 * Design ref: MacroFactor's "Scale Weight" + Bevel's weight trend (Mobbin). A smooth,
 * date-scaled line over a soft area fill, a dashed mean reference, a right-aligned y-axis,
 * Average + range-change callouts, and a 1M/3M/6M/1Y/ALL range selector that greys ranges
 * wider than the available history. Bulk history loads via CSV import (Access-gated); the
 * daily point arrives from the iOS Shortcut.
 *
 * Self-fetching (GET /api/fitness/bodyweight). Hand-built inline SVG — no chart library.
 */

import { CSSProperties, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { t, tabularNum } from "@/components/dashboard/tokens";
import { srOnly } from "@/components/dashboard/ui";
import {
  BODY,
  BodyweightResponse,
  Card,
  CardTitle,
  DISPLAY,
  EMPTY_BODYWEIGHT,
  EmptyState,
  fetchData,
  isoDate,
  type LinePoint,
  MONO,
  monthUpper,
  parseIso,
  SkeletonState,
  smoothPath,
} from "./shared";

const ACCENT = "#7fe3ff";
const ACCENT_DEEP = "#46b8ff";

// SVG geometry (responsive via viewBox; width:100%).
const W = 760;
const H = 232;
const PAD_L = 12;
const PAD_R = 46; // room for the right-aligned y-axis labels
const PAD_T = 16;
const PAD_B = 22;
const INNER_W = W - PAD_L - PAD_R;
const INNER_H = H - PAD_T - PAD_B;

interface Range {
  key: string;
  days: number; // Infinity = ALL
}
const RANGES: readonly Range[] = [
  { key: "1M", days: 30 },
  { key: "3M", days: 90 },
  { key: "6M", days: 180 },
  { key: "1Y", days: 365 },
  { key: "ALL", days: Infinity },
];

interface Pt {
  date: string;
  weight: number;
}

/** A range is offered once at least half its window of history exists. ALL is always on. */
function rangeEnabled(range: Range, spanDays: number): boolean {
  return range.days === Infinity || spanDays >= range.days * 0.5;
}

/** Pick a sensible default: prefer 3M, else the first enabled range, else ALL. */
function defaultRange(spanDays: number): string {
  if (rangeEnabled({ key: "3M", days: 90 }, spanDays)) return "3M";
  const firstEnabled = RANGES.find((r) => rangeEnabled(r, spanDays));
  return firstEnabled?.key ?? "ALL";
}

/** Evenly-sampled month-boundary ticks across [first,last], capped to ~5. */
function monthTicks(first: Date, last: Date): Date[] {
  const ticks: Date[] = [];
  const d = new Date(first.getFullYear(), first.getMonth(), 1);
  if (d < first) d.setMonth(d.getMonth() + 1);
  while (d <= last) {
    ticks.push(new Date(d));
    d.setMonth(d.getMonth() + 1);
  }
  if (ticks.length <= 5) return ticks;
  const step = Math.ceil(ticks.length / 5);
  return ticks.filter((_, i) => i % step === 0);
}

const chip = (active: boolean, disabled: boolean): CSSProperties => ({
  appearance: "none",
  border: "none",
  minWidth: 44,
  height: 34,
  padding: "0 12px",
  borderRadius: 8,
  cursor: disabled ? "not-allowed" : "pointer",
  fontFamily: BODY,
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: ".08em",
  background: active ? `linear-gradient(180deg,${ACCENT},${ACCENT_DEEP})` : "rgba(10,32,50,.55)",
  color: active ? "#04101a" : disabled ? "rgba(140,170,190,.4)" : t.textMuted,
  boxShadow: active ? "0 0 14px rgba(80,200,255,.35)" : "inset 0 0 0 1px rgba(120,180,210,.22)",
  ...tabularNum,
});

const callout = (label: string, value: string, color: string, hint?: string) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
    <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 9.5, letterSpacing: ".14em", color: t.textMuted }}>
      {label}
    </span>
    <span style={{ fontFamily: DISPLAY, fontSize: 30, lineHeight: 0.95, color, ...tabularNum }}>{value}</span>
    {hint ? (
      <span style={{ fontFamily: MONO, fontSize: 9.5, color: t.textDim, ...tabularNum }}>{hint}</span>
    ) : null}
  </div>
);

/** Compact in-app manual entry (Access-gated POST), for adding/correcting a day after a CSV import. */
function ManualAdd({ defaultUnit, onAdded }: { defaultUnit: string; onAdded: () => Promise<void> }): React.JSX.Element {
  const [weight, setWeight] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [unit, setUnit] = useState<"lb" | "kg">(defaultUnit === "kg" ? "kg" : "lb");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const num = Number(weight);
  const canSave =
    weight.trim() !== "" && Number.isFinite(num) && num > 0 && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const submit = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch("/api/fitness/bodyweight/manual", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, weight: num, unit }),
      });
      if (!res.ok) throw new Error();
      setWeight("");
      setMsg(`Saved ${num} ${unit} · ${date}`);
      await onAdded();
    } catch {
      setMsg("Could not save — try again.");
    } finally {
      setBusy(false);
    }
  };

  const field: CSSProperties = {
    background: "#0c2335",
    boxShadow: "inset 0 0 0 1px rgba(120,180,210,.28)",
    border: "none",
    borderRadius: 8,
    padding: "0 12px",
    height: 38,
    fontFamily: BODY,
    fontWeight: 700,
    fontSize: 14,
    color: t.text,
    boxSizing: "border-box",
    ...tabularNum,
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      aria-label="Add a bodyweight entry"
      style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 14 }}
    >
      <input
        type="number"
        step="0.1"
        inputMode="decimal"
        value={weight}
        onChange={(e) => setWeight(e.target.value)}
        placeholder="176.5"
        aria-label="Weight"
        style={{ ...field, width: 92 }}
      />
      <div role="radiogroup" aria-label="Unit" style={{ display: "flex", gap: 4 }}>
        {(["lb", "kg"] as const).map((u) => {
          const active = unit === u;
          return (
            <button
              key={u}
              type="button"
              role="radio"
              aria-checked={active}
              className="fr-pressable"
              onClick={() => setUnit(u)}
              style={{
                appearance: "none",
                border: "none",
                height: 38,
                width: 42,
                borderRadius: 8,
                cursor: "pointer",
                fontFamily: BODY,
                fontWeight: 800,
                fontSize: 11,
                letterSpacing: ".06em",
                background: active ? `linear-gradient(180deg,${ACCENT},${ACCENT_DEEP})` : "#0c2335",
                color: active ? "#04101a" : t.textMuted,
                boxShadow: active ? "0 0 12px rgba(80,200,255,.3)" : "inset 0 0 0 1px rgba(120,180,210,.22)",
              }}
            >
              {u.toUpperCase()}
            </button>
          );
        })}
      </div>
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        aria-label="Date"
        style={{ ...field, width: 152 }}
      />
      <button
        type="submit"
        className="fr-pressable"
        disabled={!canSave || busy}
        style={{
          border: "none",
          height: 38,
          padding: "0 18px",
          borderRadius: 8,
          cursor: canSave && !busy ? "pointer" : "not-allowed",
          background: `linear-gradient(90deg,${ACCENT},${ACCENT_DEEP})`,
          color: "#04101a",
          fontFamily: DISPLAY,
          fontSize: 15,
          letterSpacing: ".03em",
          opacity: canSave && !busy ? 1 : 0.5,
        }}
      >
        {busy ? "…" : "ADD"}
      </button>
      <div aria-live="polite" style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11.5, color: t.textMuted }}>
        {msg ?? ""}
      </div>
    </form>
  );
}

export function BodyweightCard(): React.JSX.Element {
  const [data, setData] = useState<BodyweightResponse | null>(null);
  const [error, setError] = useState(false);
  const [range, setRange] = useState<string>("ALL");
  const [rangeTouched, setRangeTouched] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await fetchData<BodyweightResponse>("/api/fitness/bodyweight", EMPTY_BODYWEIGHT);
      setData(res);
    } catch {
      setError(true);
      setData(EMPTY_BODYWEIGHT);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const entries = data?.entries ?? [];
  const unit = entries.length > 0 ? entries[entries.length - 1].unit : "lb";

  // Full-history span drives which ranges are offered + the initial default.
  const spanDays = useMemo(() => {
    if (entries.length < 2) return 0;
    return Math.round(
      (parseIso(entries[entries.length - 1].date).getTime() - parseIso(entries[0].date).getTime()) /
        86_400_000,
    );
  }, [entries]);

  // Settle the default range once data arrives, unless the user has chosen one.
  useEffect(() => {
    if (!rangeTouched && entries.length > 0) setRange(defaultRange(spanDays));
  }, [entries.length, spanDays, rangeTouched]);

  const selected = RANGES.find((r) => r.key === range) ?? RANGES[RANGES.length - 1];

  // Filter to the selected range (by cutoff date from the latest entry).
  const pts: Pt[] = useMemo(() => {
    if (entries.length === 0) return [];
    if (selected.days === Infinity) return entries.map((e) => ({ date: e.date, weight: e.weight }));
    const last = parseIso(entries[entries.length - 1].date);
    const cutoff = new Date(last);
    cutoff.setDate(cutoff.getDate() - selected.days);
    return entries
      .filter((e) => parseIso(e.date) >= cutoff)
      .map((e) => ({ date: e.date, weight: e.weight }));
  }, [entries, selected]);

  const onPickCsv = useCallback(
    async (file: File) => {
      setImporting(true);
      setImportMsg(null);
      try {
        const text = await file.text();
        const res = await fetch("/api/fitness/bodyweight/import", {
          method: "POST",
          headers: { "content-type": "text/csv" },
          body: text,
        });
        const json: unknown = await res.json().catch(() => null);
        if (!res.ok) {
          const msg =
            json && typeof json === "object" && "message" in json
              ? String((json as { message: unknown }).message)
              : "Import failed.";
          setImportMsg(msg);
          return;
        }
        const result =
          json && typeof json === "object" && "data" in json
            ? (json as { data: { imported?: number; skipped?: number } }).data
            : null;
        const imported = result?.imported ?? 0;
        const skipped = result?.skipped ?? 0;
        setImportMsg(`Imported ${imported}${skipped ? ` · skipped ${skipped}` : ""}.`);
        await load();
      } catch {
        setImportMsg("Could not read or import that file.");
      } finally {
        setImporting(false);
      }
    },
    [load],
  );

  // --- render states ---------------------------------------------------------

  if (!data) {
    return (
      <Card>
        <CardTitle title="BODYWEIGHT" sub="LOADING" />
        <SkeletonState height={H} />
      </Card>
    );
  }

  const hidden: CSSProperties = srOnly;

  const ImportControls = (
    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
      <button
        type="button"
        className="fr-pressable"
        onClick={() => fileRef.current?.click()}
        disabled={importing}
        style={{
          appearance: "none",
          border: "none",
          height: 34,
          padding: "0 14px",
          borderRadius: 8,
          cursor: importing ? "wait" : "pointer",
          background: "rgba(10,32,50,.55)",
          boxShadow: "inset 0 0 0 1px rgba(120,180,210,.28)",
          color: t.text,
          fontFamily: BODY,
          fontWeight: 800,
          fontSize: 11,
          letterSpacing: ".08em",
        }}
      >
        {importing ? "IMPORTING…" : "↑ IMPORT CSV"}
      </button>
      <input
        ref={fileRef}
        type="file"
        accept=".csv,text/csv,text/plain"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (fileRef.current) fileRef.current.value = "";
          if (f) void onPickCsv(f);
        }}
        tabIndex={-1}
        aria-hidden
        style={hidden}
      />
    </div>
  );

  if (entries.length === 0) {
    return (
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10, gap: 12 }}>
          <div style={{ fontFamily: DISPLAY, fontSize: 17, color: t.text, letterSpacing: ".03em" }}>BODYWEIGHT</div>
          {ImportControls}
        </div>
        <ManualAdd defaultUnit="lb" onAdded={load} />
        <EmptyState
          label={error ? "COULD NOT LOAD BODYWEIGHT" : "NO BODYWEIGHT YET · ADD AN ENTRY ABOVE OR IMPORT A CSV (date,weight,unit)"}
          height={H}
        />
        <div aria-live="polite" style={{ ...hidden }}>{importMsg ?? ""}</div>
        {importMsg ? (
          <div style={{ marginTop: 10, fontFamily: BODY, fontWeight: 700, fontSize: 11.5, color: t.textMuted }}>{importMsg}</div>
        ) : null}
      </Card>
    );
  }

  // --- stats over the selected range -----------------------------------------
  const latest = entries[entries.length - 1];
  const weights = pts.map((p) => p.weight);
  const avg = weights.length > 0 ? weights.reduce((s, w) => s + w, 0) / weights.length : latest.weight;
  const delta = pts.length >= 2 ? pts[pts.length - 1].weight - pts[0].weight : 0;
  const min = Math.min(...weights);
  const max = Math.max(...weights);

  // --- chart geometry --------------------------------------------------------
  const yPad = max === min ? 1 : Math.max(0.5, (max - min) * 0.14);
  const yMin = min - yPad;
  const yMax = max + yPad;
  const yOf = (w: number) => PAD_T + INNER_H - ((w - yMin) / (yMax - yMin)) * INNER_H;

  const firstDate = parseIso(pts[0].date);
  const lastDate = parseIso(pts[pts.length - 1].date);
  const spanMs = lastDate.getTime() - firstDate.getTime() || 1;
  const xOf = (dateStr: string) =>
    pts.length === 1
      ? PAD_L + INNER_W / 2
      : PAD_L + ((parseIso(dateStr).getTime() - firstDate.getTime()) / spanMs) * INNER_W;

  const linePts: LinePoint[] = pts.map((p) => ({ x: Math.round(xOf(p.date) * 10) / 10, y: Math.round(yOf(p.weight) * 10) / 10 }));
  const linePath = smoothPath(linePts);
  const areaPath =
    linePts.length >= 2
      ? `${linePath} L ${linePts[linePts.length - 1].x} ${PAD_T + INNER_H} L ${linePts[0].x} ${PAD_T + INNER_H} Z`
      : "";
  const meanY = yOf(avg);
  const ticks = monthTicks(firstDate, lastDate);

  const deltaColor = delta === 0 ? t.textMuted : delta > 0 ? "#9bd0ff" : "#9bf0c0";
  const deltaArrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "·";

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 17, color: t.text, letterSpacing: ".03em" }}>BODYWEIGHT</div>
        {ImportControls}
      </div>

      <ManualAdd defaultUnit={unit} onAdded={load} />

      {/* callouts */}
      <div style={{ display: "flex", gap: 28, flexWrap: "wrap", marginBottom: 8 }}>
        {callout("LATEST", `${latest.weight}`, "#fff", `${unit.toUpperCase()} · ${latest.date}`)}
        {callout("AVERAGE", `${Math.round(avg * 10) / 10}`, ACCENT, `${unit.toUpperCase()} · ${selected.key}`)}
        {pts.length >= 2
          ? callout(
              `${selected.key} CHANGE`,
              `${delta > 0 ? "+" : ""}${Math.round(delta * 10) / 10}`,
              deltaColor,
              `${deltaArrow} ${unit.toUpperCase()}`,
            )
          : null}
      </div>

      {/* chart */}
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        role="img"
        aria-label={`Bodyweight trend over ${selected.key}: latest ${latest.weight} ${unit}, average ${Math.round(avg * 10) / 10} ${unit}.`}
        style={{ display: "block", overflow: "visible" }}
      >
        <defs>
          <linearGradient id="bw-area" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={ACCENT} stopOpacity="0.26" />
            <stop offset="100%" stopColor={ACCENT} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* month gridlines + labels */}
        {ticks.map((d, i) => {
          const x = xOf(isoDate(d));
          return (
            <g key={i}>
              <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + INNER_H} stroke="rgba(120,180,210,.1)" strokeWidth={1} />
              <text x={x} y={H - 6} fill={t.textDim} fontSize={9} fontFamily="JetBrains Mono, monospace" textAnchor="middle">
                {monthUpper(d)}
              </text>
            </g>
          );
        })}

        {/* y-axis labels (right) */}
        {[max, avg, min].map((v, i) => (
          <text
            key={i}
            x={W - PAD_R + 8}
            y={yOf(v) + 3}
            fill={i === 1 ? ACCENT : t.textDim}
            fontSize={9.5}
            fontFamily="JetBrains Mono, monospace"
          >
            {Math.round(v * 10) / 10}
          </text>
        ))}

        {/* mean reference */}
        <line
          x1={PAD_L}
          y1={meanY}
          x2={PAD_L + INNER_W}
          y2={meanY}
          stroke="rgba(127,227,255,.4)"
          strokeWidth={1}
          strokeDasharray="4 5"
        />

        {/* area + line (line re-draws when the range changes via the key) */}
        {areaPath ? <path d={areaPath} fill="url(#bw-area)" /> : null}
        {linePts.length >= 2 ? (
          <path
            key={range}
            className="fr-draw"
            d={linePath}
            fill="none"
            stroke={ACCENT}
            strokeWidth={2.4}
            strokeLinecap="round"
            strokeLinejoin="round"
            pathLength={1}
            style={{ filter: "drop-shadow(0 0 5px rgba(80,200,255,.45))" }}
          />
        ) : null}

        {/* endpoint markers */}
        {linePts.length >= 2 ? (
          <circle cx={linePts[0].x} cy={linePts[0].y} r={3} fill="#0b2033" stroke={ACCENT} strokeWidth={1.6} />
        ) : null}
        <circle
          cx={linePts[linePts.length - 1].x}
          cy={linePts[linePts.length - 1].y}
          r={4.5}
          fill={ACCENT}
          style={{ filter: "drop-shadow(0 0 6px rgba(80,200,255,.8))" }}
        />
      </svg>

      {/* range selector */}
      <div role="group" aria-label="Chart time range" style={{ display: "flex", gap: 7, marginTop: 12, flexWrap: "wrap" }}>
        {RANGES.map((r) => {
          const enabled = rangeEnabled(r, spanDays);
          const active = r.key === selected.key;
          return (
            <button
              key={r.key}
              type="button"
              className={enabled ? "fr-pressable" : undefined}
              disabled={!enabled}
              aria-pressed={active}
              onClick={() => {
                setRange(r.key);
                setRangeTouched(true);
              }}
              style={chip(active, !enabled)}
            >
              {r.key}
            </button>
          );
        })}
      </div>

      <div aria-live="polite" style={hidden}>{importMsg ?? ""}</div>
      {importMsg ? (
        <div style={{ marginTop: 10, fontFamily: BODY, fontWeight: 700, fontSize: 11.5, color: t.textMuted }}>{importMsg}</div>
      ) : null}
    </Card>
  );
}
