/**
 * Single-operator credential check (server/Node only — uses node:crypto scrypt).
 *
 * The one allowed identity is `AUTH_EMAIL` + `AUTH_PASSWORD_HASH`. The password is NEVER stored
 * in plaintext; `AUTH_PASSWORD_HASH` is a scrypt digest produced by `scripts/hash-password.mjs`,
 * stored as `scrypt:<saltHex>:<keyHex>`. Fails closed when either env var is unset.
 *
 * NOTE: the separator is `:` not `$` on purpose — Next.js runs dotenv-expand over `.env`, which
 * would treat `$...` segments as variable references and corrupt a `$`-delimited hash.
 */

import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";

// scrypt cost params — N must be a power of two. These are interactive-login defaults.
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

/** Produce a `scrypt:salt:key` string for a plaintext password (used by the hashing script). */
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

/** Constant-time verify of a plaintext password against a stored `scrypt:salt:key` digest. */
export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  let expected: Buffer;
  let salt: Buffer;
  try {
    salt = Buffer.from(parts[1], "hex");
    expected = Buffer.from(parts[2], "hex");
  } catch {
    return false;
  }
  if (expected.length === 0) return false;
  let derived: Buffer;
  try {
    derived = scryptSync(password, salt, expected.length, { N, r: R, p: P });
  } catch {
    return false;
  }
  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/**
 * True only when both the email matches `AUTH_EMAIL` (case-insensitive) AND the password matches
 * `AUTH_PASSWORD_HASH`. Both checks always run (no short-circuit) so a wrong email and a wrong
 * password are indistinguishable by timing, and the caller returns one generic error either way.
 */
export function verifyCredentials(email: string, password: string): boolean {
  const expectedEmail = process.env.AUTH_EMAIL;
  const hash = process.env.AUTH_PASSWORD_HASH;
  if (!expectedEmail || !hash) return false; // fail closed — unconfigured is not "open"

  const passOk = verifyPassword(password, hash);
  const emailOk = email.trim().toLowerCase() === expectedEmail.trim().toLowerCase();
  return emailOk && passOk;
}
