"use client";

import { CSSProperties } from "react";

import { NAV_ITEMS, SectionKey } from "./nav";

interface NavRailProps {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
}

const DISPLAY = "'Black Han Sans',sans-serif";
const MONO = "'JetBrains Mono',monospace";

const activeRow: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: 15,
  letterSpacing: ".04em",
  padding: "10px 13px",
  marginBottom: 2,
  color: "#04101a",
  background: "linear-gradient(90deg,#7fe3ff,#46b8ff)",
  boxShadow: "0 0 16px rgba(80,200,255,.45)",
  clipPath: "polygon(0 0,100% 0,100% 100%,10px 100%,0 calc(100% - 10px))",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
};

const idleRow: CSSProperties = {
  fontFamily: DISPLAY,
  fontSize: 15,
  letterSpacing: ".04em",
  padding: "10px 13px",
  marginBottom: 2,
  color: "#7fb4d6",
  cursor: "pointer",
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  borderLeft: "2px solid transparent",
};

/** Left status-window rail: wordmark, operator card, section list — ported from the design. */
export function NavRail({ active, onSelect }: NavRailProps) {
  return (
    <div
      style={{
        width: 232,
        flex: "none",
        background: "linear-gradient(165deg,#0e2b40,#07121d)",
        boxShadow: "inset -1px 0 0 rgba(150,212,236,.18)",
        padding: "20px 14px",
        display: "flex",
        flexDirection: "column",
        position: "sticky",
        top: 0,
        height: "100vh",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 11,
          padding: "0 8px 16px",
          borderBottom: "1px solid rgba(150,212,236,.16)",
          marginBottom: 14,
        }}
      >
        <div
          style={{
            width: 40,
            height: 40,
            background: "linear-gradient(135deg,#7fe3ff,#2b8bff)",
            transform: "rotate(45deg)",
            borderRadius: 8,
            boxShadow: "inset 0 0 0 2px rgba(255,255,255,.7),0 0 18px rgba(90,200,255,.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ transform: "rotate(-45deg)", fontFamily: DISPLAY, fontSize: 22, color: "#0a2030" }}>
            !
          </span>
        </div>
        <div>
          <div
            style={{
              fontFamily: DISPLAY,
              fontSize: 22,
              color: "#eafaff",
              letterSpacing: ".02em",
              lineHeight: 0.9,
              textShadow: "0 0 14px rgba(120,210,245,.5)",
            }}
          >
            FRIDAY
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: "#5fb8e6", letterSpacing: ".14em", marginTop: 3 }}>
            STATUS WINDOW
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px 14px", marginBottom: 8 }}>
        <div
          style={{
            width: 34,
            height: 34,
            background: "linear-gradient(135deg,#2b7fff,#36c5ff)",
            clipPath: "polygon(0 0,100% 0,100% 72%,72% 100%,0 100%)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontFamily: DISPLAY,
            fontSize: 18,
            color: "#04101f",
          }}
        >
          M
        </div>
        <div>
          <div style={{ fontFamily: DISPLAY, fontSize: 15, color: "#eafaff", letterSpacing: ".03em", lineHeight: 1 }}>
            MARK
          </div>
          <div style={{ fontFamily: MONO, fontSize: 9, color: "#5fb8e6", marginTop: 3 }}>LV.41 · BUILDER</div>
        </div>
      </div>

      <div style={{ fontFamily: MONO, fontSize: 9, color: "#3f6f8c", letterSpacing: ".14em", margin: "4px 8px 8px" }}>
        // SECTIONS
      </div>

      {NAV_ITEMS.map(({ key, label }) => {
        const isActive = key === active;
        return (
          <div
            key={key}
            onClick={() => onSelect(key)}
            style={isActive ? activeRow : idleRow}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.filter = "brightness(1.18)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.filter = "";
            }}
          >
            <span>{label}</span>
            <span style={{ color: isActive ? "#04101a" : "transparent", fontSize: 13 }}>◂</span>
          </div>
        );
      })}

      <div
        style={{
          marginTop: "auto",
          fontFamily: MONO,
          fontSize: 9,
          color: "#345970",
          lineHeight: 1.7,
          padding: "12px 8px 0",
          borderTop: "1px solid rgba(150,212,236,.12)",
        }}
      >
        friday.local
        <br />↑ 41d 06h · synced 9s ago
      </div>
    </div>
  );
}
