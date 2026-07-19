// electron/migrations.cjs
// ─────────────────────────────────────────────────────────────────────────────
// Versioned, additive schema migrations, gated on PRAGMA user_version.
// Every step is defensive (checks actual state) so a fresh DB — whose
// SCHEMA_SQL already includes the final shape — migrates cleanly to the
// current version without duplicate-column errors.
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 2;

function columnExists(db, table, column) {
  return db.prepare(`PRAGMA table_info(${table})`).all().some((c) => c.name === column);
}

/**
 * Applies pending migrations. Safe to call on every startup.
 *
 * @param {import('better-sqlite3').Database} db
 * @returns {{ from: number, to: number }}
 */
function runMigrations(db) {
  const from = db.pragma('user_version', { simple: true });
  if (from >= SCHEMA_VERSION) return { from, to: from };

  const apply = db.transaction(() => {
    if (from < 1) {
      // v1 — M3U VOD/Series parity:
      //   • vod_streams.stream_url — direct URL for M3U rows (Xtream leaves
      //     it NULL and keeps reconstructing from stream_id + credentials).
      //   • series_episodes — structured episode rows for M3U series. Xtream
      //     never writes this table (it fetches episodes on demand).
      if (!columnExists(db, 'vod_streams', 'stream_url')) {
        db.exec(`ALTER TABLE vod_streams ADD COLUMN stream_url TEXT`);
      }
      db.exec(`
        CREATE TABLE IF NOT EXISTS series_episodes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          playlist_id TEXT NOT NULL,
          series_key TEXT NOT NULL,
          season INTEGER NOT NULL DEFAULT 1,
          episode INTEGER NOT NULL DEFAULT 0,
          name TEXT NOT NULL,
          title TEXT,
          stream_url TEXT NOT NULL,
          logo TEXT,
          group_title TEXT,
          FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
        );
        CREATE INDEX IF NOT EXISTS idx_series_episodes_playlist_series
          ON series_episodes(playlist_id, series_key);
        CREATE INDEX IF NOT EXISTS idx_series_episodes_playlist_group
          ON series_episodes(playlist_id, group_title);
      `);
    }
    if (from < 2) {
      // v2 — external metadata identity:
      //   • tvg_id on vod_streams + series — providers that key entries by an
      //     IMDb id (tvg-id="tt...") let us enrich posters/plots/genres from
      //     public metadata APIs. NULL for providers without stable ids.
      if (!columnExists(db, 'vod_streams', 'tvg_id')) {
        db.exec(`ALTER TABLE vod_streams ADD COLUMN tvg_id TEXT`);
      }
      if (!columnExists(db, 'series', 'tvg_id')) {
        db.exec(`ALTER TABLE series ADD COLUMN tvg_id TEXT`);
      }
    }
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  });
  apply();

  console.log(`[DB] Migrated schema from v${from} to v${SCHEMA_VERSION}.`);
  return { from, to: SCHEMA_VERSION };
}

module.exports = { runMigrations, SCHEMA_VERSION };
