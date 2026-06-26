import { useRef, useLayoutEffect, type CSSProperties } from "react";

export type GradeId =
  | "MR" | "MR+" | "UR" | "UR+" | "SSR" | "SSR+" | "SR" | "SR+"
  | "A+" | "A" | "S+" | "S" | "SS" | "SS+" | "SS-" | "S-" | "SSS"
  | "SSS-" | "SSS+"
  | "XX" | "EX" | "DX" | "X" | "XXX"
  | "B" | "B+" | "C" | "C+" | "F" | "E" | "D" | "LR" | "LR+"
  | "Immeasurable";

export const ALL_GRADES: GradeId[] = [
  "MR","MR+","UR","UR+","SSR","SSR+","SR","SR+",
  "A+","A","S+","S","SS","SS+","SS-","S-","SSS","SSS-","SSS+",
  "XX","EX","DX","X","XXX","B","B+","C","C+","F","E","D","LR","LR+",
  "Immeasurable",
];

// Tile backgrounds (reference only — tile itself is transparent in use)
const holo  = "repeating-linear-gradient(118deg,rgba(255,255,255,.13) 0 5px,rgba(255,255,255,0) 5px 13px),radial-gradient(135% 120% at 28% 14%,#eafaff 0%,#b2e1f3 30%,#7cc4e6 56%,#9ad4ee 76%,#c6edf9 100%)";
const blue  = "radial-gradient(120% 120% at 30% 16%,rgba(255,255,255,.4),rgba(255,255,255,0) 46%),linear-gradient(162deg,#90c1e3 0%,#4d85b8 55%,#315c8f 100%)";
const teal  = "radial-gradient(120% 120% at 30% 16%,rgba(255,255,255,.45),rgba(255,255,255,0) 46%),linear-gradient(162deg,#a2e6f1 0%,#46b4cf 55%,#2a7f9a 100%)";
const red   = "repeating-linear-gradient(54deg,rgba(0,0,0,.13) 0 3px,rgba(0,0,0,0) 3px 8px),radial-gradient(115% 105% at 42% 30%,#d2473605 0,#cf4332 8%,#8a221a 60%,#4a0f0b 100%)";
const darkc  = "radial-gradient(circle at 50% 40%,#1e3d59 0%,#0c2236 72%,#081826 100%)";
const navyD  = "radial-gradient(120% 120% at 30% 16%,rgba(255,255,255,.18),rgba(255,255,255,0) 46%),linear-gradient(160deg,#2a4a72,#0e2238)";
const voidBg = "radial-gradient(circle at 50% 40%,#1a0000 0%,#0d0000 70%,#000 100%)";

// Fill gradients
const orange    = "linear-gradient(180deg,#ffc878,#ff8a1e 52%,#dd6406)";
const redG      = "linear-gradient(180deg,#ff9384,#f23a28 52%,#bd1d10)";
const blueG     = "linear-gradient(180deg,#bcd6ff,#4f7be6 52%,#2b3f94)";
const cyanG     = "linear-gradient(180deg,#cdf7ff,#41cdf2 52%,#0f93bd)";
const navyStroke = "#15233f";

// CSS strings for gradient-text effects — must be applied via cssText (paint-order, -webkit-text-fill-color
// are not reliably settable through React's style prop on all render paths).
type TextCSS = string;
interface Recipe { tileBg: string; textCSS: TextCSS }

