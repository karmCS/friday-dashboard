/**
 * Athlete Inspector — shared visual language + display helpers.
 *
 * The Inspector's mood is calmer/darker than the bright Questism Overview: flat near-black
 * panels with a soft inset 1px border (no clip-path frames). These literals are the section's
 * deliberate palette; brand/text roles still come from the shared design tokens.
 */

import type { CSSProperties } from "react";
import { t } from "@/components/dashboard/tokens";

export const PANEL_BG = "#0c1620";
export const ENTRY_BG = "#0e1c27";
export const BORDER = "rgba(120,150,170,.18)";
export const BORDER_SOFT = "rgba(120,150,170,.14)";
export const PANEL_TEXT = "#dceef2";

/** A flat Inspector panel — no clip-path, just a soft inset 1px border. */
export const panel = (extra?: CSSProperties): CSSProperties => ({
  background: PANEL_BG,
  boxShadow: `inset 0 0 0 1px ${BORDER}`,
  borderRadius: 11,
  padding: "18px 20px",
  ...extra,
});

export const panelHeading: CSSProperties = {
  fontFamily: t.font.display,
  fontSize: 16,
  color: PANEL_TEXT,
  letterSpacing: ".03em",
};

export const panelMeta: CSSProperties = {
  fontFamily: t.font.mono,
  fontSize: 9,
  color: t.textDim,
};

const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parse loosely for DISPLAY. A bare `YYYY-MM-DD` (Postgres DATE, e.g. food log_date / weigh-in
 * dates) is parsed as UTC midnight by JS — which shifts the label back a day for any viewer west
 * of UTC. Anchor those to local midnight; full timestamps pass through unchanged.
 */
function parseForDisplay(iso: string): Date {
  return new Date(DATE_ONLY_RE.test(iso) ? `${iso}T00:00:00` : iso);
}

/** "JUN 18" from an ISO/`YYYY-MM-DD` string ("—" on parse failure). */
export function fmtDay(iso: string | null): string {
  if (!iso) return "—";
  const d = parseForDisplay(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

/** "JUN 18 · 9:14 AM" from an ISO timestamp ("—" on parse failure). */
export function fmtDayTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const time = d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return `${MONTHS[d.getMonth()]} ${d.getDate()} · ${time}`;
}

/** Coarse recency label from a timestamp: "today" / "3d ago" / "—". */
export function relativeDays(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const days = Math.floor((Date.now() - d.getTime()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days}d ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

/** First letter of a name for the avatar disc; "?" when unknown. */
export function initial(name: string | null): string {
  const trimmed = (name ?? "").trim();
  return trimmed.length > 0 ? trimmed[0].toUpperCase() : "?";
}

/** A safe display name — never leaks an empty string. */
export function displayName(name: string | null): string {
  const n = (name ?? "").trim();
  return n.length > 0 ? n : "Unknown athlete";
}

/** Short uuid prefix for chips ("a7f3"); "—" when missing. */
export function shortId(fighterId: string): string {
  const head = fighterId.split("-")[0] ?? fighterId;
  return head.slice(0, 4) || "—";
}

/**
 * Display label for an athlete's weight class. Their data often stores no label, only a
 * numeric target, so fall back to "135 lb" before giving up.
 */
export function weightClassLabel(label: string | null, target: number | null): string | null {
  const l = (label ?? "").trim();
  if (l !== "") return l;
  if (target !== null && Number.isFinite(target)) return `${target} lb`;
  return null;
}
