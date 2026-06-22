# Friday Dashboard — backend handoff

**Status: backend foundation is built and compiles clean** (`main`, Next.js 15 App Router, `tsc --noEmit` + `next build` green, no secrets committed). This doc is the kickoff for the next session: **connect the (separately built) frontend to these APIs and deploy.**

Read this top to bottom, then start integrating. The full product spec lives in the wiki:
`C:\Users\mark3\mark-wiki\wiki\projects\analytics-dashboard.md` (architecture, snapshot schema, Athlete Inspector, design prompt) and `…\fitness-tracker.md` (fitness model).

---

## 1. What's done vs. what's left

**Done**
- Project scaffold: Next.js 15 App Router + TS, Dockerfile, docker-compose (`env_file`, `/data` volume), strict `.gitignore`/`.env.example`, README.
- `GET /api/snapshot` — bearer-gated, `Promise.allSettled` over all sources (one failure → null, never crashes), `revalidate = 300`, **non-PII aggregates only**. Schema in `src/lib/types.ts` (`Snapshot`).
- Data clients (`src/lib/clients/`): `umami` + `supabase` are **wired to real data** (need keys in `.env`); `kuma` + `beszel` best-effort; `posthog` + `sentry` are **stubs returning null** (pending tokens).
- SQLite layer (`src/lib/db.ts`, `better-sqlite3`, `/data/friday.db`) with the full fitness + taco schema (`CREATE TABLE IF NOT EXISTS`).
- **Taco API: complete CRUD** (`GET`/`POST` list, `GET`/`PATCH`/`DELETE` by id, photo upload).
- **Fitness API: the write/ingest surface** (create sessions/sets/exercises/templates/bodyweight, the steps bridge, the Strava webhook stub).

**Left (the integration session's job)**
- ⚠ **Fitness READ endpoints are missing** — add these (the frontend needs them to render):
  - `GET /api/fitness/sessions` — list (newest-first; for history/kanban)
  - `GET /api/fitness/exercises?muscle_group=` — the exercise picker
  - `GET /api/fitness/templates` — template picker
  - `GET /api/fitness/bodyweight` — trend (+ 7d moving avg)
  - `GET /api/fitness/steps` — history (for the step chart)
  - `GET /api/fitness/cardio` — cardio session list (no cardio read route exists yet; only the webhook)
  - **Analytics queries** (shape them against the real chart components): RIR-compression, weekly volume by muscle group, rep drop-off, cardio HR trend. These are deliberately not pre-built — let the frontend's needs define their response shape.
- **Athlete Inspector** routes (Deficit drill-down) — not built yet. Server-side `service_role` reads of `admin_athlete_journal` + `food_logs`/`camps`/`weight_logs`, search by name/UUID. **PII — must be server-only, behind Access, never in the snapshot.** Spec: analytics-dashboard.md → "Athlete Inspector".
- Wire `posthog` + `sentry` clients once tokens exist (currently stubbed).
- Frontend integration + deploy (below).

---

## 2. API map (current)

| Method(s) | Route | Auth |
|---|---|---|
| `GET` | `/api/snapshot` | Bearer `SNAPSHOT_TOKEN` |
| `POST` | `/api/fitness/sessions` | Access |
| `GET`/`PATCH`/`DELETE` | `/api/fitness/sessions/[id]` | Access |
| `POST` | `/api/fitness/sets` | Access |
| `POST` | `/api/fitness/exercises` | Access |
| `POST` | `/api/fitness/templates` | Access |
| `POST` | `/api/fitness/bodyweight` | Access |
| `POST` | `/api/fitness/steps` | Bearer `STEPS_TOKEN` (iOS Shortcut) |
| `POST` | `/api/fitness/cardio/strava-webhook` | Strava (stub) |
| `GET`/`POST` | `/api/tacos` | Access |
| `GET`/`PATCH`/`DELETE` | `/api/tacos/[id]` | Access |
| `POST` | `/api/tacos/photo` | Access |

Shared helpers: `src/app/api/fitness/_lib/{http,validate}.ts`, `src/app/api/tacos/shared.ts`. Match these conventions when adding the read endpoints. ("Access" = Cloudflare Access gates the whole host; routes don't re-check.)

---

## 3. The snapshot contract

`src/lib/types.ts` → `Snapshot` is the **stable** shape for `GET /api/snapshot` (CC depends on the field names across sessions). Top-level keys: `as_of`, `deficit_app`, `deficit_landing`, `our_footage`, `portfolio`, `social`, `infra`, `fitness`. Nullable exactly where a metric isn't computable yet (e.g. `funnel.conversion_rate`, `health.crash_free_rate` are null until PostHog/Sentry are wired). **Never add PII fields to this type.**

The Overview UI should read this one endpoint; deep sections can call the more specific routes / server components directly.

---

## 4. Integration playbook (next session)

1. `cd C:\Users\mark3\projects\friday-dashboard && git pull`.
2. Drop the Claude-design frontend into `src/app/` (the nav shell + `Overview` + per-section pages: Deficit, Landing, Our Footage, Portfolio, Social, Infra, Fitness, Tacos). Components are React + Tailwind — add `tailwindcss` to deps if the design uses it (scaffold is API-only right now).
3. Wire data:
   - **Overview** → fetch `GET /api/snapshot` (with `SNAPSHOT_TOKEN`) or read the clients directly in a server component.
   - **Fitness/Tacos sections** → call the CRUD routes; **add the missing fitness GET reads first** (§1).
   - **Deficit → Athlete Inspector** → build the server-side `service_role` routes (§1), behind Access, never client-exposed.
4. Add `tsc`/build to CI if desired; keep `npm run typecheck` green.
5. Branch + PR per repo workflow (don't push straight to `main`).

---

## 5. Environment (3 tokens still needed)

Copy `.env.example` → `.env` **on VM1 only** (never commit). All 20 vars are listed there. Mark still needs to generate:
- **`POSTHOG_PERSONAL_API_KEY`** (+ `POSTHOG_HOST`, `POSTHOG_PROJECT_ID`) — funnel.
- **`SENTRY_AUTH_TOKEN`** (+ `SENTRY_ORG=deficit-iw`, `SENTRY_PROJECT=deficit`) — crash-free % + issues.
- **`SUPABASE_SERVICE_ROLE_KEY`** (+ `SUPABASE_URL`) — Deficit users/engagement/revenue/Inspector.

`UMAMI_*` / `KUMA_*` / `BESZEL_*` are self-hosted on VM1 (grab on the box). All real values → Vaultwarden as source of truth.

---

## 6. Deploy (VM1)

```bash
cp .env.example .env   # fill real values
docker compose up -d --build
```
Then: add a `cloudflared` ingress `friday.markcalip.com → localhost:3000` on VM1 (same `cloudflared` service as the portfolio + Umami), put **Cloudflare Access** in front locked to Mark's email, and exempt `/api/snapshot` with a service token. Optionally a Caddy `friday.friday.local` LAN alias.

Finally: the GitHub-Actions daily cron hitting `/api/snapshot` → wiki markdown (decided 2026-06-18; see analytics-dashboard.md).

---

## 7. Hard rules (don't break)

- **Public repo → no secret values committed, ever.** `.env` gitignored; `.env.example` is names-only.
- **Snapshot = non-PII aggregates only.** Athlete names/emails/free-text never enter `/api/snapshot` or the wiki markdown.
- **Inspector PII = server-side `service_role`, behind Access, read live.** Never ship `service_role` to the client.
