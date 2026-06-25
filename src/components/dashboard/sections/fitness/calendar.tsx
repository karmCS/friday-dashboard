"use client";

/**
 * Weekly workout calendar — the FITNESS section's logging surface (calendar-based model).
 *
 * Design ref: Runna's training calendar (Mobbin) — a Mon–Sun week of day cells, each entry a
 * chip with a type-colored left edge, a `+ ADD` affordance per day, and week navigation. This
 * is the GENERAL-label calendar ("Upper Body", "Stationary Bike"), not per-set logging. Full
 * CRUD against /api/fitness/calendar via a focus-trapped add/edit dialog.
 *
 * Self-fetching by visible week (GET ?from&to). No chart library; native `<input type="date">`.
 */

import { CSSProperties, useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

import { t, tabularNum, buttonReset } from "@/components/dashboard/tokens";
import { srOnly, useFocusTrap } from "@/components/dashboard/ui";
import {
  addDays,
  BODY,
  CalendarEntry,
  Card,
  DAY_LABELS,
  DISPLAY,
  fetchData,
  fmtMonthDay,
  isoDate,
  MONO,
  parseIso,
  startOfWeek,
  TYPE_META,
  WORKOUT_TYPES,
  type WorkoutType,
} from "./shared";

// --- add/edit dialog ---------------------------------------------------------

interface DialogState {
  mode: "add" | "edit";
  date: string;
  entry?: CalendarEntry;
}

const inputStyle: CSSProperties = {
  width: "100%",
  background: "#0c2335",
  boxShadow: "inset 0 0 0 1px rgba(120,180,210,.28)",
  border: "none",
  borderRadius: 8,
  padding: "10px 12px",
  fontFamily: BODY,
  fontWeight: 600,
  fontSize: 14,
  color: t.text,
  boxSizing: "border-box",
};

const fieldLabel: CSSProperties = {
  display: "block",
  fontFamily: BODY,
  fontWeight: 800,
  fontSize: 9,
  letterSpacing: ".12em",
  color: t.textMuted,
  marginBottom: 5,
};

function EntryDialog({
  state,
  onClose,
  onSaved,
}: {
  state: DialogState;
  onClose: () => void;
  onSaved: () => void;
}) {
  const editing = state.mode === "edit";
  const [date, setDate] = useState(state.date);
  const [label, setLabel] = useState(state.entry?.label ?? "");
  const [type, setType] = useState<WorkoutType>(state.entry?.type ?? "lift");
  const [notes, setNotes] = useState(state.entry?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dialogRef = useFocusTrap<HTMLFormElement>(onClose);

  const canSave = label.trim() !== "" && /^\d{4}-\d{2}-\d{2}$/.test(date);

  const save = async () => {
    if (!canSave || busy) return;
    setBusy(true);
    setError(null);
    const payload = { date, label: label.trim(), type, notes: notes.trim() || null };
    try {
      const res = editing
        ? await fetch(`/api/fitness/calendar/${state.entry!.id}`, {
            method: "PATCH",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          })
        : await fetch("/api/fitness/calendar", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
      if (!res.ok) throw new Error("save failed");
      onSaved();
    } catch {
      setError("Couldn’t save — try again.");
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/fitness/calendar/${state.entry!.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("delete failed");
      onSaved();
    } catch {
      setError("Couldn’t delete — try again.");
      setBusy(false);
    }
  };

  // Portal to <body> so the fixed overlay escapes the clipped Card / transformed section
  // wrapper it's rendered within (a clip-path/transform ancestor would otherwise clip it).
  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={editing ? "Edit workout" : "Add workout"}
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60,
        background: "rgba(4,10,16,.72)",
        backdropFilter: "blur(5px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
    >
      <form
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
        style={{
          width: "min(94vw,420px)",
          background: "linear-gradient(160deg,#163a55,#0b2033)",
          clipPath: t.clipCard,
          boxShadow: `inset 0 0 0 2px ${t.frameStrong}, 0 24px 70px rgba(0,0,0,.6)`,
          padding: "22px 24px",
          display: "flex",
          flexDirection: "column",
          gap: 14,
        }}
      >
        <div style={{ fontFamily: DISPLAY, fontSize: 22, color: t.text, letterSpacing: ".02em" }}>
          {editing ? "EDIT WORKOUT" : "ADD WORKOUT"}
        </div>

        <div>
          <label htmlFor="cal-label" style={fieldLabel}>LABEL</label>
          <input
            id="cal-label"
            style={inputStyle}
            value={label}
            placeholder="Upper Body"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div role="radiogroup" aria-label="Workout type">
          <span style={fieldLabel}>TYPE</span>
          <div style={{ display: "flex", gap: 8 }}>
            {WORKOUT_TYPES.map((w) => {
              const active = type === w;
              const meta = TYPE_META[w];
              return (
                <button
                  key={w}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  className="fr-pressable"
                  onClick={() => setType(w)}
                  style={{
                    flex: 1,
                    height: 44,
                    border: "none",
                    borderRadius: 9,
                    cursor: "pointer",
                    fontFamily: BODY,
                    fontWeight: 800,
                    fontSize: 12,
                    letterSpacing: ".06em",
                    background: active ? meta.soft : "#0c2335",
                    color: active ? meta.color : t.textMuted,
                    boxShadow: active ? `inset 0 0 0 1.5px ${meta.color}` : "inset 0 0 0 1px rgba(120,180,210,.2)",
                  }}
                >
                  {meta.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label htmlFor="cal-date" style={fieldLabel}>DATE</label>
          <input id="cal-date" type="date" style={{ ...inputStyle, ...tabularNum }} value={date} onChange={(e) => setDate(e.target.value)} />
        </div>

        <div>
          <label htmlFor="cal-notes" style={fieldLabel}>NOTES <span style={{ color: t.textDim }}>· OPTIONAL</span></label>
          <textarea
            id="cal-notes"
            rows={2}
            style={{ ...inputStyle, resize: "vertical", fontWeight: 500 }}
            value={notes}
            placeholder="felt strong"
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        <div aria-live="polite" style={srOnly}>{error ?? ""}</div>
        {error ? <div style={{ fontFamily: BODY, fontWeight: 700, fontSize: 11.5, color: t.down }}>{error}</div> : null}

        <div style={{ display: "flex", gap: 10, marginTop: 2 }}>
          {editing ? (
            <button
              type="button"
              className="fr-pressable"
              onClick={() => void remove()}
              disabled={busy}
              style={{
                ...buttonReset,
                height: 44,
                padding: "0 16px",
                borderRadius: 9,
                cursor: "pointer",
                background: "rgba(60,24,24,.5)",
                boxShadow: "inset 0 0 0 1px rgba(255,140,120,.4)",
                color: t.down,
                fontFamily: BODY,
                fontWeight: 800,
                fontSize: 12,
                letterSpacing: ".06em",
              }}
            >
              DELETE
            </button>
          ) : null}
          <button
            type="button"
            className="fr-pressable"
            onClick={onClose}
            style={{
              ...buttonReset,
              flex: editing ? "none" : 1,
              height: 44,
              padding: "0 16px",
              borderRadius: 9,
              cursor: "pointer",
              background: "#0c2335",
              boxShadow: "inset 0 0 0 1px rgba(120,180,210,.22)",
              color: t.textMuted,
              fontFamily: BODY,
              fontWeight: 800,
              fontSize: 12,
              letterSpacing: ".06em",
            }}
          >
            CANCEL
          </button>
          <button
            type="submit"
            className="fr-pressable"
            disabled={!canSave || busy}
            style={{
              flex: 1,
              border: "none",
              height: 44,
              borderRadius: 9,
              cursor: canSave && !busy ? "pointer" : "not-allowed",
              background: `linear-gradient(90deg,${t.accent},${t.accent2})`,
              color: "#04101a",
              fontFamily: DISPLAY,
              fontSize: 16,
              letterSpacing: ".03em",
              opacity: canSave && !busy ? 1 : 0.5,
            }}
          >
            {busy ? "…" : editing ? "SAVE" : "ADD →"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}

// --- entry chip --------------------------------------------------------------

function EntryChip({ entry, onEdit }: { entry: CalendarEntry; onEdit: (e: CalendarEntry) => void }) {
  const meta = TYPE_META[entry.type] ?? TYPE_META.lift;
  return (
    <button
      type="button"
      className="fr-pressable"
      onClick={() => onEdit(entry)}
      aria-label={`Edit ${entry.label} (${meta.label})`}
      style={{
        ...buttonReset,
        width: "100%",
        textAlign: "left",
        display: "block",
        padding: "6px 8px 6px 9px",
        borderRadius: 5,
        borderLeft: `3px solid ${meta.color}`,
        background: meta.soft,
        cursor: "pointer",
      }}
    >
      <span style={{ display: "block", fontFamily: BODY, fontWeight: 700, fontSize: 11.5, color: t.text, lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {entry.label}
      </span>
      <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 8.5, letterSpacing: ".1em", color: meta.color }}>
        {meta.label}
      </span>
    </button>
  );
}

// --- main calendar -----------------------------------------------------------

export function WeeklyCalendar(): React.JSX.Element {
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(new Date()));
  const [entries, setEntries] = useState<CalendarEntry[]>([]);
  const [error, setError] = useState(false);
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const from = isoDate(weekStart);
  const to = isoDate(addDays(weekStart, 6));
  const todayIso = isoDate(new Date());

  const load = useCallback(async () => {
    setError(false);
    try {
      const rows = await fetchData<CalendarEntry[]>(`/api/fitness/calendar?from=${from}&to=${to}`, []);
      setEntries(rows);
    } catch {
      setError(true);
      setEntries([]);
    }
  }, [from, to]);

  useEffect(() => {
    void load();
  }, [load]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const byDate = new Map<string, CalendarEntry[]>();
  for (const e of entries) {
    const arr = byDate.get(e.date) ?? [];
    arr.push(e);
    byDate.set(e.date, arr);
  }

  const counts = entries.reduce(
    (acc, e) => {
      acc[e.type] = (acc[e.type] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const summary = (["lift", "cardio", "rest"] as WorkoutType[])
    .filter((w) => counts[w])
    .map((w) => `${counts[w]} ${TYPE_META[w].label}`)
    .join(" · ");

  const navBtn: CSSProperties = {
    ...buttonReset,
    width: 36,
    height: 36,
    borderRadius: 8,
    cursor: "pointer",
    background: "rgba(10,32,50,.55)",
    boxShadow: "inset 0 0 0 1px rgba(120,180,210,.22)",
    color: t.text,
    fontFamily: MONO,
    fontSize: 15,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  };

  return (
    <Card>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 12, flexWrap: "wrap" }}>
          <span style={{ fontFamily: DISPLAY, fontSize: 17, color: t.text, letterSpacing: ".03em" }}>WORKOUT WEEK</span>
          <span style={{ fontFamily: MONO, fontSize: 11, color: t.textMuted, ...tabularNum }}>
            {fmtMonthDay(weekStart).toUpperCase()} – {fmtMonthDay(addDays(weekStart, 6)).toUpperCase()}
          </span>
          {summary ? (
            <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 10, letterSpacing: ".08em", color: t.accent }}>{summary}</span>
          ) : null}
        </div>
        <div style={{ display: "flex", gap: 7, alignItems: "center" }}>
          <button type="button" className="fr-pressable" aria-label="Previous week" onClick={() => setWeekStart((w) => addDays(w, -7))} style={navBtn}>
            ‹
          </button>
          <button
            type="button"
            className="fr-pressable"
            onClick={() => setWeekStart(startOfWeek(new Date()))}
            style={{ ...navBtn, width: "auto", padding: "0 12px", fontFamily: BODY, fontWeight: 800, fontSize: 11, letterSpacing: ".08em" }}
          >
            TODAY
          </button>
          <button type="button" className="fr-pressable" aria-label="Next week" onClick={() => setWeekStart((w) => addDays(w, 7))} style={navBtn}>
            ›
          </button>
        </div>
      </div>

      <div aria-live="polite" style={srOnly}>{error ? "Could not load the workout week" : ""}</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0,1fr))", gap: 8 }}>
        {days.map((d, i) => {
          const iso = isoDate(d);
          const isToday = iso === todayIso;
          const dayEntries = byDate.get(iso) ?? [];
          return (
            <div
              key={iso}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 6,
                minHeight: 132,
                padding: 8,
                borderRadius: 8,
                background: "rgba(8,24,38,.4)",
                boxShadow: isToday
                  ? `inset 0 0 0 1.5px ${t.accent}, 0 0 16px rgba(80,200,255,.18)`
                  : "inset 0 0 0 1px rgba(120,180,210,.12)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 9.5, letterSpacing: ".1em", color: isToday ? t.accent : t.textMuted }}>
                  {DAY_LABELS[i]}
                </span>
                <span style={{ fontFamily: DISPLAY, fontSize: 14, color: isToday ? t.text : t.textDim, ...tabularNum }}>{d.getDate()}</span>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 5, flex: 1 }}>
                {dayEntries.map((e) => (
                  <EntryChip key={e.id} entry={e} onEdit={(entry) => setDialog({ mode: "edit", date: entry.date, entry })} />
                ))}
              </div>

              <button
                type="button"
                className="fr-pressable"
                onClick={() => setDialog({ mode: "add", date: iso })}
                aria-label={`Add a workout on ${fmtMonthDay(d)}`}
                style={{
                  ...buttonReset,
                  height: 34,
                  borderRadius: 6,
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 5,
                  background: "transparent",
                  boxShadow: "inset 0 0 0 1px rgba(120,180,210,.2)",
                  color: t.textMuted,
                  fontFamily: BODY,
                  fontWeight: 800,
                  fontSize: 11,
                  letterSpacing: ".08em",
                }}
              >
                <span aria-hidden style={{ fontSize: 16, lineHeight: 0, marginTop: -1 }}>+</span> ADD
              </button>
            </div>
          );
        })}
      </div>

      {dialog ? (
        <EntryDialog
          state={dialog}
          onClose={() => setDialog(null)}
          onSaved={() => {
            setDialog(null);
            void load();
          }}
        />
      ) : null}
    </Card>
  );
}
