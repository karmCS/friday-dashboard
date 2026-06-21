/**
 * SQLite singleton for the Friday Dashboard's personal-tracker data (fitness + tacos).
 *
 * Single-user, low-write; lives on a Docker volume at `/data/friday.db` so it survives
 * container restarts. The DB is opened lazily on first `getDb()` call, and the schema is
 * created idempotently (`CREATE TABLE IF NOT EXISTS`) at that point.
 *
 * Tables (fitness-tracker.md data model):
 *   exercises, workout_templates, template_exercises, workout_sessions, workout_sets,
 *   cardio_sessions, bodyweight_log, steps_log
 * Plus the Taco Tracker (analytics-dashboard.md):
 *   tacos
 */

import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

/** Absolute path to the SQLite file on the mounted Docker volume. */
const DB_PATH = process.env.FRIDAY_DB_PATH ?? "/data/friday.db";

let db: Database.Database | null = null;

/**
 * DDL for every table. `IF NOT EXISTS` everywhere so this is safe to run on every cold
 * start. Foreign keys are declared and enforced (PRAGMA foreign_keys = ON below).
 */
const SCHEMA = `
-- Exercise library, organized by muscle group.
CREATE TABLE IF NOT EXISTS exercises (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  name              TEXT NOT NULL,
  muscle_group      TEXT NOT NULL,
  secondary_muscles TEXT,
  equipment         TEXT
);

-- Named, reusable workout structures.
CREATE TABLE IF NOT EXISTS workout_templates (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ordered exercises belonging to a template, with a target set count.
CREATE TABLE IF NOT EXISTS template_exercises (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id  INTEGER NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
  exercise_id  INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  "order"      INTEGER NOT NULL,
  target_sets  INTEGER
);

-- A logged workout session (optionally started from a template).
CREATE TABLE IF NOT EXISTS workout_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  template_id INTEGER REFERENCES workout_templates(id) ON DELETE SET NULL,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at    TEXT,
  notes       TEXT
);

-- One row per set: reps + RIR tracked individually for per-set fatigue analysis.
CREATE TABLE IF NOT EXISTS workout_sets (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id  INTEGER NOT NULL REFERENCES workout_sessions(id) ON DELETE CASCADE,
  exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE CASCADE,
  set_number  INTEGER NOT NULL,
  reps        INTEGER NOT NULL,
  rir         INTEGER,
  logged_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cardio sessions, auto-synced from Strava or entered manually.
CREATE TABLE IF NOT EXISTS cardio_sessions (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  activity_type     TEXT NOT NULL,
  duration_min      REAL NOT NULL,
  avg_hr            INTEGER,
  distance_km       REAL,
  source            TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('strava', 'manual')),
  strava_activity_id TEXT UNIQUE,
  logged_at         TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Daily bodyweight entries (one per date).
CREATE TABLE IF NOT EXISTS bodyweight_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  date   TEXT NOT NULL UNIQUE,
  weight REAL NOT NULL,
  unit   TEXT NOT NULL DEFAULT 'lb'
);

-- Daily step counts, bridged from Apple Health via iOS Shortcut (one per date).
CREATE TABLE IF NOT EXISTS steps_log (
  id     INTEGER PRIMARY KEY AUTOINCREMENT,
  date   TEXT NOT NULL UNIQUE,
  count  INTEGER NOT NULL,
  source TEXT NOT NULL DEFAULT 'apple-health-shortcut'
);

-- Taco Tracker: personal taco log.
CREATE TABLE IF NOT EXISTS tacos (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  place      TEXT NOT NULL,
  city       TEXT NOT NULL,
  state      TEXT NOT NULL,
  taco_type  TEXT NOT NULL,
  rating     INTEGER CHECK (rating BETWEEN 1 AND 10),
  price_tier TEXT CHECK (price_tier IN ('$', '$$', '$$$')),
  notes      TEXT,
  photo_path TEXT,
  visited_at TEXT NOT NULL DEFAULT (date('now')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
`;

/**
 * Returns the shared, lazily-initialized SQLite connection. On first call it ensures the
 * parent directory exists, opens (or creates) the DB file, enables foreign keys + WAL,
 * and runs the idempotent schema.
 */
export function getDb(): Database.Database {
  if (db) return db;

  // Ensure the volume directory exists (e.g. /data) before opening the file.
  mkdirSync(dirname(DB_PATH), { recursive: true });

  const instance = new Database(DB_PATH);
  instance.pragma("journal_mode = WAL");
  instance.pragma("foreign_keys = ON");
  instance.exec(SCHEMA);

  db = instance;
  return db;
}
