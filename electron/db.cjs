// electron/db.cjs
// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: Heavy-Duty SQLite Cache Layer
//
// Manages a local SQLite database for caching M3U/Xtream channel data,
// EPG programs, and multi-playlist metadata. Runs exclusively on the
// Electron Main Process — never touches the renderer thread.
//
// Performance characteristics:
//   - WAL journal mode for concurrent reads during writes
//   - Prepared statements cached for hot-path queries
//   - Chunked transactional inserts (500 channels / 1000 EPG per batch)
//   - PRAGMA tuning: synchronous=NORMAL, cache_size=10000, mmap_size=256MB
// ─────────────────────────────────────────────────────────────────────────────

const path = require('path');
const { app } = require('electron');

let db = null;

// ── Prepared Statement Cache ─────────────────────────────────────────────────
// Initialized lazily after DB open. Avoids re-compiling SQL on every call.
const stmts = {};

// ── Schema SQL ───────────────────────────────────────────────────────────────

const SCHEMA_SQL = `
  -- Playlists table: each playlist belongs to a user profile
  CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    profile_id TEXT NOT NULL,
    name TEXT NOT NULL,
    url TEXT,
    type TEXT NOT NULL DEFAULT 'm3u',
    username TEXT,
    password TEXT,
    server_url TEXT,
    last_updated INTEGER,
    active INTEGER DEFAULT 0
  );

  -- Channels table: foreign-keyed to playlists (CASCADE delete)
  CREATE TABLE IF NOT EXISTS channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    playlist_id TEXT NOT NULL,
    stream_id TEXT,
    name TEXT NOT NULL,
    logo TEXT,
    category_id TEXT,
    group_title TEXT,
    stream_url TEXT,
    tvg_id TEXT,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
  );

  -- EPG Programs table: keyed by channel_id (tvg_id or stream reference)
  CREATE TABLE IF NOT EXISTS epg_programs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER NOT NULL,
    title TEXT,
    description TEXT
  );

  -- ── Performance Indices ──────────────────────────────────────────────────
  CREATE INDEX IF NOT EXISTS idx_playlists_profile
    ON playlists(profile_id);

  CREATE INDEX IF NOT EXISTS idx_channels_playlist_category
    ON channels(playlist_id, category_id);

  CREATE INDEX IF NOT EXISTS idx_channels_playlist_group
    ON channels(playlist_id, group_title);

  CREATE INDEX IF NOT EXISTS idx_channels_tvg_id
    ON channels(tvg_id);

  CREATE INDEX IF NOT EXISTS idx_epg_channel_time
    ON epg_programs(channel_id, start_time, end_time);

  -- ── Phase 8: Favorites & Fast Search ─────────────────────────────────────
  CREATE TABLE IF NOT EXISTS favorites (
    playlist_id TEXT NOT NULL,
    channel_id INTEGER NOT NULL,
    PRIMARY KEY (playlist_id, channel_id),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE,
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_channels_name
    ON channels(name);
`;

// ── Database Initialization ──────────────────────────────────────────────────

/**
 * Opens (or creates) the SQLite database file and applies schema + PRAGMAs.
 * Must be called once during app.whenReady(), before any IPC handlers fire.
 *
 * @returns {import('better-sqlite3').Database} The database instance
 */
