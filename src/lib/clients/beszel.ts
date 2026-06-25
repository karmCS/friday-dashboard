/**
 * Beszel client → host resource metrics ({@link HostMetrics}).
 *
 * Beszel hub is PocketBase. Auth via POST /api/collections/users/auth-with-password →
 * JWT bearer token, cached in process memory and refreshed before expiry.
 *
 * Env vars: BESZEL_BASE_URL, BESZEL_USERNAME, BESZEL_PASSWORD
 * Server-side only — credentials must never reach the browser.
 */

import type { BeszelClient, HostMetrics } from "@/lib/clients/types";

const FETCH_TIMEOUT_MS = 8000;
const TOKEN_REFRESH_BUFFER_MS = 60 * 1000;

const UNKNOWN_METRICS: HostMetrics = { cpu_pct: null, mem_pct: null, disk_pct: null };

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

interface TokenCache {
  token: string;
  expiresAt: number;
}

let tokenCache: TokenCache | null = null;

function getConfig(): { baseUrl: string; username: string; password: string } | null {
  const baseUrl = process.env.BESZEL_BASE_URL;
  const username = process.env.BESZEL_USERNAME;
  const password = process.env.BESZEL_PASSWORD;
  if (!baseUrl || !username || !password) return null;
  return { baseUrl: baseUrl.replace(/\/+$/, ""), username, password };
}

async function login(baseUrl: string, username: string, password: string): Promise<TokenCache> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`${baseUrl}/api/collections/users/auth-with-password`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ identity: username, password }),
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Beszel login failed: ${res.status}`);
    const body = (await res.json()) as { token?: string };
    if (!body.token) throw new Error("Beszel login: no token in response");
    // PocketBase tokens are 7d by default; refresh after ~6d 23h.
    return { token: body.token, expiresAt: Date.now() + (7 * 24 - 1) * 60 * 60 * 1000 };
  } finally {
    clearTimeout(timer);
  }
}

async function getToken(baseUrl: string, username: string, password: string): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - Date.now() > TOKEN_REFRESH_BUFFER_MS) {
    return tokenCache.token;
  }
  tokenCache = await login(baseUrl, username, password);
  return tokenCache.token;
}

function pct(value: number | undefined): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10));
}

export const beszelClient: BeszelClient = {
  async getHostMetrics(): Promise<HostMetrics> {
    const config = getConfig();
    if (!config) return UNKNOWN_METRICS;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const token = await getToken(config.baseUrl, config.username, config.password);
      const url =
        `${config.baseUrl}/api/collections/systems/records` +
        `?sort=-updated&perPage=1`;
      const res = await fetch(url, {
        headers: { authorization: `Bearer ${token}`, accept: "application/json" },
        cache: "no-store",
        signal: controller.signal,
      });
      if (!res.ok) return UNKNOWN_METRICS;

      const body = (await res.json()) as BeszelListResponse;
      const info = body.items?.[0]?.info;
      if (!info) return UNKNOWN_METRICS;

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
