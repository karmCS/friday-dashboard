/**
 * Beszel client → host resource metrics ({@link HostMetrics}).
 *
 * Beszel's hub is a PocketBase app; its REST API exposes collections under
 * `{BESZEL_BASE_URL}/api/collections/...`. The latest per-system stats live in the
 * `system_stats` collection (records carry a `stats` JSON blob with cpu / memory / disk
 * percentages); the systems themselves live in the `systems` collection (each `info` blob
 * also carries `cpu` / `mp` (memory %) / `dp` (disk %)).
 *
 * This reads the most-recently-updated `systems` record and pulls cpu/mem/disk percentages
 * from its `info` blob — the cheapest single call for the Overview infra card. Auth is a
 * PocketBase auth token passed as the `Authorization` header.
 *
 * Server-side only — `BESZEL_TOKEN` must never reach the browser. Fail-soft: any error
 * resolves to all-null metrics so the aggregator never throws.
 */

// Server-only: this module reads BESZEL_TOKEN from process.env and must never be imported
// into a client bundle. (No `server-only` package dep in this skeleton; wrap with
// `import "server-only"` if that dep is added.)

import type { BeszelClient, HostMetrics } from "@/lib/clients/types";

const FETCH_TIMEOUT_MS = 8000;

/** All-unknown metrics, used on any config/network/parse failure. */
const UNKNOWN_METRICS: HostMetrics = { cpu_pct: null, mem_pct: null, disk_pct: null };

function getConfig(): { baseUrl: string; token: string | null } | null {
  const baseUrl = process.env.BESZEL_BASE_URL;
  if (!baseUrl) return null;
  return {
    baseUrl: baseUrl.replace(/\/+$/, ""),
    token: process.env.BESZEL_TOKEN ?? null,
  };
}

/** Beszel system `info` blob — short keys: cpu %, memory % (`mp`), disk % (`dp`). */
interface BeszelSystemInfo {
  cpu?: number;
  mp?: number;
  dp?: number;
}

interface BeszelSystemRecord {
  id: string;
  name?: string;
  updated?: string;
  info?: BeszelSystemInfo;
}

interface BeszelListResponse {
  items?: BeszelSystemRecord[];
}

/** Clamp a raw percentage to 0–100, or null when not a finite number. */
function pct(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

/** Beszel client backed by the hub's PocketBase REST API. */
export const beszelClient: BeszelClient = {
  async getHostMetrics(): Promise<HostMetrics> {
    const config = getConfig();
    if (!config) return UNKNOWN_METRICS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const headers: Record<string, string> = { accept: "application/json" };
      if (config.token) {
        headers.authorization = config.token;
      }

      // Newest system record first; one page is enough for the single-host homelab.
      const url =
        `${config.baseUrl}/api/collections/systems/records` +
        `?sort=-updated&perPage=1`;
      const res = await fetch(url, {
        headers,
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) {
        return UNKNOWN_METRICS;
      }

      const body = (await res.json()) as BeszelListResponse;
      const record = body.items?.[0];
      const info = record?.info;
      if (!info) {
        return UNKNOWN_METRICS;
      }

      return {
        cpu_pct: pct(info.cpu),
        mem_pct: pct(info.mp),
        disk_pct: pct(info.dp),
      };
    } catch {
      return UNKNOWN_METRICS;
    } finally {
      clearTimeout(timer);
    }
  },
};

export default beszelClient;