function initDatabase() {
  if (db) return db;

  const Database = require('better-sqlite3');
  const dbPath = path.join(app.getPath('userData'), 'matrix_iptv.db');

  console.log(`[DB] Opening SQLite database at: ${dbPath}`);

  db = new Database(dbPath, {
    // verbose: process.env.NODE_ENV === 'development' ? console.log : undefined,
  });

  // ── PRAGMA Tuning ──────────────────────────────────────────────────────
  // WAL mode: allows concurrent readers while writing
  db.pragma('journal_mode = WAL');
  // NORMAL sync is safe with WAL and significantly faster than FULL
  db.pragma('synchronous = NORMAL');
  // 10,000 pages × 4KB = ~40MB page cache
  db.pragma('cache_size = 10000');
  // Enable memory-mapped I/O (256MB) for read-heavy workloads
  db.pragma('mmap_size = 268435456');
  // Enable foreign keys for CASCADE deletes
  db.pragma('foreign_keys = ON');
  // Temp store in memory (faster than disk for intermediates)
  db.pragma('temp_store = MEMORY');

  // ── Schema Creation ────────────────────────────────────────────────────
  db.exec(SCHEMA_SQL);

  // ── Prepare Hot-Path Statements ────────────────────────────────────────
  _prepareStatements();

  console.log('[DB] Database initialized successfully.');
  return db;
}

/**
 * Pre-compiles frequently-used SQL statements into the cache.
 * Called once after schema creation.
 */
function _prepareStatements() {
  // ── Playlist CRUD ────────────────────────────────────────────────────
  stmts.upsertPlaylist = db.prepare(`
    INSERT INTO playlists (id, profile_id, name, url, type, username, password, server_url, last_updated, active)
    VALUES (@id, @profile_id, @name, @url, @type, @username, @password, @server_url, @last_updated, @active)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      url = excluded.url,
      type = excluded.type,
      username = excluded.username,
      password = excluded.password,
      server_url = excluded.server_url,
      last_updated = excluded.last_updated,
      active = excluded.active
  `);

  stmts.getPlaylistsByProfile = db.prepare(`
    SELECT * FROM playlists WHERE profile_id = ? ORDER BY last_updated DESC
  `);

  stmts.getPlaylistById = db.prepare(`
    SELECT * FROM playlists WHERE id = ?
  `);

  stmts.deletePlaylist = db.prepare(`
    DELETE FROM playlists WHERE id = ?
  `);

  stmts.deactivateAllPlaylists = db.prepare(`
    UPDATE playlists SET active = 0 WHERE profile_id = ?
  `);

  stmts.activatePlaylist = db.prepare(`
    UPDATE playlists SET active = 1 WHERE id = ?
  `);

  // ── Channel Queries ──────────────────────────────────────────────────
  stmts.insertChannel = db.prepare(`
    INSERT INTO channels (playlist_id, stream_id, name, logo, category_id, group_title, stream_url, tvg_id)
    VALUES (@playlist_id, @stream_id, @name, @logo, @category_id, @group_title, @stream_url, @tvg_id)
  `);

  stmts.clearPlaylistChannels = db.prepare(`
    DELETE FROM channels WHERE playlist_id = ?
  `);

  stmts.getChannelsByPlaylist = db.prepare(`
    SELECT * FROM channels WHERE playlist_id = ? ORDER BY ROWID ASC LIMIT ? OFFSET ?
  `);

  stmts.getChannelsByPlaylistAndGroup = db.prepare(`
    SELECT * FROM channels WHERE playlist_id = ? AND group_title = ? ORDER BY ROWID ASC LIMIT ? OFFSET ?
  `);

  stmts.getCategories = db.prepare(`
    SELECT DISTINCT group_title FROM channels WHERE playlist_id = ? AND group_title IS NOT NULL AND group_title != '' ORDER BY group_title ASC
  `);

  stmts.getChannelCount = db.prepare(`
    SELECT COUNT(*) AS count FROM channels WHERE playlist_id = ?
  `);

  stmts.getChannelCountByGroup = db.prepare(`
    SELECT COUNT(*) AS count FROM channels WHERE playlist_id = ? AND group_title = ?
  `);

  stmts.searchChannels = db.prepare(`
    SELECT * FROM channels WHERE playlist_id = ? AND name LIKE ? ORDER BY ROWID ASC LIMIT ? OFFSET ?
  `);

  stmts.checkFavorite = db.prepare(`
    SELECT 1 FROM favorites WHERE playlist_id = ? AND channel_id = ?
  `);

  stmts.addFavorite = db.prepare(`
    INSERT INTO favorites (playlist_id, channel_id) VALUES (?, ?)
  `);

  stmts.removeFavorite = db.prepare(`
    DELETE FROM favorites WHERE playlist_id = ? AND channel_id = ?
  `);

  stmts.getFavorites = db.prepare(`
    SELECT c.* FROM channels c
    INNER JOIN favorites f ON c.id = f.channel_id
    WHERE f.playlist_id = ?
    ORDER BY c.name ASC
  `);

  // ── EPG Queries ──────────────────────────────────────────────────────
  stmts.insertEPG = db.prepare(`
    INSERT INTO epg_programs (channel_id, start_time, end_time, title, description)
    VALUES (@channel_id, @start_time, @end_time, @title, @description)
  `);

  stmts.getEPGForChannel = db.prepare(`
    SELECT * FROM epg_programs
    WHERE channel_id = ? AND end_time >= ? AND start_time <= ?
    ORDER BY start_time ASC
  `);

  stmts.clearEPG = db.prepare(`
    DELETE FROM epg_programs
  `);

  stmts.cleanupExpiredEPG = db.prepare(`
    DELETE FROM epg_programs WHERE end_time < ?
  `);

  stmts.getEPGCount = db.prepare(`
    SELECT COUNT(*) AS count FROM epg_programs
  `);
}

