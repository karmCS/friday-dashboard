"use client";

/**
 * FITNESS section — self-fetching, all hand-built inline SVG (no chart library).
 *
 * Renders the "Questism" FITNESS surface from the design: a weekly kanban (Mon–Sun), an RIR
 * compression hero line chart with a 0–1 target band, weekly stacked-volume bars, a rep
 * drop-off curve, a PR table, a bodyweight trend (raw + 7d moving average), steps bars, and a
 * cardio HR trend. Every chart degrades gracefully to an empty state when the DB has no rows
 * (the common case in dev).
 *
 * Data comes from the read endpoints under /api/fitness/* (all behind Cloudflare Access). JSON
 * is narrowed from `unknown` — no `any`. Presentational pieces live in ./fitness/charts; shared
 * tokens, types, helpers, and the card shell live in ./fitness/shared.
 */

import { useEffect, useState } from "react";

import {
  BodyweightChart,
  CardioHrChart,
  PrTable,
  RepDropoffChart,
  RirCompressionChart,
  StepsChart,
  WeeklyKanban,
  WeeklyVolumeChart,
} from "./fitness/charts";
import {
  BODY,
  BodyweightResponse,
  CardioSession,
  EMPTY_ANALYTICS,
  EMPTY_BODYWEIGHT,
  fetchData,
  FitnessAnalytics,
  FitnessData,
  SessionSummary,
  StepsEntry,
} from "./fitness/shared";

/** Centered loading / error filler matching the section's muted body type. */
function CenteredMessage({ children }: { children: React.ReactNode }): React.JSX.Element {
  return (
    <div
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "60px 20px",
        textAlign: "center",
        fontFamily: BODY,
        fontWeight: 700,
        fontSize: 13,
        letterSpacing: ".1em",
        color: "#6fa8cc",
      }}
    >
      {children}
    </div>
  );
}

export function FitnessSection(): React.JSX.Element {
  const [data, setData] = useState<FitnessData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load(): Promise<void> {
      try {
        const [sessions, cardio, bodyweight, steps, analytics] = await Promise.all([
          fetchData<SessionSummary[]>("/api/fitness/sessions", []),
          fetchData<CardioSession[]>("/api/fitness/cardio", []),
          fetchData<BodyweightResponse>("/api/fitness/bodyweight", EMPTY_BODYWEIGHT),
          fetchData<StepsEntry[]>("/api/fitness/steps", []),
          fetchData<FitnessAnalytics>("/api/fitness/analytics", EMPTY_ANALYTICS),
        ]);
        if (cancelled) return;
        setData({ sessions, cardio, bodyweight, steps, analytics });
      } catch (e: unknown) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load fitness data.");
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) return <CenteredMessage>COULD NOT LOAD FITNESS DATA · {error}</CenteredMessage>;
  if (!data) return <CenteredMessage>LOADING FITNESS DATA…</CenteredMessage>;

  const { sessions, cardio, bodyweight, steps, analytics } = data;

  return (
    <div style={{ maxWidth: 1200, margin: "0 auto", display: "flex", flexDirection: "column", gap: 13 }}>
      <WeeklyKanban sessions={sessions} cardio={cardio} />

      <div style={{ display: "flex", gap: 13, alignItems: "stretch", flexWrap: "wrap" }}>
        <RirCompressionChart points={analytics.rir_compression} />
        <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 13, minWidth: 260 }}>
          <RepDropoffChart dropoff={analytics.rep_dropoff} />
          <CardioHrChart points={analytics.cardio_hr} />
        </div>
      </div>

      <div style={{ display: "flex", gap: 13, alignItems: "stretch", flexWrap: "wrap" }}>
        <WeeklyVolumeChart weeks={analytics.weekly_volume} />
        <PrTable prs={analytics.prs} />
      </div>

      <div style={{ display: "flex", gap: 13, alignItems: "stretch", flexWrap: "wrap" }}>
        <BodyweightChart data={bodyweight} />
        <StepsChart steps={steps} />
      </div>
    </div>
  );
}
