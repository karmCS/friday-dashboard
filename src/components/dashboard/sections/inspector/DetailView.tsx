"use client";

/**
 * Athlete detail — the full read on one athlete: identity + headline stats, the AI-coach chat
 * transcript (both sides), per-day macros vs prescription, the bodyweight trend, and recent
 * weekly check-ins. Every panel renders ONLY server data with an honest empty state; nothing is
 * faked. Mood + tokens match the roster (flat dark panels, shared design tokens).
 */

import { CSSProperties } from "react";
import { t, tabularNum, buttonReset } from "@/components/dashboard/tokens";
import {
  ENTRY_BG,
  BORDER_SOFT,
  PANEL_TEXT,
  panel,
  panelHeading,
  panelMeta,
  fmtDay,
  fmtDayTime,
  initial,
  displayName,
  weightClassLabel,
  relativeDays,
} from "./style";
import { BodyweightChart } from "./BodyweightChart";
import type { Athlete, ChatMessage, MacroDay, MacroTargets, CheckinRow, DetailData } from "./api";

// --- helpers ------------------------------------------------------------------

/**
 * Whole CALENDAR days from today until a weigh-in (negative = past). Compares local midnight
 * boundaries, not elapsed ms — so a weigh-in later *today* reads 0 ("today"), not "1d".
 */
function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const target = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((target - today) / 86_400_000);
}

/** "to weigh-in" tile value: "12d" upcoming, "today", or the past date. */
function weighInValue(iso: string | null): string {
  const days = daysUntil(iso);
  if (days === null) return "—";
  if (days > 0) return `${days}d`;
  if (days === 0) return "today";
  return fmtDay(iso);
}

function madeWeightText(made: boolean | null): { label: string; color: string } {
  if (made === null) return { label: "—", color: t.textDim };
  return made ? { label: "YES", color: t.up } : { label: "NO", color: t.down };
}

/** 1–5 subjective rating → semantic color (low = strained, high = good). */
function ratingColor(v: number | null): string {
  if (v === null) return t.textDim;
  if (v <= 2) return t.down;
  if (v === 3) return t.amber;
  return t.up;
}

// --- header (identity + stat tiles) -------------------------------------------

function StatTile({ value, label, color }: { value: string; label: string; color?: string }) {
  return (
    <div style={{ flex: "1 1 88px", background: ENTRY_BG, boxShadow: `inset 0 0 0 1px ${BORDER_SOFT}`, borderRadius: 7, padding: "11px 13px" }}>
      <div style={{ fontFamily: t.font.display, fontSize: 21, color: color ?? PANEL_TEXT, lineHeight: 1, ...tabularNum }}>{value}</div>
      <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 8, letterSpacing: ".08em", color: t.textMuted, marginTop: 5 }}>{label}</div>
    </div>
  );
}

