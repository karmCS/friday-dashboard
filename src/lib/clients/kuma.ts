/**
 * Uptime Kuma client → the infra snapshot slice ({@link Infra}).
 *
 * Best-effort read of Uptime Kuma's Prometheus `/metrics` endpoint (text exposition format).
 * The relevant series is `monitor_status{monitor_name="…"}` where the value encodes state
 * (1 = up, 0 = down, 2 = pending, 3 = maintenance). We derive `all_up` + the list of `down`
 * monitor names from it.
 *
 * Server-side only — `KUMA_TOKEN` must never reach the browser. Kuma's `/metrics` is gated by
 * HTTP Basic auth with an empty username and the API token as the password.
 *
 * Fail-soft: any error resolves to an "unknown" infra status (`all_up: true`, no down list,
 * null last_deploy) so the aggregator never throws. Last-deploy data is not exposed by Kuma;
 * it stays null here (a future Vercel/GitHub webhook would populate it).
 */

// Server-only: this module reads KUMA_TOKEN from process.env and uses Node's Buffer; it must
// never be imported into a client bundle. (No `server-only` package dep in this skeleton; wrap
// with `import "server-only"` if that dep is added.)

import type { InfraStatus, KumaClient } from "@/lib/clients/types";

const FETCH_TIMEOUT_MS = 8000;

/** Kuma `monitor_status` values. */
const STATUS_UP = 1;

/** Unknown/unreachable infra status — treated as "no alert" rather than a false outage. */
const UNKNOWN_INFRA: InfraStatus = {
  all_up: true,
  down: [],
  last_deploy: { project: null, status: null, ago_hours: null },
};

function getConfig(): { baseUrl: string; token: string | null } | null {
  const baseUrl = process.env.KUMA_BASE_URL;
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token: process.env.KUMA_TOKEN ?? null,
  };
}

/**
 * Parses Prometheus text exposition, extracting `monitor_status` samples as
 * `{ name, value }`. Ignores comments (`# …`) and unrelated series.
 */
function parseMonitorStatus(text: string): Array<{ name: string; value: number }> {
  const out: Array<{ name: string; value: number }> = [];
  for (const rawLine of text.split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    if (!line.startsWith("monitor_status")) continue;

    // monitor_status{monitor_name="Portfolio",...} 1
    const nameMatch = line.match(/monitor_name="([^"]*)"/);
    const valueMatch = line.match(/\s([0-9.eE+-]+)\s*$/);
    if (!nameMatch || !valueMatch) continue;

    const value = Number(valueMatch[1]);
    if (Number.isNaN(value)) continue;
    out.push({ name: nameMatch[1], value });
  }
  return out;
}

/** Uptime Kuma client backed by the configured instance's `/metrics` endpoint. */
export const kumaClient: KumaClient = {
  async getInfraStatus(): Promise<InfraStatus> {
    const config = getConfig();
    if (!config) return UNKNOWN_INFRA;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { accept: "text/plain" };
      if (config.token) {
        // Kuma /metrics: HTTP Basic with empty user + token as password.
        const basic = Buffer.from(`:${config.token}`).toString("base64");
        headers.authorization = `Basic ${basic}`;
      }

      const res = await fetch(`${config.baseUrl}/metrics`, {
        headers,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        return UNKNOWN_INFRA;
      }

      const samples = parseMonitorStatus(await res.text());
      if (samples.length === 0) {
        return UNKNOWN_INFRA;
      }

      const down = samples
        .filter((sample) => sample.value !== STATUS_UP)
        .map((sample) => sample.name)
        .filter((name) => name.length > 0);

      return {
        all_up: down.length === 0,
        down,
        last_deploy: { project: null, status: null, ago_hours: null },
      };
    } catch {
      return UNKNOWN_INFRA;
    } finally {
      clearTimeout(timer);
    }
  },
};

export default kumaClient;
