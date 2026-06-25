/**
 * SQLite singleton for the Friday Dashboard's personal-tracker data (fitness + tacos).
 *
 * Single-user, low-write; lives on a Docker volume at `/data/friday.db` so it survives
 * container restarts. The DB is opened lazily on first `getDb()` call, and the schema is
 * created idempotently (`CREATE TABLE IF NOT EXISTS`) at that point.
 *
 * Tables:
 *   Fitness — workout_calendar (general weekly workout labels, typed lift/cardio/rest),
 *             cardio_sessions (Strava), bodyweight_log, steps_log
 *   Personal logs — tacos, cafes
 *
 * Retired 2026-06-24 (pivot to calendar-based fitness): the granular set-logging tables
 * (exercises, workout_templates, template_exercises, workout_sessions, workout_sets) are no
 * longer created. Any rows in an existing DB are left in place but unused.
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
-- Weekly workout calendar: one row per logged workout day. Stores a GENERAL label
-- ("Upper Body", "Stationary Bike") + a coarse type, not individual exercises/sets.
-- Multiple entries per date are allowed (e.g. a lift + a cardio on the same day).
CREATE TABLE IF NOT EXISTS workout_calendar (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  date       TEXT NOT NULL,                                    -- YYYY-MM-DD
  label      TEXT NOT NULL,                                    -- free-text, e.g. "Full Body"
  type       TEXT NOT NULL CHECK (type IN ('lift', 'cardio', 'rest')),
  notes      TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_workout_calendar_date ON workout_calendar(date);

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

-- Questism BODY-stat streak tracker (one row, stat='body'). The weekly tick advances
-- streak_weeks on consecutive S-weeks; last_s_week guards against double-counting a week.
-- BUILDER/SYSTEM/TOTAL are computed live from upstream signals and need no persistence.
CREATE TABLE IF NOT EXISTS grade_streaks (
  stat         TEXT PRIMARY KEY,                                 -- 'body'
  streak_weeks INTEGER NOT NULL DEFAULT 0,
  last_s_week  TEXT,                                             -- ISO week, e.g. '2026-W26'
  updated_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Cafe Tracker: personal cafe log. Same shape as tacos; 'order_item' is the drink/item
-- ordered (the cafe analogue of taco_type). 'order' would collide with the SQL keyword.
CREATE TABLE IF NOT EXISTS cafes (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  place      TEXT NOT NULL,
  city       TEXT NOT NULL,
  state      TEXT NOT NULL,
  order_item TEXT NOT NULL,
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