// ── Playlist Operations ──────────────────────────────────────────────────────

/**
 * Upserts a playlist record into the database.
 *
 * @param {Object} data Playlist data
 * @param {string} data.id Unique playlist ID (nanoid)
 * @param {string} data.profile_id Profile this playlist belongs to
 * @param {string} data.name Display name
 * @param {string} [data.url] M3U URL
 * @param {string} data.type 'm3u' or 'xtream'
 * @param {string} [data.username] Xtream username
 * @param {string} [data.password] Xtream password
 * @param {string} [data.server_url] Xtream server URL
 * @param {number} [data.active] Whether this is the active playlist
 * @returns {Object} The run result
 */
function upsertPlaylist(data) {
  _ensureDB();
  return stmts.upsertPlaylist.run({
    id: data.id,
    profile_id: data.profile_id,
    name: data.name || 'Unnamed Playlist',
    url: data.url || null,
    type: data.type || 'm3u',
    username: data.username || null,
    password: data.password || null,
    server_url: data.server_url || null,
    last_updated: Date.now(),
    active: data.active ? 1 : 0,
  });
}

/**
 * Retrieves all playlists for a given profile.
 *
 * @param {string} profileId
 * @returns {Array<Object>} Playlist rows
 */
function getPlaylists(profileId) {
  _ensureDB();
  return stmts.getPlaylistsByProfile.all(profileId);
}

/**
 * Retrieves a single playlist by ID.
 *
 * @param {string} playlistId
 * @returns {Object|undefined}
 */
function getPlaylistById(playlistId) {
  _ensureDB();
  return stmts.getPlaylistById.get(playlistId);
}

/**
 * Deletes a playlist and all its channels (CASCADE).
 *
 * @param {string} playlistId
 * @returns {Object} The run result
 */
function deletePlaylist(playlistId) {
  _ensureDB();
  return stmts.deletePlaylist.run(playlistId);
}

/**
 * Sets a playlist as active, deactivating all others in the same profile.
 *
 * @param {string} profileId
 * @param {string} playlistId
 */
function setActivePlaylist(profileId, playlistId) {
  _ensureDB();
  const txn = db.transaction(() => {
    stmts.deactivateAllPlaylists.run(profileId);
    stmts.activatePlaylist.run(playlistId);
  });
  txn();
}

// ── Channel Operations ───────────────────────────────────────────────────────

/**
 * Inserts channels in batches of CHUNK_SIZE within explicit transactions.
 * This prevents the Main Process event loop from being starved on massive
 * playlists (10k–50k channels).
 *
 * @param {string} playlistId The owning playlist ID
 * @param {Array<Object>} channels Array of channel objects
 * @param {number} [chunkSize=500] Rows per transaction
 * @returns {{ inserted: number }} Total rows inserted
 */
