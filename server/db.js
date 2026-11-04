import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';

export const SCHEMA_VERSION = 2;

// All money is stored as integer cents; all share counts are integers.
const SCHEMA = `
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  host_token_hash TEXT NOT NULL,
  seed TEXT NOT NULL,
  phase TEXT NOT NULL DEFAULT 'lobby',   -- lobby|tutorial|intro|trading|locked|reveal|quiz|quizreview|results|final
  week INTEGER NOT NULL DEFAULT 0,        -- 0 before Week 1 starts, then 1..8
  join_locked INTEGER NOT NULL DEFAULT 0,
  quiz_enabled INTEGER NOT NULL DEFAULT 1,
  discussion INTEGER NOT NULL DEFAULT 0,
  next_seq INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS players (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  name_key TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  seq INTEGER NOT NULL,
  cash_cents INTEGER NOT NULL CHECK (cash_cents >= 0),
  realized_cents INTEGER NOT NULL DEFAULT 0,
  submitted_week INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  UNIQUE (room_id, name_key)
);
CREATE INDEX IF NOT EXISTS idx_players_token ON players(token_hash);

CREATE TABLE IF NOT EXISTS holdings (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  shares INTEGER NOT NULL CHECK (shares >= 0),
  cost_cents INTEGER NOT NULL CHECK (cost_cents >= 0),
  PRIMARY KEY (player_id, ticker)
);

CREATE TABLE IF NOT EXISTS trades (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('buy','sell')),
  qty INTEGER NOT NULL CHECK (qty > 0),
  price_cents INTEGER NOT NULL,
  total_cents INTEGER NOT NULL,
  realized_cents INTEGER NOT NULL DEFAULT 0,
  request_id TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (player_id, request_id)
);

-- Weeks -12..-1 are pre-game history, week 0 is the opening price, week n is the close after Week n's reveal.
CREATE TABLE IF NOT EXISTS market (
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  volume INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (room_id, week, ticker)
);

-- How each price move was produced (event contributions, expectations, noise). One row per room/week/ticker, ever.
CREATE TABLE IF NOT EXISTS reactions (
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  ticker TEXT NOT NULL,
  change_bp INTEGER NOT NULL,
  detail TEXT NOT NULL,
  PRIMARY KEY (room_id, week, ticker)
);

CREATE TABLE IF NOT EXISTS snapshots (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  cash_cents INTEGER NOT NULL,
  invested_cents INTEGER NOT NULL,
  net_cents INTEGER NOT NULL,
  rank INTEGER,
  PRIMARY KEY (player_id, week)
);

CREATE TABLE IF NOT EXISTS quiz_answers (
  player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  qid TEXT NOT NULL,
  choice INTEGER NOT NULL,      -- original option index (not the shuffled position)
  correct INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (player_id, week, qid)   -- one answer per question, ever: no resubmitting
);
`;

/** Thin wrapper so the rest of the code can use db.transaction(fn) like other SQLite libraries. */
function wrap(db) {
  db.transaction = (fn) => (...args) => {
    db.exec('BEGIN IMMEDIATE');
    try { const r = fn(...args); db.exec('COMMIT'); return r; }
    catch (e) { try { db.exec('ROLLBACK'); } catch { /* already rolled back */ } throw e; }
  };
  return db;
}

/**
 * Opens (and creates, if needed) the database. There is no separate migration step.
 * A database file from version 1 of the game has a different layout, so it is renamed to *.v1-backup and a fresh one is created.
 */
export function openDb(file = process.env.DB_FILE || './data/market-masters.db') {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  let db = wrap(new DatabaseSync(file));
  const version = db.prepare('PRAGMA user_version').get().user_version;
  const hasRooms = !!db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='rooms'").get();
  if (version < SCHEMA_VERSION && hasRooms && file !== ':memory:') {
    db.close();
    fs.renameSync(file, `${file}.v1-backup`);
    for (const ext of ['-wal', '-shm']) if (fs.existsSync(file + ext)) fs.rmSync(file + ext);
    db = wrap(new DatabaseSync(file));
  }
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  return db;
}
