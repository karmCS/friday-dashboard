"use client";

interface TopBarProps {
  title: string;
  showBack: boolean;
  onBack: () => void;
  /** ISO timestamp the snapshot was generated. */
  asOf: string;
  allUp: boolean;
}

const DISPLAY = "'Black Han Sans',sans-serif";
const MONO = "'JetBrains Mono',monospace";

/** Format an ISO timestamp as the design's "YYYY.MM.DD // HH:MM:SS" sync stamp. */
function formatSync(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} // ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

/** Sticky top bar: back-to-overview, section title, sync stamp, all-systems indicator. */
export function TopBar({ title, showBack, onBack, asOf, allUp }: TopBarProps) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        padding: "20px 30px",
        borderBottom: "1px solid rgba(150,212,236,.14)",
        position: "sticky",
        top: 0,
        background: "rgba(8,16,24,.82)",
        backdropFilter: "blur(8px)",
        zIndex: 20,
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
        {showBack && (
          <span
            onClick={onBack}
            style={{
              fontFamily: MONO,
              fontSize: 12,
              color: "#7fd2ff",
              cursor: "pointer",
              border: "1px solid rgba(120,200,245,.35)",
              borderRadius: 5,
              padding: "6px 11px",
            }}
          >
            ← OVERVIEW
          </span>
        )}
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 30,
            color: "#eafaff",
            letterSpacing: ".03em",
            textShadow: "0 0 16px rgba(120,210,245,.45)",
          }}
        >
          {title}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontFamily: MONO, fontSize: 11, color: "#4f88a8" }}>SYNC {formatSync(asOf)}</span>
        <span
          style={{
            fontFamily: DISPLAY,
            fontSize: 13,
            letterSpacing: ".08em",
            color: allUp ? "#7dffb0" : "#ff9a8a",
            border: `1px solid ${allUp ? "#1e5c44" : "#5c2a2a"}`,
            background: allUp ? "rgba(70,227,160,.08)" : "rgba(227,90,70,.08)",
            padding: "6px 13px",
            boxShadow: `0 0 16px ${allUp ? "rgba(70,227,160,.14)" : "rgba(227,90,70,.14)"}`,
            clipPath: "polygon(0 0,100% 0,100% 100%,8px 100%,0 calc(100% - 8px))",
          }}
        >
          ◆ {allUp ? "ALL ONLINE" : "DEGRADED"}
        </span>
      </div>
    </div>
  );
}
