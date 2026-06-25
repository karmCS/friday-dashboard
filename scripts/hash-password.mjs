#!/usr/bin/env node
/**
 * Generate AUTH_PASSWORD_HASH for the Friday dashboard login.
 *
 *   node scripts/hash-password.mjs 'your-password'   # one-shot
 *   node scripts/hash-password.mjs                   # prompts
 *
 * Prints the `AUTH_PASSWORD_HASH=...` line to paste into your .env. The scrypt params here MUST
 * match src/lib/credentials.ts.
 */
import { scryptSync, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 32;

function hash(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, KEYLEN, { N, r: R, p: P });
  // `:` separator (not `$`) — Next.js dotenv-expand would mangle `$...` segments in .env.
  return `scrypt:${salt.toString("hex")}:${key.toString("hex")}`;
}

async function prompt() {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question("Password: ", (answer) => { rl.close(); resolve(answer); }));
}

const password = process.argv[2] || (await prompt());
if (!password || password.length < 8) {
  console.error("Password must be at least 8 characters.");
  process.exit(1);
}

console.log("\nPaste this into your .env (on VM1):\n");
console.log(`AUTH_PASSWORD_HASH=${hash(password)}\n`);
