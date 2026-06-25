/**
 * Stateless signed session token for the dashboard login gate.
 *
 * Format: `<payloadB64Url>.<hmacB64Url>` where payload = `{ sub, exp }` (JSON) and the signature
 * is HMAC-SHA256(AUTH_SESSION_SECRET, payloadB64Url). No server-side session store — the cookie
 * IS the session; tampering breaks the HMAC and expiry is enforced from `exp`.
 *
 * Built on Web Crypto (`crypto.subtle`) ONLY, so it runs in the Edge middleware runtime as well
 * as Node route handlers. The password hashing (scrypt) lives in ./credentials.ts (Node-only) and
 * is never touched here.
 */

export const SESSION_COOKIE = "friday_session";
/** 7 days — a personal single-operator dashboard; re-login weekly. */
export const SESSION_TTL_SEC = 60 * 60 * 24 * 7;

const encoder = new TextEncoder();

function bytesToB64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function b64UrlToBytes(s: string): Uint8Array {
  const norm = s.replace(/-/g, "+").replace(/_/g, "/");
  const pad = norm.length % 4 === 0 ? "" : "=".repeat(4 - (norm.length % 4));
  const bin = atob(norm + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(data));
  return new Uint8Array(sig);
}

/** Length-constant string compare (avoids leaking the signature via timing). */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

/** Mint a signed session token for `sub` (the operator email), expiring in SESSION_TTL_SEC. */
export async function createSessionToken(sub: string, secret: string): Promise<string> {
  const payload = { sub, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC };
  const body = bytesToB64Url(encoder.encode(JSON.stringify(payload)));
  const sig = bytesToB64Url(await hmac(secret, body));
  return `${body}.${sig}`;
}

/** Verify a session token's signature + expiry. Returns `{ sub }` when valid, else null. */
export async function verifySessionToken(
  token: string | undefined,
  secret: string,
): Promise<{ sub: string } | null> {
  if (!token) return null;
  const dot = token.indexOf(".");
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expectedSig = bytesToB64Url(await hmac(secret, body));
  if (!timingSafeEqual(sig, expectedSig)) return null;

  try {
    const payload = JSON.parse(new TextDecoder().decode(b64UrlToBytes(body))) as unknown;
    if (typeof payload !== "object" || payload === null) return null;
    const { sub, exp } = payload as Record<string, unknown>;
    if (typeof sub !== "string" || sub === "") return null;
    if (typeof exp !== "number" || exp < Math.floor(Date.now() / 1000)) return null;
    return { sub };
  } catch {
    return null;
  }
}
