"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import type { Snapshot } from "@/lib/types";
import { NavRail } from "./NavRail";
import { TopBar } from "./TopBar";
import { SkipLink, srOnly } from "./ui";
import { Overview } from "./sections/Overview";
import { DeficitSection } from "./sections/DeficitSection";
import { InspectorSection } from "./sections/InspectorSection";
import { LandingSection } from "./sections/LandingSection";
import { PortfolioSection } from "./sections/PortfolioSection";
import { InfraSection } from "./sections/InfraSection";
import { OurFootageSection } from "./sections/OurFootageSection";
import { FitnessSection } from "./sections/FitnessSection";
import { TacosSection } from "./sections/TacosSection";
import { CafesSection } from "./sections/CafesSection";
import { SocialSection } from "./sections/SocialSection";
import { SectionKey, SECTION_TITLES } from "./nav";

function Section({ screen, snapshot, go }: { screen: SectionKey; snapshot: Snapshot; go: (k: SectionKey) => void }) {
  switch (screen) {
    case "overview":
      return <Overview snapshot={snapshot} onSelect={go} />;
    case "deficit":
      return <DeficitSection deficit={snapshot.deficit_app} onViewAthletes={() => go("inspector")} />;
    case "inspector":
      return <InspectorSection />;
    case "landing":
      return <LandingSection landing={snapshot.deficit_landing} />;
    case "portfolio":
      return <PortfolioSection portfolio={snapshot.portfolio} />;
    case "infra":
      return <InfraSection infra={snapshot.infra} />;
    case "ourfootage":
      return <OurFootageSection footage={snapshot.our_footage} infra={snapshot.infra} />;
    case "fitness":
      return <FitnessSection body={snapshot.grades.body} fitness={snapshot.fitness} />;
    case "tacos":
      return <TacosSection tacos={snapshot.tacos} />;
    case "cafes":
      return <CafesSection cafes={snapshot.cafes} />;
    case "social":
      return <SocialSection />;
  }
}

interface DashboardProps {
  snapshot: Snapshot;
}

const isSectionKey = (v: string): v is SectionKey => Object.prototype.hasOwnProperty.call(SECTION_TITLES, v);

/** Read the active section from the URL hash (e.g. "#/fitness"), falling back to overview. */
function screenFromHash(): SectionKey {
  if (typeof window === "undefined") return "overview";
  const raw = window.location.hash.replace(/^#\/?/, "");
  return isSectionKey(raw) ? raw : "overview";
}

/**
 * Client shell — the "Questism" SPA. Section state is driven by the URL hash so Back/Forward,
 * refresh, and deep links all work; on each switch we move focus to <main> and announce the
 * new section to assistive tech. Below 860px the rail collapses to an off-canvas drawer.
 */
export function Dashboard({ snapshot }: DashboardProps) {
  const [screen, setScreen] = useState<SectionKey>("overview");
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement>(null);
  const didMount = useRef(false);
  const scrollMemory = useRef<Partial<Record<SectionKey, number>>>({});

  // Seed from the hash on mount, and keep state in sync with Back/Forward.
  useEffect(() => {
    setScreen(screenFromHash());
    const onPop = () => setScreen(screenFromHash());
    window.addEventListener("popstate", onPop);
    window.addEventListener("hashchange", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      window.removeEventListener("hashchange", onPop);
    };
  }, []);

  const go = useCallback(
    (key: SectionKey) => {
      scrollMemory.current[screen] = window.scrollY;
      setNavOpen(false);
      if (`#/${key}` !== window.location.hash) window.history.pushState(null, "", `#/${key}`);
      setScreen(key);
    },
    [screen],
  );

  // Clear the session server-side, then hard-navigate to the login page.
  const logout = useCallback(async () => {
    try {
      await fetch("/api/auth/logout", { method: "POST" });
    } catch {
      /* even if the call fails, send the user to the gate */
    }
    window.location.assign("/login");
  }, []);

  // On section change: restore scroll, then move focus to <main> and let the live region announce.
  useEffect(() => {
    window.scrollTo(0, scrollMemory.current[screen] ?? 0);
    if (didMount.current) mainRef.current?.focus({ preventScroll: true });
    didMount.current = true;
  }, [screen]);

  return (
    <div style={{ width: "100%", minHeight: "100vh", display: "flex", background: "var(--bg)", color: "var(--text-body)" }}>
      <SkipLink />

      <NavRail active={screen} onSelect={go} open={navOpen} onClose={() => setNavOpen(false)} />

      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          background: "radial-gradient(140% 90% at 50% 0%,#11212e,#070d14 70%)",
        }}
      >
        <TopBar
          title={SECTION_TITLES[screen]}
          showBack={screen !== "overview"}
          onBack={() => go("overview")}
          onMenu={() => setNavOpen((v) => !v)}
          asOf={snapshot.as_of}
          allUp={snapshot.infra.all_up}
          onLogout={logout}
        />

        <main
          id="main"
          ref={mainRef}
          tabIndex={-1}
          className="fr-app-body"
          style={{ flex: 1, padding: "26px 30px 44px", outline: "none" }}
        >
          {/* re-keying on screen retriggers the section-enter animation */}
          <div key={screen} className="fr-section-enter">
            <Section screen={screen} snapshot={snapshot} go={go} />
          </div>
        </main>
      </div>

      {/* polite announcement of the active section for assistive tech */}
      <div aria-live="polite" style={srOnly}>
        {SECTION_TITLES[screen]} section
      </div>
    </div>
  );
}
