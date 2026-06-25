"use client";

/**
 * Login card — email + password + a Cloudflare Turnstile ("I'm not a robot") widget. Submits JSON
 * to /api/auth/login; on success the server sets the session cookie and we navigate to `next`.
 * Styled to the Questism HUD (dark frame, cyan accent, Black Han Sans wordmark) so the gate looks
 * like part of the product, not a bolted-on form.
 */

import { CSSProperties, useEffect, useRef, useState } from "react";
import Script from "next/script";
import { t, tabularNum, buttonReset } from "@/components/dashboard/tokens";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

const field: CSSProperties = {
  width: "100%",
  fontFamily: t.font.body,
  fontSize: 15,
  color: t.text,
  background: "#0b1620",
  border: "none",
  boxShadow: "inset 0 0 0 1px rgba(120,150,170,.28)",
  borderRadius: 9,
  padding: "13px 15px",
};

const label: CSSProperties = {
  fontFamily: t.font.body,
  fontWeight: 700,
  fontSize: 9.5,
  letterSpacing: ".12em",
  color: t.textMuted,
  marginBottom: 6,
  display: "block",
};

declare global {
  interface Window {
    __fridayTurnstile?: (token: string) => void;
    __fridayTurnstileExpired?: () => void;
  }
}

export function LoginForm({ siteKey, next }: { siteKey: string; next: string }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Turnstile (implicit render) calls these globals on solve / expiry.
  useEffect(() => {
    window.__fridayTurnstile = (tok: string) => setToken(tok);
    window.__fridayTurnstileExpired = () => setToken(null);
    return () => {
      delete window.__fridayTurnstile;
      delete window.__fridayTurnstileExpired;
    };
  }, []);

  async function onSubmit(e: React.FormEvent): Promise<void> {
    e.preventDefault();
    if (busy) return;
    setError(null);

    if (!token) {
      setError("Complete the “I'm not a robot” check first.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password, turnstileToken: token }),
      });
      if (res.ok) {
        // Full navigation so the new session cookie is picked up by the middleware.
        window.location.assign(next || "/");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setError(data.message || "Sign-in failed.");
      // Reset the (single-use) Turnstile token so the operator re-solves before retrying.
      setToken(null);
      try {
        (window as unknown as { turnstile?: { reset: () => void } }).turnstile?.reset();
      } catch {
        /* widget may not be ready; ignore */
      }
    } catch {
      setError("Network error — try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Script src={TURNSTILE_SCRIPT} strategy="afterInteractive" />
      <form
        onSubmit={onSubmit}
        style={{
          width: "100%",
          maxWidth: 380,
          background: "linear-gradient(165deg,#0e1f2c,#0a1019)",
          boxShadow: `inset 0 0 0 2px ${t.frame}, 0 24px 70px rgba(0,0,0,.55)`,
          clipPath: t.clipCard,
          padding: "34px 32px 30px",
        }}
      >
        {/* wordmark */}
        <div style={{ marginBottom: 26 }}>
          <div style={{ fontFamily: t.font.display, fontSize: 40, lineHeight: 1, color: t.text, letterSpacing: ".04em", textShadow: "0 0 22px rgba(120,210,245,.5)" }}>
            FRIDAY
          </div>
          <div style={{ fontFamily: t.font.mono, fontSize: 10.5, letterSpacing: ".18em", color: t.textDim, marginTop: 7 }}>
            STATUS WINDOW · SIGN IN
          </div>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label htmlFor="email" style={label}>
            EMAIL
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoFocus
            style={field}
          />
        </div>

        <div style={{ marginBottom: 18 }}>
          <label htmlFor="password" style={label}>
            PASSWORD
          </label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={field}
          />
        </div>

        {/* Turnstile widget (implicit render via the data-attrs) */}
        <div
          ref={widgetRef}
          className="cf-turnstile"
          data-sitekey={siteKey}
          data-callback="__fridayTurnstile"
          data-expired-callback="__fridayTurnstileExpired"
          data-theme="dark"
          style={{ minHeight: 65, marginBottom: 18 }}
        />

        {error ? (
          <div role="alert" style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 12.5, color: t.down, marginBottom: 14, lineHeight: 1.4 }}>
            {error}
          </div>
        ) : null}

        <button
          type="submit"
          disabled={busy}
          className="fr-pressable"
          style={{
            ...buttonReset,
            width: "100%",
            fontFamily: t.font.display,
            fontSize: 17,
            letterSpacing: ".06em",
            color: "#04101a",
            background: busy ? "#3f8294" : "linear-gradient(90deg,#7fe3ff,#46b8ff)",
            boxShadow: busy ? "none" : `0 0 18px ${t.glow}`,
            clipPath: t.clipCta,
            padding: "14px 0",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.8 : 1,
            ...tabularNum,
          }}
        >
          {busy ? "SIGNING IN…" : "SIGN IN"}
        </button>
      </form>
    </>
  );
}
