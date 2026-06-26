"use client";

import { CSSProperties } from "react";

import { t, buttonReset } from "./tokens";
import { formatSync, minutesSince } from "@/lib/format";

interface TopBarProps {
  title: string;
  showBack: boolean;
  onBack: () => void;
  /** Toggle the nav drawer (small screens only). */
  onMenu: () => void;
  /** ISO timestamp the snapshot was generated. */
  asOf: string;
  allUp: boolean;
  /** Clear the session and return to the login page. */
  onLogout: () => void;
}

const DISPLAY = t.font.display;
const MONO = t.font.mono;

/** Snapshots older than this read as stale. */
const STALE_AFTER_MIN = 10;

const iconBtn: CSSProperties = {
  ...buttonReset,
  fontFamily: MONO,
  fontSize: 12,
  color: t.accent,
  border: "1px solid rgba(120,200,245,.35)",
  borderRadius: 5,
  padding: "8px 11px",
  minHeight: 40,
};

/** Sticky top bar: menu (mobile), back-to-overview, section title, sync stamp, all-systems indicator. */
export function TopBar({ title, showBack, onBack, onMenu, asOf, allUp, onLogout }: TopBarProps) {
  const staleMin = minutesSince(asOf);
  const isStale = staleMin !== null && staleMin > STALE_AFTER_MIN;

  return (
    <header
      className="fr-topbar"
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        gap: 12,
        padding: "16px 30px",
        borderBottom: "1px solid rgba(150,212,236,.14)",
        position: "sticky",
        top: 0,
        background: "rgba(8,16,24,.82)",
        backdropFilter: "blur(8px)",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14, minWidth: 0 }}>
        <button type="button" className="fr-nav-toggle fr-pressable" onClick={onMenu} aria-label="Open sections menu" style={iconBtn}>
          ☰
        </button>
        {showBack && (
          <button type="button" className="fr-pressable" onClick={onBack} aria-label="Back to overview" style={iconBtn}>
            ←<span className="fr-back-label">&nbsp;OVERVIEW</span>
          </button>
        )}
        <h1
          className="fr-topbar-title"
          style={{
            margin: 0,
            fontFamily: DISPLAY,
            fontWeight: 400,
            fontSize: 30,
            color: t.text,
            letterSpacing: ".03em",
            textShadow: "0 0 16px rgba(120,210,245,.45)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {title}
        </h1>
      </div>

      <div className="fr-topbar-meta" style={{ display: "flex", alignItems: "center", gap: 16, flex: "none" }}>
        <span className="fr-sync" suppressHydrationWarning style={{ fontFamily: MONO, fontSize: 11, color: isStale ? t.amber : t.textMuted }}>
          {isStale ? <span className="fr-sync-stale">STALE</span> : null}
          <span className="fr-sync-time">{isStale ? " · " : ""}SYNC {formatSync(asOf)}</span>
        </span>
        <span
          role="status"
          className={allUp ? undefined : "fr-pulse-alert"}
          style={{
            fontFamily: DISPLAY,
            fontSize: 13,
            letterSpacing: ".08em",
            color: allUp ? t.up : t.down,
            border: `1px solid ${allUp ? "#1e5c44" : "#5c2a2a"}`,
            background: allUp ? "rgba(70,227,160,.08)" : "rgba(227,90,70,.08)",
            padding: "6px 13px",
            clipPath: t.clipCta,
          }}
        >
          <span aria-hidden>◆</span>
          <span className="fr-status-label">&nbsp;{allUp ? "ALL ONLINE" : "DEGRADED"}</span>
        </span>
        <button type="button" className="fr-pressable" onClick={onLogout} aria-label="Sign out" style={iconBtn}>
          SIGN OUT
        </button>
      </div>
    </header>
  );
}