function insertChannelsBatch(playlistId, channels, chunkSize = 500) {
  _ensureDB();

  let inserted = 0;

  for (let i = 0; i < channels.length; i += chunkSize) {
    const chunk = channels.slice(i, i + chunkSize);

    const txn = db.transaction((rows) => {
      for (const ch of rows) {
        stmts.insertChannel.run({
          playlist_id: playlistId,
          stream_id: ch.stream_id || ch.streamId || ch.id || null,
          name: ch.name || 'Unknown Channel',
          logo: ch.logo || ch.stream_icon || null,
          category_id: ch.category_id || ch.categoryId || null,
          group_title: ch.group_title || ch.group || ch.groupTitle || null,
          stream_url: ch.stream_url || ch.streamUrl || ch.url || null,
          tvg_id: ch.tvg_id || ch.tvgId || ch.epgId || null,
        });
      }
    });

    txn(chunk);
    inserted += chunk.length;
  }

  return { inserted };
}

/**
 * Removes all channels belonging to a playlist (pre-sync wipe).
 *
 * @param {string} playlistId
 * @returns {Object} The run result with `changes` count
 */
function clearPlaylistChannels(playlistId) {
  _ensureDB();
  return stmts.clearPlaylistChannels.run(playlistId);
}

/**
 * Retrieves channels for a playlist, optionally filtered by group, with pagination.
 *
 * @param {string} playlistId
 * @param {string|null} groupTitle Filter by group (null = all)
 * @param {number} [limit=200] Max rows to return
 * @param {number} [offset=0] Offset for pagination
 * @returns {Array<Object>} Channel rows
 */
function getChannels(playlistId, groupTitle, limit = 200, offset = 0) {
  _ensureDB();

  if (groupTitle) {
    return stmts.getChannelsByPlaylistAndGroup.all(playlistId, groupTitle, limit, offset);
  }
  return stmts.getChannelsByPlaylist.all(playlistId, limit, offset);
}

/**
 * Returns distinct group_title values for a playlist (i.e., categories).
 *
 * @param {string} playlistId
 * @returns {Array<string>} Category names
 */
function getCategories(playlistId) {
  _ensureDB();
  return stmts.getCategories.all(playlistId).map(row => row.group_title);
}

/**
 * Returns the total channel count for a playlist, optionally by group.
 *
 * @param {string} playlistId
 * @param {string|null} groupTitle
 * @returns {number}
 */
function getChannelCount(playlistId, groupTitle) {
  _ensureDB();
  if (groupTitle) {
    return stmts.getChannelCountByGroup.get(playlistId, groupTitle).count;
  }
  return stmts.getChannelCount.get(playlistId).count;
}

/**
 * Searches channels by name (LIKE %term%).
 *
 * @param {string} playlistId
 * @param {string} searchTerm
 * @param {number} [limit=100]
 * @param {number} [offset=0]
 * @returns {Array<Object>}
 */
function searchChannels(playlistId, searchTerm, limit = 100, offset = 0) {
  _ensureDB();
  return stmts.searchChannels.all(playlistId, `%${searchTerm}%`, limit, offset);
}

/**
 * Toggles a channel's favorite status.
 *
 * @param {string} playlistId
 * @param {number} channelId
 * @returns {boolean} True if added, false if removed
 */
function toggleFavorite(playlistId, channelId) {
  _ensureDB();
  const txn = db.transaction(() => {
    const exists = stmts.checkFavorite.get(playlistId, channelId);
    if (exists) {
      stmts.removeFavorite.run(playlistId, channelId);
      return false; // Removed
    } else {
      stmts.addFavorite.run(playlistId, channelId);
      return true; // Added
    }
  });
  return txn();
}

/**
 * Retrieves all favorited channels for a playlist.
 *
 * @param {string} playlistId
 * @returns {Array<Object>} Channel rows
 */
