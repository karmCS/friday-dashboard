/**
 * Cloudflare Turnstile ("I'm not a robot") server-side verification.
 *
 * Posts the widget token to Cloudflare's siteverify endpoint. With no `TURNSTILE_SECRET_KEY`
 * configured it falls back to Cloudflare's official ALWAYS-PASS test secret so login works out of
 * the box — but that means NO real bot protection until you set a production secret. The password
 * check (credentials.ts) is always enforced regardless.
 */

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/** Cloudflare dummy keys — the test secret always passes; the test site key always shows a pass widget. */
export const TURNSTILE_TEST_SECRET = "1x0000000000000000000000000000000AA";
export const TURNSTILE_TEST_SITE_KEY = "1x00000000000000000000AA";

/** The public site key for the client widget (test key when unset — see note above). */
export function turnstileSiteKey(): string {
  return process.env.TURNSTILE_SITE_KEY || TURNSTILE_TEST_SITE_KEY;
}

/** True when Cloudflare confirms the token is from a real human. Fails closed on any error. */
export async function verifyTurnstile(token: string | null | undefined, ip: string | null): Promise<boolean> {
  if (!token) return false;

  const configured = process.env.TURNSTILE_SECRET_KEY;
  // In production the always-pass TEST secret must never silently disable bot protection — fail
  // closed (no login) until a real secret is set. The test fallback is for local dev only.
  if (!configured && process.env.NODE_ENV === "production") return false;
  const secret = configured || TURNSTILE_TEST_SECRET;

  try {
    const form = new URLSearchParams();
    form.set("secret", secret);
    form.set("response", token);
    if (ip) form.set("remoteip", ip);

    const res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: form,
    });
    if (!res.ok) return false;
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
