"use client";

/**
 * FITNESS section (calendar-based model, 2026-06-24 pivot).
 *
 * No longer per-set logging. A thin layout over four self-fetching cards:
 *   1. WeeklyCalendar — the workout-label week grid (Runna-style), full CRUD.
 *   2. BodyweightCard — the hero trend chart (MacroFactor-style) + CSV import.
 *   3. StepsCard      — iOS-Shortcut step history.
 *   4. CardioCard     — Strava cardio (HR trend + recent sessions).
 *
 * Each card owns its own fetch, skeleton, empty, and error states, so the surface reveals
 * progressively and one slow/failing source never blocks the others.
 */

import { BodyweightCard } from "./fitness/bodyweight";
import { WeeklyCalendar } from "./fitness/calendar";
import { CardioCard, StepsCard } from "./fitness/charts";

const ROW = { display: "flex", gap: 13, alignItems: "stretch", flexWrap: "wrap" } as const;

export function FitnessSection(): React.JSX.Element {
  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      <WeeklyCalendar />
      <BodyweightCard />
      <div style={ROW}>
        <StepsCard />
        <CardioCard />
      </div>
    </div>
  );
}
