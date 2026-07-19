const assert = require('node:assert/strict');
const Database = require('better-sqlite3');
const { runMigrations, SCHEMA_VERSION } = require('../electron/migrations.cjs');

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);
}

// ── Case 1: legacy DB (pre-migration schema, user_version 0) ──
const legacy = new Database(':memory:');
legacy.exec(`
  CREATE TABLE playlists (id TEXT PRIMARY KEY, profile_id TEXT NOT NULL, name TEXT NOT NULL);
  CREATE TABLE vod_streams (
    id INTEGER PRIMARY KEY AUTOINCREMENT, playlist_id TEXT NOT NULL, stream_id TEXT NOT NULL,
    name TEXT NOT NULL, stream_icon TEXT, category_id TEXT, group_title TEXT,
    rating REAL, added TEXT, container_extension TEXT
  );
  CREATE TABLE series (
    id INTEGER PRIMARY KEY AUTOINCREMENT, playlist_id TEXT NOT NULL, series_id TEXT NOT NULL,
    name TEXT NOT NULL, cover TEXT, plot TEXT, category_id TEXT, group_title TEXT,
    rating REAL, releaseDate TEXT
  );
`);
legacy.prepare(`INSERT INTO vod_streams (playlist_id, stream_id, name) VALUES ('p1', '42', 'Old Movie')`).run();

const r1 = runMigrations(legacy);
assert.equal(r1.from, 0);
assert.equal(r1.to, SCHEMA_VERSION);
assert.ok(columns(legacy, 'vod_streams').includes('stream_url'), 'stream_url column added');
assert.ok(columns(legacy, 'series_episodes').includes('series_key'), 'series_episodes table created');
// Existing Xtream row untouched, new column null.
const row = legacy.prepare(`SELECT * FROM vod_streams WHERE stream_id = '42'`).get();
assert.equal(row.name, 'Old Movie');
assert.equal(row.stream_url, null);

// ── Case 2: idempotent re-run ──
const r2 = runMigrations(legacy);
assert.equal(r2.from, SCHEMA_VERSION);
assert.equal(r2.to, SCHEMA_VERSION);

// ── Case 3: initDatabase(':memory:') applies fresh schema + migrations ──
const db = require('../electron/db.cjs');
const fresh = db.initDatabase(':memory:');
assert.ok(columns(fresh, 'vod_streams').includes('stream_url'));
assert.ok(columns(fresh, 'series_episodes').includes('stream_url'));
assert.equal(fresh.pragma('user_version', { simple: true }), SCHEMA_VERSION);

console.log('OK: migrations');
