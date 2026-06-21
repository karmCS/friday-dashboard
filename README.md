# Friday Dashboard

A self-hosted, single-pane analytics command center for the **Friday homelab**. It unifies
behavior, revenue, stability, traffic, infra health, and personal tracking across Mark's
products — [Deficit](https://getdeficit.com) (app + landing), our-footage.com, and
markcalip.com (portfolio) — into one place, and exposes a stable structured snapshot so
**Claude Code** can read real numbers when planning analytics or marketing.

This repo is the **Next.js 15 (App Router) backend**. The frontend is built separately.

> ⚠️ **Public repo — strict secrets discipline.** This app holds API keys (PostHog,
> RevenueCat, Sentry, Supabase), the Cloudflare Access service token, and DB credentials.
> **None of those may ever be committed.** `.env` is gitignored from the first commit; only
> `.env.example` (names, no values) is tracked. Real values live in the VM1 `.env`, mirrored
> to Vaultwarden. Athlete PII never enters this repo — it stays in Supabase and is read live.

## What it does

- **Reads** product analytics from existing sources (Umami, Uptime Kuma, Beszel, Supabase,
  PostHog, Sentry) server-side — no data-source key ever reaches the browser.
- **Owns** the personal-tracker data (fitness + tacos) in a local SQLite file at
  `/data/friday.db` on a Docker volume; photos in `/data/photos/`.
- Serves `GET /api/snapshot` — one token-gated route that aggregates every source into a
  stable, non-PII JSON shape. A daily cron renders it to wiki markdown for headless CC reads.

## Architecture

- **Framework:** Next.js 15 App Router + TypeScript, code under `src/`.
- **Personal storage:** `better-sqlite3` → `/data/friday.db` (single-user, low-write).
- **App data:** Supabase (`service_role`), PostHog, Sentry read tokens.
- **Auth:** Cloudflare Access (Zero Trust) in front of `friday.markcalip.com`, locked to
  Mark. `/api/snapshot` is exempt and gated by a bearer `SNAPSHOT_TOKEN`; the steps bridge
  is gated by `STEPS_TOKEN`.
- **Deploy:** container on VM1 via docker-compose, behind Caddy (LAN) + `cloudflared`.

## Environment

Copy `.env.example` to `.env` and fill in real values **on VM1 only**. Every secret name:

| Var | Purpose |
|---|---|
| `UMAMI_BASE_URL`, `UMAMI_API_KEY` | Web analytics (3 sites) |
| `KUMA_BASE_URL`, `KUMA_TOKEN` | Uptime status |
| `BESZEL_BASE_URL`, `BESZEL_TOKEN` | Host/container metrics |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Deficit users / engagement / revenue / journal |
| `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`, `POSTHOG_PERSONAL_API_KEY` | Deficit funnel |
| `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` | Deficit crash-free % + issues |
| `REVENUECAT_SECRET_KEY` | Live MRR (optional; RC webhooks also land in Supabase) |
| `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`, `STRAVA_REFRESH_TOKEN` | Cardio sync |
| `SNAPSHOT_TOKEN` | Bearer for headless `/api/snapshot` fetch |
| `STEPS_TOKEN` | Bearer for the iOS Shortcut steps bridge |

## Run

### Local development

```bash
npm install
npm run dev          # http://localhost:3000
```

The SQLite DB is created automatically at `/data/friday.db` on first DB access (tables via
`CREATE TABLE IF NOT EXISTS`). Locally, ensure a writable `/data` path or adjust the mount.

### Type-check

```bash
npm run typecheck
```

### Production (VM1, Docker)

```bash
cp .env.example .env   # then fill in real values (never commit .env)
docker compose up -d --build
```

The container exposes port `3000` and mounts `./data` → `/data` for the SQLite DB + photos.

## Layout

```
src/
  lib/
    types.ts          # the full /api/snapshot schema (Snapshot + sub-types) + fitness key
    db.ts             # better-sqlite3 singleton getDb() + CREATE TABLE IF NOT EXISTS
    auth.ts           # requireBearer(request, envName) bearer-token gate
    clients/
      types.ts        # interfaces each data client implements (SiteStats, InfraStatus, ...)
```
