"use client";

/**
 * Athlete roster — the list of EVERY athlete (scrollable), with instant client-side filtering
 * by name, sport, weight class, and age bucket. No search-gate: the whole roster is visible on
 * open. Filter options are derived from the data so they always match what's actually present.
 */

import { CSSProperties, useMemo, useState } from "react";
import { t, tabularNum, buttonReset } from "@/components/dashboard/tokens";
import { fmtNum } from "@/lib/format";
import {
  ENTRY_BG,
  BORDER_SOFT,
  PANEL_TEXT,
  panel,
  initial,
  displayName,
  shortId,
  weightClassLabel,
  relativeDays,
} from "./style";
import type { Athlete } from "./api";

// --- age buckets --------------------------------------------------------------

const AGE_BUCKETS: ReadonlyArray<{ key: string; label: string; test: (age: number) => boolean }> = [
  { key: "u20", label: "Under 20", test: (a) => a < 20 },
  { key: "20-24", label: "20–24", test: (a) => a >= 20 && a <= 24 },
  { key: "25-29", label: "25–29", test: (a) => a >= 25 && a <= 29 },
  { key: "30+", label: "30+", test: (a) => a >= 30 },
];

const ALL = "all";

// --- styled controls ----------------------------------------------------------

const controlBase: CSSProperties = {
  fontFamily: t.font.body,
  fontSize: 13,
  color: PANEL_TEXT,
  background: "#0d1a24",
  border: "none",
  boxShadow: "inset 0 0 0 1px rgba(120,150,170,.2)",
  borderRadius: 9,
  padding: "10px 14px",
  // No `outline: none` — let the global :focus-visible ring (globals.css) show on keyboard focus.
};

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: ReadonlyArray<{ key: string; label: string }>;
  onChange: (v: string) => void;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 8.5, letterSpacing: ".1em", color: t.textMuted }}>
        {label}
      </span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{ ...controlBase, cursor: "pointer", minWidth: 130 }}>
        <option value={ALL}>All</option>
        {options.map((o) => (
          <option key={o.key} value={o.key}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// --- athlete card -------------------------------------------------------------

function StatBit({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ flex: 1 }}>
      <div style={{ fontFamily: t.font.display, fontSize: 17, color: color ?? PANEL_TEXT, lineHeight: 1, ...tabularNum }}>
        {value}
      </div>
      <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 8, letterSpacing: ".08em", color: t.textMuted, marginTop: 4 }}>
        {label}
      </div>
    </div>
  );
}