function chrome(g: string, glow: string): Recipe {
  return { tileBg: holo, textCSS: `background:${g};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;-webkit-text-stroke:1.7px #c2d4e2;paint-order:stroke fill;filter:drop-shadow(0 1px 1px rgba(18,40,60,.55)) drop-shadow(0 0 9px ${glow});` };
}
function gold(): Recipe {
  return { tileBg: holo, textCSS: "background:linear-gradient(180deg,#fff3b8 0%,#ffd84e 38%,#e98e12 60%,#ffd54a 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;-webkit-text-stroke:2.4px #6b3000;paint-order:stroke fill;filter:drop-shadow(0 1px 0 rgba(0,0,0,.4)) drop-shadow(0 0 9px rgba(255,168,40,.7));" };
}
// X / XX / XXX — sinister black-red text, WHITE glow (Questism: white glow shared across X-XXX)
function xTier(): Recipe {
  return { tileBg: voidBg, textCSS: "color:#6b1210;-webkit-text-stroke:1.5px #1a0000;paint-order:stroke fill;filter:drop-shadow(0 0 14px rgba(255,255,255,.85)) drop-shadow(0 0 4px rgba(255,255,255,.55)) drop-shadow(0 2px 2px rgba(0,0,0,.9));" };
}
// EX — Extreme; BRIGHT RED glow
function exTier(): Recipe {
  return { tileBg: red, textCSS: "color:#6b1210;-webkit-text-stroke:1.2px #2c0604;paint-order:stroke fill;filter:drop-shadow(0 0 18px rgba(255,23,68,1.0)) drop-shadow(0 0 7px rgba(255,60,40,.8)) drop-shadow(0 2px 2px rgba(0,0,0,.8));" };
}
// DX — Deluxe; DARK RED / near-black glow
function dxTier(): Recipe {
  return { tileBg: voidBg, textCSS: "color:#3a0806;-webkit-text-stroke:1.2px #0d0000;paint-order:stroke fill;filter:drop-shadow(0 0 20px rgba(80,0,0,.95)) drop-shadow(0 0 8px rgba(20,0,0,.9)) drop-shadow(0 2px 2px rgba(0,0,0,1.0));" };
}
function fill(g: string, stroke: string, tileBg = blue): Recipe {
  return { tileBg, textCSS: `background:${g};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;-webkit-text-stroke:2.4px ${stroke};paint-order:stroke fill;filter:drop-shadow(0 2px 1px rgba(8,24,44,.5));` };
}
function plain(g: string, stroke: string, tileBg = blue): Recipe {
  return { tileBg, textCSS: `background:${g};-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;-webkit-text-stroke:2.2px ${stroke};paint-order:stroke fill;filter:drop-shadow(0 2px 1px rgba(8,24,44,.45));` };
}
function ored(): Recipe {
  return { tileBg: holo, textCSS: "background:linear-gradient(180deg,#ff7a64 0%,#e8331f 55%,#b01a0c 100%);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;-webkit-text-stroke:2.6px #c8d6e0;paint-order:stroke fill;filter:drop-shadow(0 2px 1px rgba(120,10,0,.55)) drop-shadow(0 0 7px rgba(255,90,60,.5));" };
}
// Immeasurable — the apex; transcendent white text with a heavy white halo on the void.
function immeasurable(): Recipe {
  return { tileBg: voidBg, textCSS: "background:linear-gradient(180deg,#ffffff,#e2f1ff 55%,#ffffff);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent;-webkit-text-stroke:1.3px rgba(186,214,238,.9);paint-order:stroke fill;filter:drop-shadow(0 0 18px rgba(255,255,255,.95)) drop-shadow(0 0 8px rgba(255,255,255,.7)) drop-shadow(0 2px 2px rgba(0,0,0,.55));" };
}
// C-tier green — shared by C and C+ (same green family per the grade spec).
const cTier: Recipe = { tileBg: darkc, textCSS: "color:#143548;-webkit-text-stroke:2.8px #8be23a;paint-order:stroke fill;filter:drop-shadow(0 0 8px rgba(140,226,58,.75));" };

