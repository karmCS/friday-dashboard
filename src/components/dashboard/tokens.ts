/**
 * Friday Dashboard design tokens — the single source of truth for the "Questism" HUD.
 *
 * The canonical *values* live as CSS custom properties in globals.css `:root`. This module
 * just exposes `var(--…)` references so React inline styles and CSS classes stay in sync —
 * change a value once in globals.css and every surface follows. Before this layer the same
 * teal frame, cyan, clip notch, and easing were copy-pasted (and drifting) across ~10 files.
 */
import type { CSSProperties } from "react";

export const t = {
  // surfaces
  bg: "var(--bg)",
  // brand
  accent: "var(--accent)",
  accent2: "var(--accent-2)",
  accentDeep: "var(--accent-deep)",
  // text (all meet WCAG AA 4.5:1 on the near-black ground)
  text: "var(--text)",
  textBody: "var(--text-body)",
  textMuted: "var(--text-muted)",
  textDim: "var(--text-dim)",
  // semantic state
  up: "var(--up)",
  down: "var(--down)",
  amber: "var(--amber)",
  // frame / glow
  frame: "var(--frame)",
  frameStrong: "var(--frame-strong)",
  glow: "var(--glow)",
  glowSoft: "var(--glow-soft)",
  // clip-path notch presets (apply by role)
  clipCard: "var(--clip-card)",
  clipCta: "var(--clip-cta)",
  // motion
  ease: "var(--ease)",
  dur: { fast: "var(--dur-fast)", normal: "var(--dur-normal)", slow: "var(--dur-slow)" },
  // type families (next/font variables, set on <html> in layout.tsx)
  font: {
    display: "var(--font-display)",
    body: "var(--font-body)",
    mono: "var(--font-mono)",
    jp: "var(--font-jp)",
  },
} as const;

/** Raw easing literal for the rare spot that can't take a CSS var (e.g. some JS animation libs). */
export const EASE = "cubic-bezier(0.23,1,0.32,1)";

/** Spread onto any element rendering live/aligned numerals so digit widths stop jittering. */
export const tabularNum: CSSProperties = {
  fontVariantNumeric: "tabular-nums",
  fontFeatureSettings: '"tnum" 1',
};

/** Reset for converting a clickable `<div>`/`<span>` into a real `<button>` without UA chrome. */
export const buttonReset: CSSProperties = {
  font: "inherit",
  color: "inherit",
  background: "none",
  border: 0,
  padding: 0,
  margin: 0,
  textAlign: "inherit",
  appearance: "none",
  cursor: "pointer",
};
