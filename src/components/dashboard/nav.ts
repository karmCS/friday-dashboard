/** Section identity for the dashboard SPA — ported from the Claude Design state machine. */
export type SectionKey =
  | "overview"
  | "deficit"
  | "inspector"
  | "fitness"
  | "tacos"
  | "cafes"
  | "infra"
  | "landing"
  | "ourfootage"
  | "portfolio"
  | "social";

/** Nav rail order (Inspector is reached from inside Deficit, so it isn't a top-level row). */
export const NAV_ITEMS: ReadonlyArray<{ key: SectionKey; label: string }> = [
  { key: "overview", label: "OVERVIEW" },
  { key: "deficit", label: "DEFICIT" },
  { key: "landing", label: "LANDING" },
  { key: "ourfootage", label: "OUR FOOTAGE" },
  { key: "portfolio", label: "PORTFOLIO" },
  { key: "social", label: "SOCIAL" },
  { key: "infra", label: "INFRA" },
  { key: "fitness", label: "FITNESS" },
  { key: "tacos", label: "TACOS" },
  { key: "cafes", label: "CAFES" },
];

/** Top-bar title per section. */
export const SECTION_TITLES: Record<SectionKey, string> = {
  overview: "OVERVIEW",
  deficit: "DEFICIT",
  inspector: "ATHLETE INSPECTOR",
  fitness: "FITNESS",
  tacos: "TACOS",
  cafes: "CAFES",
  infra: "INFRA",
  landing: "LANDING",
  ourfootage: "OUR FOOTAGE",
  portfolio: "PORTFOLIO",
  social: "SOCIAL",
};
