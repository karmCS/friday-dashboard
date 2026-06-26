"use client";

/**
 * FITNESS section (calendar-based model, 2026-06-24 pivot).
 *
 * Header: BodyGradeCard — rank tile + BODY GRADE heading + description + stat chips.
 * Below: WeeklyCalendar, BodyweightCard, WeeklyStepsTable, StepsCard, CardioCard.
 */

import { BodyweightCard } from "./fitness/bodyweight";
import { WeeklyCalendar } from "./fitness/calendar";
import { CardioCard, WeeklyStepsTable } from "./fitness/charts";
import { GradeBadge, gradeTileBg, type GradeId } from "./shared/GradeBadge";
import { t, tabularNum } from "@/components/dashboard/tokens";
import type { BodyGrade, Fitness } from "@/lib/types";

const ROW = { display: "flex", gap: 13, alignItems: "stretch", flexWrap: "wrap" } as const;
const FD = t.font.display;
const FB = t.font.body;
const FM = t.font.mono;

// --- helpers -----------------------------------------------------------------

function streakDuration(weeks: number): string {
  if (weeks >= 104) return `${Math.round(weeks / 52)} years`;
  if (weeks >= 52) return "1 year";
  if (weeks >= 8) return `${Math.round(weeks / 4)} months`;
  return `${weeks} week${weeks !== 1 ? "s" : ""}`;
}

function anArticle(grade: string): string {
  return /^[AEIOU]/.test(grade) ? "an" : "a";
}

function describeBodyGrade(grade: GradeId, base: GradeId, streak: number): string {
  const isElevated = grade !== base;
  if (isElevated) {
    const dur = streakDuration(streak);
    const cap = dur.charAt(0).toUpperCase() + dur.slice(1);
    return `${cap} of unbroken S-weeks hold the permanent floor at ${grade}. This week earns ${anArticle(base)} ${base} base — the streak is intact.`;
  }
  if (base === "S" || base === "S+") return "This week hits S — the streak advances.";
  if (base === "S-") return "This week earns an S- base — one step from advancing the streak.";
  return `This week earns ${anArticle(base)} ${base} base.`;
}

function fmtSteps(n: number | null): string {
  if (n === null) return "—";
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

// --- sub-components ----------------------------------------------------------

function RankTile({ grade, isFloor }: { grade: GradeId; isFloor: boolean }) {
  return (
    <div
      style={{
        position: "relative",
        width: 110,
        height: 110,
        flexShrink: 0,
        background: gradeTileBg(grade),
        borderRadius: 10,
        boxShadow: `0 0 0 1.5px rgba(100,160,220,.3), inset 0 0 0 1px rgba(255,255,255,.12)`,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 7,
          left: 9,
          fontFamily: FB,
          fontWeight: 800,
          fontSize: 8.5,
          letterSpacing: ".18em",
          color: "rgba(255,255,255,.5)",
        }}
      >
        RANK
      </div>
      <GradeBadge grade={grade} size={86} />
      {isFloor && (
        <div
          style={{
            position: "absolute",
            bottom: 7,
            left: 9,
            fontFamily: FB,
            fontWeight: 800,
            fontSize: 8.5,
            letterSpacing: ".14em",
            color: "rgba(100,200,255,.85)",
          }}
        >
          ★ FLOOR
        </div>
      )}
    </div>
  );
}

function StatChip({ value, label, accent = false }: { value: string; label: string; accent?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        padding: "7px 14px",
        borderRadius: 7,
        background: accent ? "rgba(80,220,120,.12)" : "rgba(8,24,38,.55)",
        boxShadow: accent
          ? "inset 0 0 0 1px rgba(80,220,120,.4)"
          : "inset 0 0 0 1px rgba(120,180,210,.12)",
        gap: 2,
        flexShrink: 0,
      }}
    >
      <div
        style={{
          fontFamily: FD,
          fontSize: 17,
          lineHeight: 1,
          color: accent ? "#78eea0" : "#fff",
          letterSpacing: ".02em",
          ...tabularNum,
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontFamily: FB,
          fontWeight: 800,
          fontSize: 8,
          letterSpacing: ".12em",
          color: accent ? "rgba(120,238,160,.6)" : "rgba(120,180,210,.55)",
          marginTop: 1,
        }}
      >
        {label}
      </div>
    </div>
  );
}

function BodyGradeCard({ body, fitness }: { body: BodyGrade; fitness: Fitness }) {
  const { grade, this_week_base, streak_weeks } = body;
  const isFloor = grade !== this_week_base;

  return (
    <div
      style={{
        background:
          "repeating-linear-gradient(118deg,rgba(255,255,255,.025) 0 2px,transparent 2px 14px)," +
          "linear-gradient(160deg,#163a55,#0b2033)",
        clipPath: t.clipCard,
        boxShadow: `inset 0 0 0 2px ${t.frame}`,
        padding: "20px 24px",
        display: "flex",
        gap: 22,
        alignItems: "flex-start",
      }}
    >
      <RankTile grade={grade} isFloor={isFloor} />

      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
        {/* heading row */}
        <div style={{ display: "flex", alignItems: "baseline", gap: 14, flexWrap: "wrap" }}>
          <div style={{ fontFamily: FD, fontSize: 26, lineHeight: 1, letterSpacing: ".04em", color: t.text }}>
            BODY GRADE
          </div>
          <div
            style={{
              fontFamily: FM,
              fontSize: 9.5,
              letterSpacing: ".14em",
              color: "rgba(120,180,210,.5)",
            }}
          >
            WEEKLY · RESETS SUN
          </div>
        </div>

        {/* description */}
        <div
          style={{
            fontFamily: FB,
            fontWeight: 600,
            fontSize: 13,
            lineHeight: 1.55,
            color: "rgba(180,210,235,.8)",
            maxWidth: 560,
          }}
        >
          {describeBodyGrade(grade, this_week_base, streak_weeks)}
        </div>

        {/* stat chips */}
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 2 }}>
          <StatChip value={`${fitness.lifting_sessions_7d}/3`} label="LIFTS" />
          <StatChip value={String(fitness.cardio_sessions_7d)} label="CARDIO" />
          <StatChip value={fmtSteps(fitness.steps_7d_avg)} label="STEPS AVG" />
          <div style={{ flex: 1 }} />
          <StatChip value={String(streak_weeks)} label="WK S-STREAK" accent />
        </div>
      </div>
    </div>
  );
}

// --- section -----------------------------------------------------------------

export function FitnessSection({ body, fitness }: { body: BodyGrade; fitness: Fitness }): React.JSX.Element {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      <BodyGradeCard body={body} fitness={fitness} />
      <WeeklyCalendar />
      <BodyweightCard />
      <div style={ROW}>
        <WeeklyStepsTable />
        <CardioCard />
      </div>
    </div>
  );
}
