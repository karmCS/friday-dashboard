"use client";

import { useState } from "react";

import type { Snapshot } from "@/lib/types";
import { NavRail } from "./NavRail";
import { TopBar } from "./TopBar";
import { Overview } from "./sections/Overview";
import { InfraSection } from "./sections/InfraSection";
import { OurFootageSection } from "./sections/OurFootageSection";
import { FitnessSection } from "./sections/FitnessSection";
import { TacosSection } from "./sections/TacosSection";
import { StubSection } from "./sections/StubSection";
import { SectionKey, SECTION_TITLES } from "./nav";

function Section({ screen, snapshot, go }: { screen: SectionKey; snapshot: Snapshot; go: (k: SectionKey) => void }) {
  switch (screen) {
    case "overview":
      return <Overview snapshot={snapshot} onSelect={go} />;
    case "infra":
      return <InfraSection infra={snapshot.infra} />;
    case "ourfootage":
      return <OurFootageSection footage={snapshot.our_footage} infra={snapshot.infra} />;
    case "fitness":
      return <FitnessSection />;
    case "tacos":
      return <TacosSection tacos={snapshot.tacos} />;
    default:
      return <StubSection title={SECTION_TITLES[screen]} />;
  }
}

interface DashboardProps {
  snapshot: Snapshot;
}

/**
 * Client shell — the Claude Design SPA ported to React. Holds the active-section state,
 * renders the nav rail + top bar, and switches the body. Overview is wired to the live
 * snapshot; the other sections are stubbed pending their own port passes.
 */
export function Dashboard({ snapshot }: DashboardProps) {
  const [screen, setScreen] = useState<SectionKey>("overview");

  const go = (key: SectionKey) => {
    setScreen(key);
    if (typeof window !== "undefined") window.scrollTo(0, 0);
  };

  return (
    <div style={{ width: "100%", minHeight: "100vh", display: "flex", background: "#05090e", color: "#cfe6f5", fontFamily: "'Barlow',system-ui,sans-serif" }}>
      <NavRail active={screen} onSelect={go} />

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
          asOf={snapshot.as_of}
          allUp={snapshot.infra.all_up}
        />

        <div style={{ flex: 1, padding: "26px 30px 44px" }}>
          <Section screen={screen} snapshot={snapshot} go={go} />
        </div>
      </div>
    </div>
  );
}
