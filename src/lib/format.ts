/**
 * Shared display formatters. Centralized so every section renders numbers and timestamps
 * the same way (consistent thousands separators, one clock format) instead of each file
 * re-deriving `toLocaleString` / `new Date(...)` inline.
 */

/** Thousands-separated integer string. `1234` → "1,234". Non-finite → "—". */
export function fmtNum(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US");
}

/** Percent with a trailing `%`, or "—" for null. */
export function fmtPct(n: number | null | undefined): string {
  return n === null || n === undefined ? "—" : `${n}%`;
}

/** "09:14 AM" from an ISO timestamp (viewer-local). "—" if unparseable. */
export function fmtClock(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

/** "YYYY.MM.DD // HH:MM:SS" sync stamp (viewer-local). Falls back to the raw string. */
export function formatSync(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} // ${p(d.getHours())}:${p(
    d.getMinutes(),
  )}:${p(d.getSeconds())}`;
}

/** Current age given a birth date (month is 1-based). Rolls over on the birthday. */
export function calcAge(birthYear: number, birthMonth: number, birthDay: number): number {
  const now = new Date();
  let age = now.getFullYear() - birthYear;
  const hasBirthdayPassed =
    now.getMonth() + 1 > birthMonth ||
    (now.getMonth() + 1 === birthMonth && now.getDate() >= birthDay);
  if (!hasBirthdayPassed) age--;
  return age;
}

/** Minutes elapsed since an ISO timestamp (for staleness checks). null if unparseable. */
export function minutesSince(iso: string): number | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return Math.floor((Date.now() - d.getTime()) / 60000);
}