function AthleteCard({ athlete, index, onSelect }: { athlete: Athlete; index: number; onSelect: () => void }) {
  const wc = weightClassLabel(athlete.weight_class_label, athlete.target_weight);
  const cw = athlete.current_weight;
  return (
    <button
      type="button"
      onClick={onSelect}
      className="fr-card fr-pressable fr-card-enter"
      style={{
        ...buttonReset,
        ...panel({ padding: "16px 18px" }),
        // staggered reveal via the shared keyframe — cap the index so a large roster's last
        // cards don't wait seconds (delay = --i * 40ms).
        ["--i" as string]: Math.min(index, 24),
        display: "flex",
        flexDirection: "column",
        gap: 13,
        width: 268,
        textAlign: "left",
      }}
    >
      {/* identity row */}
      <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
        <span
          aria-hidden
          style={{
            width: 38,
            height: 38,
            flex: "none",
            borderRadius: "50%",
            background: "linear-gradient(135deg,#3f8a98,#5fc8d8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: t.font.display,
            fontSize: 18,
            color: "#06222a",
          }}
        >
          {initial(athlete.athlete)}
        </span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div
            style={{
              fontFamily: t.font.body,
              fontWeight: 800,
              fontSize: 15,
              color: PANEL_TEXT,
              lineHeight: 1.1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {displayName(athlete.athlete)}
          </div>
          <div style={{ fontFamily: t.font.mono, fontSize: 9.5, color: t.textDim, marginTop: 3 }}>
            {athlete.sport ? athlete.sport.toLowerCase() : "—"}
            {athlete.age !== null ? ` · ${athlete.age}y` : ""} · {shortId(athlete.fighter_id)}
          </div>
        </div>
        {athlete.in_camp ? (
          <span
            style={{
              fontFamily: t.font.body,
              fontWeight: 800,
              fontSize: 8,
              letterSpacing: ".1em",
              color: "#06222a",
              background: t.up,
              borderRadius: 4,
              padding: "3px 7px",
            }}
          >
            IN CAMP
          </span>
        ) : null}
      </div>

      {/* stat row */}
      <div style={{ display: "flex", gap: 10, background: ENTRY_BG, borderRadius: 8, padding: "11px 13px", boxShadow: `inset 0 0 0 1px ${BORDER_SOFT}` }}>
        <StatBit value={cw !== null ? cw.toFixed(1) : "—"} label="CURRENT LB" color={t.accent} />
        <StatBit value={wc ?? "—"} label="WEIGHT CLASS" />
        <StatBit value={String(athlete.camps_completed)} label="CAMPS DONE" />
      </div>

      {/* footer: engagement */}
      <div style={{ display: "flex", justifyContent: "space-between", fontFamily: t.font.mono, fontSize: 9.5, color: t.textDim }}>
        <span>{athlete.weekly_checkins_completed} check-ins</span>
        <span>active {relativeDays(athlete.last_active_at)}</span>
      </div>
    </button>
  );
}

// --- main ---------------------------------------------------------------------

export function RosterView({ athletes, onSelect }: { athletes: Athlete[]; onSelect: (a: Athlete) => void }) {
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState(ALL);
  const [weightClass, setWeightClass] = useState(ALL);
  const [ageBucket, setAgeBucket] = useState(ALL);

  // Distinct sports / weight classes present in the data → drive the dropdowns.
  const sportOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of athletes) if (a.sport) set.add(a.sport);
    return Array.from(set).sort().map((s) => ({ key: s, label: s }));
  }, [athletes]);

  const weightClassOptions = useMemo(() => {
    const set = new Set<string>();
    for (const a of athletes) {
      const wc = weightClassLabel(a.weight_class_label, a.target_weight);
      if (wc) set.add(wc);
    }
    return Array.from(set)
      .sort((a, b) => (parseFloat(a) || 0) - (parseFloat(b) || 0))
      .map((wc) => ({ key: wc, label: wc }));
  }, [athletes]);

  // Derive the filtered list in render (no redundant state).
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const bucket = AGE_BUCKETS.find((b) => b.key === ageBucket);
    return athletes.filter((a) => {
      if (q && !(a.athlete ?? "").toLowerCase().includes(q)) return false;
      if (sport !== ALL && a.sport !== sport) return false;
      if (weightClass !== ALL && weightClassLabel(a.weight_class_label, a.target_weight) !== weightClass) return false;
      if (bucket && (a.age === null || !bucket.test(a.age))) return false;
      return true;
    });
  }, [athletes, query, sport, weightClass, ageBucket]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* filter bar */}
      <div style={panel({ display: "flex", gap: 14, alignItems: "flex-end", flexWrap: "wrap" })}>
        <label style={{ display: "flex", flexDirection: "column", gap: 5, flex: "1 1 220px" }}>
          <span style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 8.5, letterSpacing: ".1em", color: t.textMuted }}>
            SEARCH NAME
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 9, ...controlBase, padding: "0 14px" }}>
            <span aria-hidden style={{ color: t.accent, fontSize: 15 }}>
              ⌕
            </span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Athlete name…"
              aria-label="Search athletes by name"
              spellCheck={false}
              autoComplete="off"
              style={{ flex: 1, background: "transparent", border: "none", fontFamily: t.font.body, fontSize: 13, color: PANEL_TEXT, padding: "10px 0" }}
            />
          </div>
        </label>
        <FilterSelect label="SPORT" value={sport} options={sportOptions} onChange={setSport} />
        <FilterSelect label="WEIGHT CLASS" value={weightClass} options={weightClassOptions} onChange={setWeightClass} />
        <FilterSelect label="AGE" value={ageBucket} options={AGE_BUCKETS} onChange={setAgeBucket} />
      </div>

      {/* count line */}
      <div aria-live="polite" style={{ fontFamily: t.font.mono, fontSize: 11, color: t.textMuted, letterSpacing: ".04em", padding: "0 2px" }}>
        {fmtNum(filtered.length)} of {fmtNum(athletes.length)} athlete{athletes.length === 1 ? "" : "s"}
      </div>

      {/* grid */}
      {filtered.length === 0 ? (
        <div style={panel({ textAlign: "center", padding: "44px 20px", color: t.textMuted, fontFamily: t.font.body, fontWeight: 700, fontSize: 13 })}>
          No athletes match these filters.
        </div>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
          {filtered.map((a, i) => (
            <AthleteCard key={a.fighter_id} athlete={a} index={i} onSelect={() => onSelect(a)} />
          ))}
        </div>
      )}
    </div>
  );
}
