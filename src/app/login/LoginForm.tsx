"use client";

/**
 * Login card — Questism "Dashboard Access" design (imported from the Claude Design project
 * "Friday Sign In"): diamond brand mark, grid backdrop, `// AUTHENTICATE`, SHOW/HIDE password,
 * and a submit that flips VERIFY TO CONTINUE → ENTER FRIDAY once the human check passes.
 *
 * The design's checkbox is a mock; here the REAL Cloudflare Turnstile widget sits in that slot
 * (its token is what the server verifies). Submits JSON to /api/auth/login; on success the
 * server sets the session cookie and we navigate to `next`.
 */

import { CSSProperties, useEffect, useState } from "react";
import Script from "next/script";
import { t } from "@/components/dashboard/tokens";

const TURNSTILE_SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js";

const labelMono: CSSProperties = {
  display: "block",
  fontFamily: t.font.mono,
  fontSize: 10,
  letterSpacing: ".14em",
  color: "#6fa8cc",
  marginBottom: 7,
};

const fieldInput: CSSProperties = {
  width: "100%",
  background: "rgba(5,14,22,.7)",
  border: "1px solid rgba(150,212,236,.2)",
  borderRadius: 8,
  padding: "13px 14px",
  fontFamily: t.font.body,
  fontSize: 15,
  color: "#eafaff",
  outline: "none",
  transition: "border-color .15s, box-shadow .15s",
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
  const [show, setShow] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Complete the human check first.");
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
        window.location.assign(next || "/");
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      setError(data.message || "Sign-in failed.");
      setToken(null); // single-use token — make the operator re-solve before retry
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

  const ready = token !== null;
  const submitLabel = busy ? "SIGNING IN…" : ready ? "ENTER FRIDAY" : "VERIFY TO CONTINUE";

  return (
    <>
      <Script src={TURNSTILE_SCRIPT} strategy="afterInteractive" />
      <style>{`
        .fr-login-input::placeholder{color:#43748f;}
        .fr-login-input:focus{border-color:#7fe3ff;box-shadow:0 0 0 3px rgba(127,227,255,.15);}
        .fr-login-submit:hover{transform:translateY(-1px);}
      `}</style>

      <div style={{ position: "relative", width: "100%", maxWidth: 420 }}>
        {/* brand */}
        <div style={{ display: "flex", alignItems: "center", gap: 13, justifyContent: "center", marginBottom: 28 }}>
          <div
            aria-hidden
            style={{
              width: 40,
              height: 40,
              background: "linear-gradient(135deg,#7fe3ff,#2b8bff)",
              transform: "rotate(45deg)",
              borderRadius: 9,
              boxShadow: "inset 0 0 0 2px rgba(255,255,255,.7),0 0 18px rgba(90,200,255,.6)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <span style={{ transform: "rotate(-45deg)", fontFamily: t.font.display, fontSize: 21, color: "#0a2030" }}>!</span>
          </div>
          <div>
            <div style={{ fontFamily: t.font.display, fontSize: 25, color: "#eafaff", letterSpacing: ".02em", lineHeight: 0.9, textShadow: "0 0 14px rgba(120,210,245,.5)" }}>
              FRIDAY
            </div>
            <div style={{ fontFamily: t.font.mono, fontSize: 9.5, color: "#5fb8e6", letterSpacing: ".2em", marginTop: 5 }}>
              DASHBOARD ACCESS
            </div>
          </div>
        </div>

        {/* card */}
        <form
          onSubmit={onSubmit}
          style={{
            background: "linear-gradient(160deg,#0e2b40,#07121d)",
            borderRadius: 12,
            boxShadow: "inset 0 0 0 1px rgba(150,212,236,.22),0 30px 60px -24px rgba(0,0,0,.8)",
            padding: "30px 30px 28px",
          }}
        >
          <div style={{ fontFamily: t.font.mono, fontSize: 10, letterSpacing: ".16em", color: "#5fb8e6", marginBottom: 5 }}>
            // AUTHENTICATE
          </div>
          <h1 style={{ fontFamily: t.font.body, fontWeight: 800, fontSize: 26, color: "#eafaff", margin: "0 0 22px", letterSpacing: ".01em" }}>
            Sign in to continue
          </h1>

          {/* email */}
          <label style={{ display: "block", marginBottom: 16 }}>
            <span style={labelMono}>EMAIL</span>
            <input
              className="fr-login-input"
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="hunter@friday.gg"
              required
              autoFocus
              style={fieldInput}
            />
          </label>

          {/* password */}
          <label style={{ display: "block", marginBottom: 20 }}>
            <span style={{ ...labelMono, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span>PASSWORD</span>
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                style={{ font: "inherit", background: "none", border: 0, padding: 0, cursor: "pointer", color: "#5fb8e6", letterSpacing: ".1em" }}
              >
                {show ? "HIDE" : "SHOW"}
              </button>
            </span>
            <input
              className="fr-login-input"
              type={show ? "text" : "password"}
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              required
              style={fieldInput}
            />
          </label>

          {/* real Cloudflare Turnstile widget (dark, to match the card) */}
          <div
            className="cf-turnstile"
            data-sitekey={siteKey}
            data-callback="__fridayTurnstile"
            data-expired-callback="__fridayTurnstileExpired"
            data-theme="dark"
            style={{ minHeight: 65, marginBottom: 22 }}
          />

          {error ? (
            <div role="alert" style={{ fontFamily: t.font.body, fontWeight: 700, fontSize: 12.5, color: "#ff9a8a", marginBottom: 16, lineHeight: 1.4 }}>
              {error}
            </div>
          ) : null}

          {/* submit */}
          <button
            type="submit"
            className="fr-login-submit"
            disabled={busy}
            style={{
              width: "100%",
              border: "none",
              cursor: busy ? "default" : "pointer",
              borderRadius: 8,
              padding: 14,
              fontFamily: t.font.body,
              fontWeight: 800,
              fontSize: 15,
              letterSpacing: ".04em",
              color: ready ? "#04161f" : "#8fc6e0",
              background: ready ? "linear-gradient(135deg,#7fe3ff,#2b8bff)" : "rgba(127,227,255,.1)",
              boxShadow: ready ? "0 0 22px rgba(90,200,255,.5)" : "inset 0 0 0 1px rgba(150,212,236,.25)",
              transition: "transform .12s, box-shadow .2s, background .2s, color .2s",
              opacity: busy ? 0.85 : 1,
            }}
          >
            {submitLabel}
          </button>
        </form>

        <div style={{ textAlign: "center", fontFamily: t.font.mono, fontSize: 9.5, letterSpacing: ".12em", color: "#3f6478", marginTop: 20 }}>
          SECURED CONNECTION
        </div>
      </div>
    </>
  );
}