// ponytail: eager map — 29 static entries, no perf concern
const RECIPES: Record<GradeId, Recipe> = {
  "MR":  chrome("linear-gradient(180deg,#ffd2ee 0%,#ff63bf 42%,#b21f8e 60%,#ff8ad4 100%)","rgba(255,90,200,.8)"),
  "MR+": chrome("linear-gradient(180deg,#f4ccff 0%,#c45cff 42%,#7a1fb0 60%,#cf8aff 100%)","rgba(185,95,255,.8)"),
  "UR":  chrome("linear-gradient(180deg,#d2dcff 0%,#5f7bff 42%,#2f33ab 60%,#8aa4ff 100%)","rgba(110,130,255,.8)"),
  "UR+": chrome("linear-gradient(180deg,#ddccff 0%,#8a5cff 42%,#4a1fab 60%,#aa8aff 100%)","rgba(150,100,255,.8)"),
  "SSR": chrome("linear-gradient(180deg,#ffcce2 0%,#ff4f9c 48%,#c01f6a 64%,#ff7fb6 100%)","rgba(255,80,150,.8)"),
  "SSR+":chrome("linear-gradient(180deg,#ffd2ec 0%,#ff5fb6 46%,#c5249a 62%,#ff8ad6 100%)","rgba(255,95,182,.8)"),
  "SR":  gold(), "SR+": gold(),
  "A+":  fill(orange, "#173766"), "A": fill(orange, "#173766"),
  "S+":  fill(redG, navyStroke), "S": fill(blueG, "#101c33"),
  "SS":  fill(redG, navyStroke), "SS+": fill(redG, navyStroke),
  "SS-": fill(redG, navyStroke), "S-": fill(redG, navyStroke),
  "SSS": fill(redG, navyStroke), "SSS-": fill(redG, navyStroke), "SSS+": fill(redG, navyStroke),
  "B":   fill(cyanG, "#0d3a4a", teal),
  "B+":  fill(blueG, "#0d3a4a", teal),
  "C":   cTier,
  "C+":  cTier,
  "X": xTier(), "XX": xTier(), "XXX": xTier(), "EX": exTier(), "DX": dxTier(),
  "F":   plain("linear-gradient(180deg,#ffffff,#cfdae7 60%,#9fb2c4)", "#46596d"),
  "E":   plain("linear-gradient(180deg,#f4f9ff,#c4d2e0 60%,#90a3b6)", "#41556a"),
  "D":   plain("linear-gradient(180deg,#fff4d8,#ecd9a8 60%,#c0a268)", "#6b4f1e", navyD),
  "LR":  ored(), "LR+": ored(),
  "Immeasurable": immeasurable(),
};

/** The tile background CSS for a grade (for rank-card displays that render the full tile). */
export function gradeTileBg(grade: GradeId): string {
  return (RECIPES[grade] ?? RECIPES["S"]).tileBg;
}

function fontSize(label: string, size: number): number {
  const len = label.length;
  const mult = len <= 1 ? 0.60 : len === 2 ? 0.42 : len === 3 ? 0.305 : 0.235;
  return Math.round(size * mult);
}

interface GradeBadgeProps {
  grade: GradeId;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export function GradeBadge({ grade, size = 96, className, style }: GradeBadgeProps) {
  const r = RECIPES[grade] ?? RECIPES["S"];
  const fs = fontSize(grade, size);
  const ref = useRef<HTMLSpanElement>(null);

  // Apply via cssText — paint-order and -webkit-text-fill-color need to bypass React's style prop.
  // Grade is a typed union; no XSS risk.
  useLayoutEffect(() => {
    if (ref.current) {
      ref.current.style.cssText =
        `display:block;font-family:var(--font-black-han-sans),sans-serif;` +
        `line-height:1.18;padding-top:.08em;letter-spacing:.005em;font-size:${fs}px;${r.textCSS}`;
    }
  }, [fs, r.textCSS]);

  return (
    <div
      className={className}
      style={{
        width: size, height: size,
        flexShrink: 0,
        display: "flex", alignItems: "center", justifyContent: "center",
        background: "transparent",
        ...style,
      }}
    >
      <span ref={ref}>{grade}</span>
    </div>
  );
}