function getFavorites(playlistId) {
  _ensureDB();
  return stmts.getFavorites.all(playlistId);
}

// ── EPG Operations ───────────────────────────────────────────────────────────

/**
 * Inserts EPG programs in batches of CHUNK_SIZE within explicit transactions.
 *
 * @param {Array<Object>} programs Array of EPG program objects
 * @param {number} [chunkSize=1000] Rows per transaction
 * @returns {{ inserted: number }}
 */
function insertEPGBatch(programs, chunkSize = 1000) {
  _ensureDB();

  let inserted = 0;

  for (let i = 0; i < programs.length; i += chunkSize) {
    const chunk = programs.slice(i, i + chunkSize);

    const txn = db.transaction((rows) => {
      for (const prog of rows) {
        stmts.insertEPG.run({
          channel_id: prog.channel_id || prog.channelId,
          start_time: prog.start_time || prog.startTime,
          end_time: prog.end_time || prog.endTime,
          title: prog.title || 'No Title',
          description: prog.description || prog.desc || null,
        });
      }
    });

    txn(chunk);
    inserted += chunk.length;
  }

  return { inserted };
}

/**
 * Retrieves EPG programs for a channel within a time window.
 *
 * @param {string} channelId The tvg_id or channel reference
 * @param {number} startTime Window start (epoch ms)
 * @param {number} endTime Window end (epoch ms)
 * @returns {Array<Object>} EPG program rows
 */
function getEPGForChannel(channelId, startTime, endTime) {
  _ensureDB();
  return stmts.getEPGForChannel.all(channelId, startTime, endTime);
}

/**
 * Deletes all EPG programs older than the retention period (default 5 days).
 * Should be called on app launch to prevent unbounded table growth.
 *
 * @param {number} [retentionDays=5] Days of EPG data to keep
 * @returns {{ deleted: number }} Number of rows removed
 */
function cleanupExpiredEPG(retentionDays = 5) {
  _ensureDB();
  const cutoff = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);
  const result = stmts.cleanupExpiredEPG.run(cutoff);
  if (result.changes > 0) {
    console.log(`[DB] Cleaned up ${result.changes} expired EPG entries (older than ${retentionDays} days).`);
  }
  return { deleted: result.changes };
}

/**
 * Clears all EPG data (used before full re-sync).
 *
 * @returns {Object} Run result
 */
function clearAllEPG() {
  _ensureDB();
  return stmts.clearEPG.run();
}

/**
 * Returns the total EPG program count.
 *
 * @returns {number}
 */
function getEPGCount() {
  _ensureDB();
  return stmts.getEPGCount.get().count;
}

// ── Utilities ────────────────────────────────────────────────────────────────

/**
 * Closes the database connection gracefully.
 * Call during app.on('before-quit').
 */
function closeDatabase() {
  if (db) {
    console.log('[DB] Closing database connection.');
    db.close();
    db = null;
  }
}

/**
 * Returns the raw database instance for advanced queries.
 * Use sparingly — prefer the exposed methods above.
 *
 * @returns {import('better-sqlite3').Database|null}
 */
function getDatabase() {
  return db;
}

/**
 * Guard: ensures the database is initialized before any operation.
 * @private
 */
function _ensureDB() {
  if (!db) {
    throw new Error('[DB] Database not initialized. Call initDatabase() first.');
  }
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  initDatabase,
  closeDatabase,
  getDatabase,

  // Playlists
  upsertPlaylist,
  getPlaylists,
  getPlaylistById,
  deletePlaylist,
  setActivePlaylist,

  // Channels
  insertChannelsBatch,
  clearPlaylistChannels,
  getChannels,
  getCategories,
  getChannelCount,
  searchChannels,
  toggleFavorite,
  getFavorites,

  // EPG
  insertEPGBatch,
  getEPGForChannel,
  cleanupExpiredEPG,
  clearAllEPG,
  getEPGCount,
};