function Header({ athlete }: { athlete: Athlete }) {
  const wc = weightClassLabel(athlete.weight_class_label, athlete.target_weight);
  const made = madeWeightText(athlete.made_weight);
  return (
    <div style={panel()}>
      <div style={{ display: "flex", alignItems: "center", gap: 13, marginBottom: 16, flexWrap: "wrap" }}>
        <div
          aria-hidden
          style={{
            width: 46,
            height: 46,
            flex: "none",
            borderRadius: "50%",
            background: "linear-gradient(135deg,#3f8a98,#5fc8d8)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: t.font.display,
            fontSize: 23,
            color: "#06222a",
          }}
        >
          {initial(athlete.athlete)}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: t.font.display, fontSize: 22, color: PANEL_TEXT, lineHeight: 1 }}>
            {displayName(athlete.athlete).toUpperCase()}
          </div>
          <div style={{ fontFamily: t.font.mono, fontSize: 10, color: t.textMuted, marginTop: 5, wordBreak: "break-all" }}>
            {[athlete.sport, athlete.sex, athlete.age !== null ? `${athlete.age}y` : null, athlete.subscription_tier]
              .filter(Boolean)
              .join(" · ")}
          </div>
          {athlete.email ? (
            <div style={{ fontFamily: t.font.mono, fontSize: 10, color: t.textDim, marginTop: 3, wordBreak: "break-all" }}>{athlete.email}</div>
          ) : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 9, flexWrap: "wrap" }}>
        <StatTile value={athlete.current_weight !== null ? athlete.current_weight.toFixed(1) : "—"} label="CURRENT LB" color={t.accent} />
        <StatTile value={wc ?? "—"} label="WEIGHT CLASS" />
        <StatTile value={weighInValue(athlete.weigh_in_at)} label="TO WEIGH-IN" />
        <StatTile value={made.label} label="MADE WEIGHT" color={made.color} />
        <StatTile value={`${athlete.camps_completed}/${athlete.camps_total}`} label="CAMPS DONE" />
        <StatTile value={athlete.in_camp ? "YES" : "NO"} label="IN CAMP" color={athlete.in_camp ? t.up : t.textDim} />
        <StatTile value={String(athlete.weekly_checkins_completed)} label="CHECK-INS" />
        <StatTile value={`${athlete.active_days_30d}/30d`} label="APP USAGE" color={athlete.active_days_30d > 0 ? t.accent : t.textDim} />
      </div>
    </div>
  );
}

// --- chat transcript ----------------------------------------------------------

function ChatBubble({ msg }: { msg: ChatMessage }) {
  const isFighter = msg.role === "fighter";
  const align: CSSProperties = isFighter ? { alignSelf: "flex-end", alignItems: "flex-end" } : { alignSelf: "flex-start", alignItems: "flex-start" };
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, maxWidth: "82%", ...align }}>
      <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
        <span style={{ fontFamily: t.font.body, fontWeight: 800, fontSize: 8.5, letterSpacing: ".1em", color: isFighter ? t.accent : t.up }}>
          {isFighter ? "ATHLETE" : msg.is_atlas ? "COACH · PROACTIVE" : "COACH"}
        </span>
        <span style={{ fontFamily: t.font.mono, fontSize: 9, color: t.textDim, ...tabularNum }}>{fmtDayTime(msg.when_at)}</span>
      </div>
      <div
        style={{
          fontFamily: t.font.body,
          fontSize: 13,
          lineHeight: 1.55,
          color: "#c4d6e0",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          background: isFighter ? "rgba(95,184,200,.12)" : ENTRY_BG,
          boxShadow: `inset 0 0 0 1px ${isFighter ? "rgba(95,184,200,.25)" : BORDER_SOFT}`,
          borderRadius: 10,
          padding: "10px 13px",
        }}
      >
        {msg.content}
      </div>
    </div>
  );
}

