/**
 * /login — the gate's public face. Server component: reads the Turnstile site key from runtime
 * env and hands it (plus a sanitized post-login `next` path) to the client form. Everything else
 * on the host is redirected here by the middleware until a session cookie exists.
 */

import type { Metadata } from "next";
import { turnstileSiteKey } from "@/lib/turnstile";
import { LoginForm } from "./LoginForm";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Friday — Sign in",
  robots: { index: false, follow: false },
};

/** Only allow same-origin absolute paths as the post-login destination (open-redirect guard). */
function safeNext(value: unknown): string {
  const raw = typeof value === "string" ? value : "";
  return raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const sp = await searchParams;
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        background: "radial-gradient(140% 90% at 50% 0%,#11212e,#05090e 70%)",
      }}
    >
      <LoginForm siteKey={turnstileSiteKey()} next={safeNext(sp?.next)} />
    </main>
  );
}
