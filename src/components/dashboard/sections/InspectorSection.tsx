"use client";

/**
 * ATHLETE INSPECTOR — Deficit drill-down (the one PII surface, read LIVE on demand).
 *
 * Orchestrates two views off /api/inspector:
 *   • ROSTER  — every athlete in a scrollable, client-filtered grid (name/sport/weight class/age).
 *   • DETAIL  — one athlete: identity + headline stats, AI-coach chat transcript, daily macros vs
 *               prescription, bodyweight trend, and weekly check-ins.
 *
 * Renders ONLY server data — nothing faked; with no service_role key in dev the API returns
 * empty results and every panel shows an honest empty state. PII justification lives in the
 * route + ./inspector/style.ts. Motion is governed by the single global reduced-motion guard.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { t, buttonReset } from "@/components/dashboard/tokens";
import { Skeleton } from "@/components/dashboard/ui";
import { panel } from "./inspector/style";
import { RosterView } from "./inspector/RosterView";
import { DetailView } from "./inspector/DetailView";
import { fetchRoster, fetchDetail, type Athlete, type DetailData } from "./inspector/api";

type Status = "loading" | "ready" | "error";

// --- small shared surfaces ----------------------------------------------------

function ErrorPanel({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div style={panel({ textAlign: "center", padding: "44px 20px" })}>
      <div style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 13.5, color: t.down, marginBottom: 12 }}>{message}</div>
      <button
        type="button"
        onClick={onRetry}
        className="fr-pressable"
        style={{ ...buttonReset, fontFamily: t.font.body, fontWeight: 700, fontSize: 11.5, letterSpacing: ".04em", color: t.accent, padding: "7px 16px", borderRadius: 7, boxShadow: `inset 0 0 0 1px ${t.frame}` }}
      >
        Retry
      </button>
    </div>
  );
}

/** Shape-matching skeleton for the roster grid (filter bar + a few cards). */
function RosterSkeleton() {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }} aria-hidden>
      <div style={panel({ display: "flex", gap: 14, flexWrap: "wrap" })}>
        {[200, 130, 130, 110].map((w, i) => (
          <Skeleton key={i} width={w} height={42} radius={9} />
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14 }}>
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} width={268} height={168} radius={11} />
        ))}
      </div>
    </div>
  );
}

/** Back control + skeleton while a single athlete's detail loads. */
function DetailSkeleton({ onBack }: { onBack: () => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <button
        type="button"
        onClick={onBack}
        className="fr-pressable"
        style={{ ...buttonReset, alignSelf: "flex-start", display: "inline-flex", alignItems: "center", gap: 7, fontFamily: t.font.body, fontWeight: 700, fontSize: 11.5, letterSpacing: ".06em", color: t.accent, padding: "8px 15px", borderRadius: 8, boxShadow: `inset 0 0 0 1px ${t.frame}` }}
      >
        <span aria-hidden>←</span> ALL ATHLETES
      </button>
      <Skeleton height={150} radius={11} />
      <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }} aria-hidden>
        <Skeleton width={380} height={420} radius={11} style={{ flex: "1.5 1 380px" }} />
        <div style={{ flex: "1 1 300px", minWidth: 280, display: "flex", flexDirection: "column", gap: 14 }}>
          <Skeleton height={150} radius={11} />
          <Skeleton height={200} radius={11} />
        </div>
      </div>
    </div>
  );
}

// --- main ---------------------------------------------------------------------

export function InspectorSection(): React.JSX.Element {
  const [roster, setRoster] = useState<Athlete[]>([]);
  const [rosterStatus, setRosterStatus] = useState<Status>("loading");

  const [selected, setSelected] = useState<Athlete | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [detailStatus, setDetailStatus] = useState<Status>("loading");

  const rosterAbort = useRef<AbortController | null>(null);
  const detailAbort = useRef<AbortController | null>(null);

  const loadRoster = useCallback(() => {
    rosterAbort.current?.abort();
    const controller = new AbortController();
    rosterAbort.current = controller;
    setRosterStatus("loading");
    void (async () => {
      try {
        const athletes = await fetchRoster(controller.signal);
        setRoster(athletes);
        setRosterStatus("ready");
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setRosterStatus("error");
      }
    })();
  }, []);

  const loadDetail = useCallback((fighterId: string) => {
    detailAbort.current?.abort();
    const controller = new AbortController();
    detailAbort.current = controller;
    setDetailStatus("loading");
    setDetail(null);
    void (async () => {
      try {
        const data = await fetchDetail(fighterId, controller.signal);
        setDetail(data);
        setDetailStatus("ready");
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setDetailStatus("error");
      }
    })();
  }, []);

  // Initial roster load.
  useEffect(() => {
    loadRoster();
    return () => rosterAbort.current?.abort();
  }, [loadRoster]);

  // Tear down any in-flight detail request on unmount.
  useEffect(() => () => detailAbort.current?.abort(), []);

  const selectAthlete = useCallback(
    (athlete: Athlete) => {
      setSelected(athlete);
      loadDetail(athlete.fighter_id);
    },
    [loadDetail],
  );

  const back = useCallback(() => {
    detailAbort.current?.abort();
    setSelected(null);
    setDetail(null);
  }, []);

  return (
    <div style={{ maxWidth: 1180, margin: "0 auto" }}>
      {selected !== null ? (
        detailStatus === "loading" ? (
          <DetailSkeleton onBack={back} />
        ) : detailStatus === "error" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <ErrorPanel message="Could not load this athlete." onRetry={() => loadDetail(selected.fighter_id)} />
          </div>
        ) : (
          // ready — fall the header back to the clicked card if the API returned no roster row.
          <DetailView
            detail={{
              athlete: detail?.athlete ?? selected,
              chat: detail?.chat ?? [],
              macros: detail?.macros ?? { days: [], targets: null },
              bodyweight: detail?.bodyweight ?? [],
              checkins: detail?.checkins ?? [],
            }}
            onBack={back}
          />
        )
      ) : rosterStatus === "loading" ? (
        <RosterSkeleton />
      ) : rosterStatus === "error" ? (
        <ErrorPanel message="Could not load athletes." onRetry={loadRoster} />
      ) : (
        <RosterView athletes={roster} onSelect={selectAthlete} />
      )}
    </div>
  );
}
