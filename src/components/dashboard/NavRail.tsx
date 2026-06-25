"use client";

import { CSSProperties } from "react";

import { NAV_ITEMS, SectionKey } from "./nav";
import { t, buttonReset } from "./tokens";

interface NavRailProps {
  active: SectionKey;
  onSelect: (key: SectionKey) => void;
  /** Drawer open state (only meaningful below the 860px breakpoint). */
  open: boolean;
  onClose: () => void;
}

const baseRow: CSSProperties = {
  ...buttonReset,
  width: "100%",
  fontFamily: t.font.display,
  fontSize: 15,
  letterSpacing: ".04em",
  padding: "11px 13px",
  marginBottom: 2,
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  minHeight: 44, // touch target
};

const activeRow: CSSProperties = {
  ...baseRow,
  color: "#04101a",
  background: `linear-gradient(90deg,${t.accent},${t.accent2})`,
  boxShadow: "0 0 16px rgba(80,200,255,.45)",
  clipPath: "polygon(0 0,100% 0,100% 100%,10px 100%,0 calc(100% - 10px))",
};

const idleRow: CSSProperties = {
  ...baseRow,
  color: "#9cc2da",
  borderLeft: "2px solid transparent",
};

const MONO = t.font.mono;
const DISPLAY = t.font.display;

/** Left status-window rail: wordmark, operator card, section list. Collapses to a drawer on small screens. */
export function NavRail({ active, onSelect, open, onClose }: NavRailProps) {
  return (
    <>
      {open && <div className="fr-nav-scrim" onClick={onClose} aria-hidden />}
      <nav
        aria-label="Sections"
        className="fr-nav-rail"
        data-open={open}
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
            aria-hidden
            style={{
              width: 40,
              height: 40,
              background: `linear-gradient(135deg,${t.accent},${t.accentDeep})`,
              transform: "rotate(45deg)",
              borderRadius: 8,
              boxShadow: "inset 0 0 0 2px rgba(255,255,255,.7),0 0 18px rgba(90,200,255,.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ transform: "rotate(-45deg)", fontFamily: DISPLAY, fontSize: 22, color: "#0a2030" }}>!</span>
          </div>
          <div>
            <div
              style={{
                fontFamily: DISPLAY,
                fontSize: 22,
                color: t.text,
                letterSpacing: ".02em",
                lineHeight: 0.9,
                textShadow: "0 0 14px rgba(120,210,245,.5)",
              }}
            >
              FRIDAY
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: t.textMuted, letterSpacing: ".14em", marginTop: 3 }}>
              STATUS WINDOW
            </div>
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "0 8px 14px", marginBottom: 8 }}>
          <div
            aria-hidden
            style={{
              width: 34,
              height: 34,
              background: `linear-gradient(135deg,${t.accentDeep},#36c5ff)`,
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
            <div style={{ fontFamily: DISPLAY, fontSize: 15, color: t.text, letterSpacing: ".03em", lineHeight: 1 }}>
              MARK
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: t.textMuted, marginTop: 3 }}>LV.41 · BUILDER</div>
          </div>
        </div>

        <div style={{ fontFamily: MONO, fontSize: 10, color: t.textDim, letterSpacing: ".14em", margin: "4px 8px 8px" }}>
          // SECTIONS
        </div>

        {NAV_ITEMS.map(({ key, label }) => {
          const isActive = key === active;
          return (
            <button
              key={key}
              type="button"
              onClick={() => onSelect(key)}
              aria-current={isActive ? "page" : undefined}
              className="fr-nav-row"
              style={isActive ? activeRow : idleRow}
            >
              <span>{label}</span>
              <span aria-hidden style={{ color: isActive ? "#04101a" : "transparent", fontSize: 13 }}>
                ◂
              </span>
            </button>
          );
        })}

        <div
          style={{
            marginTop: "auto",
            fontFamily: MONO,
            fontSize: 10,
            color: t.textDim,
            lineHeight: 1.7,
            padding: "12px 8px 0",
            borderTop: "1px solid rgba(150,212,236,.12)",
          }}
        >
          friday.local
          <br />↑ 41d 06h · synced 9s ago
        </div>
      </nav>
    </>
  );
}