function ChatPanel({ chat }: { chat: ChatMessage[] }) {
  return (
    <div style={panel({ display: "flex", flexDirection: "column" })}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 14 }}>
        <div style={{ ...panelHeading, fontSize: 18 }}>CHAT LOG</div>
        <div style={panelMeta}>{chat.length === 0 ? "NO MESSAGES" : `${chat.length} MSG${chat.length === 1 ? "" : "S"} · OLDEST FIRST`}</div>
      </div>
      {chat.length === 0 ? (
        <div style={{ fontFamily: t.font.body, fontSize: 13, color: t.textMuted, padding: "28px 4px", textAlign: "center" }}>
          No coach conversation yet.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 13, maxHeight: 560, overflowY: "auto", paddingRight: 4 }}>
          {chat.map((msg, i) => (
            <ChatBubble key={i} msg={msg} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- daily macros -------------------------------------------------------------

/** A thin proportion bar (consumed / target), clamped; over-target turns amber. */
function KcalBar({ kcal, target }: { kcal: number; target: number | null }) {
  if (target === null || target <= 0) return null;
  const pct = Math.min(140, Math.round((kcal / target) * 100));
  const over = kcal > target;
  return (
    <div style={{ height: 5, borderRadius: 3, background: "rgba(120,150,170,.16)", overflow: "hidden", marginTop: 7 }}>
      <div style={{ width: `${Math.min(100, pct)}%`, height: "100%", background: over ? t.amber : t.accent, transition: `width ${t.dur.normal} ${t.ease}` }} />
    </div>
  );
}

function MacroChip({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <span style={{ fontFamily: t.font.mono, fontSize: 10.5, color: t.textMuted, ...tabularNum }}>
      <span style={{ color, fontWeight: 700 }}>{value}</span>
      {label}
    </span>
  );
}

function MacroDayRow({ day, targets }: { day: MacroDay; targets: MacroTargets | null }) {
  // Only flag "over" / draw a fill bar against a REAL prescribed cap. A TDEE reference is not a
  // cap, so eating below it during a cut must not read as under-target or color amber.
  const cap = targets?.kcal_is_cap ? targets.kcal : null;
  const overCap = cap != null && day.kcal > cap;
  const refKcal = targets?.kcal ?? null;
  return (
    <div style={{ background: ENTRY_BG, boxShadow: `inset 0 0 0 1px ${BORDER_SOFT}`, borderRadius: 8, padding: "11px 13px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
        <span style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 11, color: t.textMuted }}>{fmtDay(day.date)}</span>
        <span style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
          <span style={{ fontFamily: t.font.display, fontSize: 19, color: overCap ? t.amber : PANEL_TEXT, lineHeight: 1, ...tabularNum }}>{day.kcal}</span>
          <span style={{ fontFamily: t.font.mono, fontSize: 9, color: t.textDim }}>
            {refKcal != null ? `/ ${refKcal} ${cap != null ? "cap" : "tdee"}` : "kcal"}
          </span>
        </span>
      </div>
      <div style={{ display: "flex", gap: 12, marginTop: 7 }}>
        <MacroChip value={day.protein_g} label="g P" color="#8fdfe8" />
        <MacroChip value={day.carbs_g} label="g C" color="#ffce85" />
        <MacroChip value={day.fat_g} label="g F" color="#c2acff" />
        <span style={{ marginLeft: "auto", fontFamily: t.font.mono, fontSize: 9, color: t.textDim }}>{day.entries} item{day.entries === 1 ? "" : "s"}</span>
      </div>
      <KcalBar kcal={day.kcal} target={cap} />
    </div>
  );
}

function MacrosPanel({ days, targets }: { days: MacroDay[]; targets: MacroTargets | null }) {
  const proteinTarget =
    targets?.protein_min != null && targets?.protein_max != null
      ? `${targets.protein_min}–${targets.protein_max}g P`
      : null;
  return (
    <div style={panel()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 13 }}>
        <div style={panelHeading}>DAILY MACROS</div>
        <div style={panelMeta}>
          {targets?.kcal != null
            ? `${targets.kcal_is_cap ? "CAP" : "TDEE"} ${targets.kcal} KCAL`
            : days.length === 0
              ? "NO LOGS"
              : `${days.length} DAY${days.length === 1 ? "" : "S"}`}
          {proteinTarget ? ` · ${proteinTarget.toUpperCase()}` : ""}
        </div>
      </div>
      {days.length === 0 ? (
        <div style={{ fontFamily: t.font.body, fontSize: 13, color: t.textMuted, padding: "22px 4px", textAlign: "center" }}>
          No food logged in the last 45 days.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 9, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
          {days.map((day) => (
            <MacroDayRow key={day.date} day={day} targets={targets} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- weekly check-ins ---------------------------------------------------------

function RatingPill({ value, label }: { value: number | null; label: string }) {
  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 28 }}>
      <span style={{ fontFamily: t.font.display, fontSize: 15, color: ratingColor(value), lineHeight: 1, ...tabularNum }}>{value ?? "—"}</span>
      <span style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 7.5, letterSpacing: ".06em", color: t.textDim }}>{label}</span>
    </span>
  );
}

function CheckinCard({ row }: { row: CheckinRow }) {
  return (
    <div style={{ background: ENTRY_BG, boxShadow: `inset 0 0 0 1px ${BORDER_SOFT}`, borderRadius: 8, padding: "12px 14px", opacity: row.skipped ? 0.6 : 1 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: row.skipped ? 0 : 10 }}>
        <span style={{ fontFamily: t.font.body, fontWeight: 800, fontSize: 11, color: PANEL_TEXT }}>
          {row.week_number !== null ? `WEEK ${row.week_number}` : "CHECK-IN"}
          {row.skipped ? <span style={{ color: t.textDim, fontWeight: 700 }}> · SKIPPED</span> : null}
        </span>
        <span style={{ fontFamily: t.font.mono, fontSize: 9, color: t.textDim, ...tabularNum }}>{fmtDay(row.when_at)}</span>
      </div>
      {row.skipped ? null : (
        <>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <RatingPill value={row.energy_rating} label="ENERGY" />
            <RatingPill value={row.training_quality_rating} label="TRAIN" />
            <RatingPill value={row.sleep_rating} label="SLEEP" />
            <RatingPill value={row.hunger_rating} label="HUNGER" />
            <RatingPill value={row.mood_rating} label="MOOD" />
            <RatingPill value={row.macro_compliance_rating} label="MACRO" />
          </div>
          {row.notes && row.notes.trim() !== "" ? (
            <div style={{ fontFamily: t.font.body, fontSize: 12.5, lineHeight: 1.5, color: "#c4d6e0", marginTop: 10, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
              {row.notes}
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function CheckinsPanel({ checkins }: { checkins: CheckinRow[] }) {
  return (
    <div style={panel()}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 13 }}>
        <div style={panelHeading}>WEEKLY CHECK-INS</div>
        <div style={panelMeta}>{checkins.length === 0 ? "NONE" : `${checkins.length} RECENT`}</div>
      </div>
      {checkins.length === 0 ? (
        <div style={{ fontFamily: t.font.body, fontSize: 13, color: t.textMuted, padding: "22px 4px", textAlign: "center" }}>
          No weekly check-ins recorded.
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
          {checkins.map((row, i) => (
            <CheckinCard key={i} row={row} />
          ))}
        </div>
      )}
    </div>
  );
}

// --- back control + layout ----------------------------------------------------

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button
      type="button"
      onClick={onBack}
      className="fr-pressable"
      style={{
        ...buttonReset,
        alignSelf: "flex-start",
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        fontFamily: t.font.body,
        fontWeight: 700,
        fontSize: 11.5,
        letterSpacing: ".06em",
        color: t.accent,
        padding: "8px 15px",
        borderRadius: 8,
        boxShadow: `inset 0 0 0 1px ${t.frame}`,
      }}
    >
      <span aria-hidden>←</span> ALL ATHLETES
    </button>
  );
}

export function DetailView({ detail, onBack }: { detail: DetailData; onBack: () => void }) {
  const athlete = detail.athlete;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <BackButton onBack={onBack} />

      {athlete === null ? (
        <div style={panel({ textAlign: "center", padding: "44px 20px", color: t.textMuted, fontFamily: t.font.body, fontWeight: 700, fontSize: 13.5 })}>
          No record found for this athlete.
        </div>
      ) : (
        <>
          <Header athlete={athlete} />
          <div style={{ display: "flex", gap: 14, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ flex: "1.5 1 380px", minWidth: 300 }}>
              <ChatPanel chat={detail.chat} />
            </div>
            <div style={{ flex: "1 1 300px", minWidth: 280, display: "flex", flexDirection: "column", gap: 14 }}>
              <BodyweightChart points={detail.bodyweight} />
              <MacrosPanel days={detail.macros.days} targets={detail.macros.targets} />
              <CheckinsPanel checkins={detail.checkins} />
            </div>
          </div>
          <div style={{ fontFamily: t.font.mono, fontSize: 9.5, color: t.textDim, textAlign: "center", letterSpacing: ".04em" }}>
            last active {relativeDays(athlete.last_active_at)} · joined {fmtDay(athlete.created_at)}
          </div>
        </>
      )}
    </div>
  );
}
