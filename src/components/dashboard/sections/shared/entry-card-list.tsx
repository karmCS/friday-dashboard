"use client";

/**
 * Phone log: one tappable card per entry, replacing the dense desktop table below 720px.
 * Tapping a card opens the shared {@link EntryDetail} (view / edit / photo / delete). This is
 * rendered alongside the table and toggled purely by the `.fr-only-narrow` / `.fr-only-wide`
 * CSS visibility classes — no JS breakpoint, so there's no hydration mismatch.
 */

import { CSSProperties } from "react";

import { t, tabularNum } from "@/components/dashboard/tokens";
import type { DetailPalette } from "./entry-detail";

const DISPLAY = t.font.display;
const BODY = t.font.body;
const MONO = t.font.mono;

/** Minimal shape a card needs; sections pass their richer log rows (which satisfy this). */
export interface CardRow {
  id: number;
  place: string;
  city: string;
  state: string;
  rating: number | null;
  price_tier: string | null;
}

interface Props<R extends CardRow> {
  rows: readonly R[];
  /** Reuses the section's EntryDetail palette (taco magenta / cafe espresso). */
  palette: DetailPalette;
  emoji: string;
  title: string;
  /** The item field (taco_type / order_item) shown as the card's secondary line. */
  getType: (row: R) => string;
  photoUrlFor: (row: R) => string | null;
  onOpen: (row: R) => void;
  highlightId: number | null;
  /** When set, replaces the list body (e.g. "Loading log…" / load-error copy). */
  note?: string | null;
  emptyText: string;
}

export function EntryCardList<R extends CardRow>({
  rows,
  palette: p,
  emoji,
  title,
  getType,
  photoUrlFor,
  onOpen,
  highlightId,
  note,
  emptyText,
}: Props<R>) {
  const frame: CSSProperties = {
    background: p.frameBg,
    clipPath: t.clipCard,
    boxShadow: `inset 0 0 0 2px ${p.frameBorder}`,
    padding: "16px 15px",
  };

  return (
    <div style={frame}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 12 }}>
        <div style={{ fontFamily: DISPLAY, fontSize: 18, color: p.heading, letterSpacing: ".03em" }}>{title}</div>
        <div style={{ fontFamily: MONO, fontSize: 10, color: p.muted, ...tabularNum }}>
          {rows.length} {rows.length === 1 ? "ENTRY" : "ENTRIES"}
        </div>
      </div>

      {note ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: p.muted, padding: "20px 4px", textAlign: "center" }}>{note}</div>
      ) : rows.length === 0 ? (
        <div style={{ fontFamily: BODY, fontSize: 13, color: p.dim, padding: "20px 4px", textAlign: "center" }}>{emptyText}</div>
      ) : (
        <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "flex", flexDirection: "column", gap: 9 }}>
          {rows.map((row) => {
            const src = photoUrlFor(row);
            const where = [row.city, row.state].filter(Boolean).join(", ");
            const type = getType(row);
            const lit = row.id === highlightId;
            return (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onOpen(row)}
                  className={`fr-pressable${lit ? " fr-pulse-alert" : ""}`}
                  aria-label={`Open ${row.place}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    width: "100%",
                    textAlign: "left",
                    border: "none",
                    cursor: "pointer",
                    borderRadius: 12,
                    padding: "10px 11px",
                    background: lit ? "rgba(255,255,255,.07)" : "rgba(0,0,0,.22)",
                    boxShadow: `inset 0 0 0 1px ${p.frameBorder}`,
                  }}
                >
                  <span
                    style={{
                      flex: "none",
                      width: 46,
                      height: 46,
                      borderRadius: 9,
                      overflow: "hidden",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "rgba(0,0,0,.35)",
                      boxShadow: `inset 0 0 0 1px ${p.frameBorder}`,
                    }}
                  >
                    {src ? (
                      /* eslint-disable-next-line @next/next/no-img-element -- own-API upload */
                      <img src={src} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
                    ) : (
                      <span aria-hidden style={{ fontSize: 20, opacity: 0.4 }}>{emoji}</span>
                    )}
                  </span>

                  <span style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 3 }}>
                    <span style={{ fontFamily: BODY, fontWeight: 800, fontSize: 15, color: p.heading, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {row.place}
                    </span>
                    <span style={{ fontFamily: BODY, fontWeight: 600, fontSize: 12, color: p.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {where}
                      {where && type ? " · " : ""}
                      {type}
                    </span>
                  </span>

                  <span style={{ flex: "none", display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 2 }}>
                    <span style={{ fontFamily: DISPLAY, fontSize: 22, lineHeight: 1, color: p.ratingColor(row.rating), ...tabularNum }}>
                      {row.rating ?? "—"}
                    </span>
                    <span style={{ fontFamily: DISPLAY, fontSize: 12, color: p.gold }}>{row.price_tier ?? ""}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
