# SQLite VOD/Series Parity (M3U) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give M3U playlists the same SQLite-backed Movies/Series path Xtream already has: classify during ingestion, store structured VOD/series/episode rows, and play from a real `stream_url`.

**Architecture:** A versioned additive migration adds `vod_streams.stream_url` and a `series_episodes` table. The renderer's media classifier and series-episode parser move to `electron/shared/*.mjs` (single source of truth; renderer keeps its paths via re-export shims, the CJS main process dynamic-imports them). `syncM3UPlaylist` routes each parsed entry into `channels` / `vod_streams` / `series` + `series_episodes`. The renderer builds DB-backed show objects in the exact shape `groupSeries` already emits, so overlays and playback work unchanged. A `DB_VOD_PARITY` diagnostic mirrors the existing `DB_CHANNEL_PARITY` pattern.

**Tech Stack:** Electron 31 (main = CJS, renderer = Vite/React ESM), better-sqlite3, plain `node:assert` test scripts (no test runner exists in this repo).

## Global Constraints

- Work on branch `feat/sqlite-vod-series-parity`, created from `fix/sqlite-refresh-sync`.
- Additive schema changes only; existing Xtream rows and behavior must not change.
- `vod_streams.stream_url` is nullable; Xtream rows leave it null.
- Xtream never writes `series_episodes`.
- Shared media modules live under `electron/shared/` (electron-builder packages `electron/**`; `src/` is NOT packaged). Renderer imports them only through shims in `src/lib/media/`.
- Route to movie/series during ingestion only when classifier `confidence >= 0.5`; otherwise the entry stays in `channels` (today's behavior).
- Pure-logic tests run with `node <script>`. Anything touching better-sqlite3 runs with `ELECTRON_RUN_AS_NODE=1 npx electron <script>` (electron-ABI safe).
- Every test script is a plain `node:assert` script that prints `OK: <name>` and exits non-zero on failure.
- Commit messages follow the repo's `type(scope): summary` convention.

---

### Task 0: Branch setup

**Files:** none (git only)

- [ ] **Step 1: Create the feature branch**

```bash
git checkout fix/sqlite-refresh-sync
git checkout -b feat/sqlite-vod-series-parity
```

Expected: `Switched to a new branch 'feat/sqlite-vod-series-parity'`. No commit; Task 1 makes the first commit on this branch.

---

### Task 1: Shared media modules under electron/shared

**Files:**
- Create: `electron/shared/mediaClassifier.mjs` (moved content)
- Create: `electron/shared/seriesGrouping.mjs` (moved content)
- Create: `electron/shared/mediaKeys.mjs`
- Modify: `src/lib/media/mediaClassifier.js` (becomes shim)
- Modify: `src/lib/media/seriesGrouping.js` (becomes shim)
- Test: `tests/shared-media.test.mjs`

**Interfaces:**
- Consumes: existing exports `classifyMedia(row)`, `parseEpisode(rawName)`, `groupSeries(items)`, `episodeLabel(ep)`.
- Produces: same exports, importable from `electron/shared/*.mjs` AND (unchanged paths) from `src/lib/media/*.js`. New: `contentHash(str): string`, `m3uStreamId(url): string` (`m3u-<hash>`), `m3uSeriesKey(showName): string` (`m3u-show-<hash>`, case/whitespace-normalized).

- [ ] **Step 1: Move the two modules**

Copy the **entire current content** of `src/lib/media/mediaClassifier.js` into `electron/shared/mediaClassifier.mjs`, and of `src/lib/media/seriesGrouping.js` into `electron/shared/seriesGrouping.mjs`, byte-for-byte except each file's header path comment (update to the new path). Do not change any logic.

- [ ] **Step 2: Replace the src files with shims**

`src/lib/media/mediaClassifier.js` becomes exactly:

```js
// Shim: the classifier is shared with the Electron main process (M3U ingestion
// routes rows with the same heuristics the renderer uses). Canonical source
// lives under electron/shared/ because electron-builder packages electron/**
// but not src/**.
export * from '../../../electron/shared/mediaClassifier.mjs';
```

`src/lib/media/seriesGrouping.js` becomes exactly:

```js
// Shim: shared with the Electron main process — see mediaClassifier.js shim.
export * from '../../../electron/shared/seriesGrouping.mjs';
```

- [ ] **Step 3: Write `electron/shared/mediaKeys.mjs`**

```js
/**
 * electron/shared/mediaKeys.mjs
 *
 * Stable, content-derived identifiers for M3U-sourced VOD/series rows.
 * M3U entries carry no provider IDs, so keys are hashed from content:
 * stable across resyncs, independent of insertion order.
 */

/** djb2 hash, unsigned, fixed-width hex. */
export function contentHash(str) {
  let h = 5381;
  const s = String(str || '');
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

/** stream_id for an M3U movie row, derived from its stream URL. */
export function m3uStreamId(url) {
  return `m3u-${contentHash(url)}`;
}

/** series_id / series_key for an M3U show, derived from its normalized name. */
export function m3uSeriesKey(showName) {
  const norm = String(showName || '').toLowerCase().trim().replace(/\s+/g, ' ');
  return `m3u-show-${contentHash(norm)}`;
}
```

- [ ] **Step 4: Write the failing/passing test**

`tests/shared-media.test.mjs`:

```js
import assert from 'node:assert/strict';
import { classifyMedia } from '../electron/shared/mediaClassifier.mjs';
import { parseEpisode } from '../electron/shared/seriesGrouping.mjs';
import { contentHash, m3uStreamId, m3uSeriesKey } from '../electron/shared/mediaKeys.mjs';
// Shims must re-export the same functions.
import { classifyMedia as shimClassify } from '../src/lib/media/mediaClassifier.js';
import { parseEpisode as shimParse } from '../src/lib/media/seriesGrouping.js';

assert.equal(classifyMedia({ name: 'Inception (2010)', group_title: 'Movies', stream_url: 'http://x/movie/u/p/1.mkv' }).type, 'movie');
assert.equal(classifyMedia({ name: 'Breaking Bad S01E01', group_title: 'Series', stream_url: 'http://x/series/u/p/1.mkv' }).type, 'series');
assert.equal(shimClassify, classifyMedia, 'shim must re-export the identical function');
assert.equal(shimParse, parseEpisode, 'shim must re-export the identical function');

assert.deepEqual(parseEpisode('Breaking Bad S01E02 Cat in the Bag'), { show: 'Breaking Bad', season: 1, episode: 2, epTitle: 'Cat in the Bag' });

assert.match(contentHash('abc'), /^[0-9a-f]{8}$/);
assert.equal(contentHash('abc'), contentHash('abc'), 'hash must be deterministic');
assert.notEqual(contentHash('abc'), contentHash('abd'));
assert.equal(m3uStreamId('http://x/1.mkv'), `m3u-${contentHash('http://x/1.mkv')}`);
assert.equal(m3uSeriesKey('  Breaking   Bad '), m3uSeriesKey('breaking bad'), 'series key must normalize case/whitespace');

console.log('OK: shared-media');
```

- [ ] **Step 5: Run the test**

Run: `node tests/shared-media.test.mjs`
Expected: `OK: shared-media`

- [ ] **Step 6: Verify the renderer still builds with the shims**

Run: `npm run build`
Expected: Vite build completes with no `Could not resolve` errors (proves the renderer resolves `electron/shared/*.mjs` through the shims).

- [ ] **Step 7: Commit**

```bash
git add electron/shared/ src/lib/media/mediaClassifier.js src/lib/media/seriesGrouping.js tests/shared-media.test.mjs
git commit -m "refactor(media): move classifier/series parser to electron/shared as single source of truth"
```

---

### Task 2: Versioned schema migration (v1)

**Files:**
- Create: `electron/migrations.cjs`
- Modify: `electron/db.cjs` (SCHEMA_SQL, `initDatabase`)
- Test: `tests/migrations.test.cjs`

**Interfaces:**
- Produces: `runMigrations(db) -> { from: number, to: number }` and `SCHEMA_VERSION = 1` (CJS exports). `initDatabase(dbPathOverride?)` — when a string is passed (e.g. `':memory:'`), it is used instead of `app.getPath('userData')`, enabling tests under electron-as-node. After Task 2, every opened DB has `vod_streams.stream_url` and the `series_episodes` table.

- [ ] **Step 1: Write the failing test**

`tests/migrations.test.cjs`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `ELECTRON_RUN_AS_NODE=1 npx electron tests/migrations.test.cjs`
Expected: FAIL with `Cannot find module '../electron/migrations.cjs'`

- [ ] **Step 3: Write `electron/migrations.cjs`**

```js
// electron/migrations.cjs
// ─────────────────────────────────────────────────────────────────────────────
// Versioned, additive schema migrations, gated on PRAGMA user_version.
// Every step is defensive (checks actual state) so a fresh DB — whose
// SCHEMA_SQL already includes the final shape — migrates cleanly to the
// current version without duplicate-column errors.
// ─────────────────────────────────────────────────────────────────────────────

const SCHEMA_VERSION = 1;

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
    db.pragma(`user_version = ${SCHEMA_VERSION}`);
  });
  apply();

  console.log(`[DB] Migrated schema from v${from} to v${SCHEMA_VERSION}.`);
  return { from, to: SCHEMA_VERSION };
}

module.exports = { runMigrations, SCHEMA_VERSION };
```

- [ ] **Step 4: Update `electron/db.cjs`**

4a. In `SCHEMA_SQL`, inside the `vod_streams` CREATE TABLE, add a line after `container_extension TEXT,`:

```sql
    stream_url TEXT,
```

(the FOREIGN KEY line stays last). 4b. At the end of `SCHEMA_SQL` (after the two Phase-10 indices), append:

```sql
  -- ── Phase 11: M3U VOD/Series parity ──────────────────────────────────────
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
```

4c. Change `initDatabase` to accept an override and run migrations. Replace its opening lines and the schema-creation section:

```js
function initDatabase(dbPathOverride) {
  if (db) return db;

  const Database = require('better-sqlite3');
  const dbPath = dbPathOverride || path.join(app.getPath('userData'), 'matrix_iptv.db');
```

and after `db.exec(SCHEMA_SQL);` add:

```js
  // ── Versioned Migrations (additive; existing rows untouched) ───────────
  const { runMigrations } = require('./migrations.cjs');
  runMigrations(db);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `ELECTRON_RUN_AS_NODE=1 npx electron tests/migrations.test.cjs`
Expected: `OK: migrations` (plus the two `[DB] ...` log lines)

- [ ] **Step 6: Commit**

```bash
git add electron/migrations.cjs electron/db.cjs tests/migrations.test.cjs
git commit -m "feat(db): v1 migration - vod_streams.stream_url + series_episodes table"
```

---

### Task 3: DB layer — episode statements, VOD stream_url, media stats, IPC, preload

**Files:**
- Modify: `electron/db.cjs`
- Modify: `electron/ipcHandlers.cjs` (IPC registration block, near the existing `db:getSeriesCategories` handler)
- Modify: `electron/preload.cjs` (inside the `electronDB` bridge object)
- Test: `tests/db-episodes.test.cjs`

**Interfaces:**
- Consumes: Task 2's schema (`series_episodes`, `vod_streams.stream_url`), `initDatabase(':memory:')`.
- Produces (db.cjs exports):
  - `insertSeriesEpisodesBatch(playlistId, episodes, chunkSize=500) -> { inserted }` — episode objects `{ series_key, season, episode, name, title, stream_url, logo, group_title }`
  - `clearPlaylistSeriesEpisodes(playlistId)`
  - `getSeriesEpisodes(playlistId, seriesKey) -> rows` (ordered season, episode)
  - `getSeriesEpisodesByCategory(playlistId, groupTitle, limit=5000, offset=0) -> rows` (ordered series_key, season, episode)
  - `getMediaStats(playlistId) -> { vodCount, seriesCount, episodeCount }`
  - `insertVODBatch` now persists `stream_url` (null when absent — Xtream unchanged).
- Produces (renderer bridge): `window.electronDB.getSeriesEpisodes(playlistId, seriesKey)`, `window.electronDB.getSeriesEpisodesByCategory(playlistId, groupTitle, limit, offset)`, `window.electronDB.getMediaStats(playlistId)`.

- [ ] **Step 1: Write the failing test**

`tests/db-episodes.test.cjs`:

```js
const assert = require('node:assert/strict');
const db = require('../electron/db.cjs');

db.initDatabase(':memory:');
db.upsertPlaylist({ id: 'pl1', profile_id: 'prof1', name: 'Test', type: 'm3u' });

// VOD rows: M3U row carries stream_url, Xtream-style row leaves it null.
db.insertVODBatch('pl1', [
  { stream_id: 'm3u-aaaa', name: 'Inception (2010)', group_title: 'Movies', stream_url: 'http://x/1.mkv' },
  { stream_id: '77', name: 'Xtream Movie', group_title: 'Movies' },
]);
const vods = db.getVODsByCategory('pl1', 'Movies');
assert.equal(vods.length, 2);
assert.equal(vods.find((v) => v.stream_id === 'm3u-aaaa').stream_url, 'http://x/1.mkv');
assert.equal(vods.find((v) => v.stream_id === '77').stream_url, null);

// Episodes: insert out of order, read back ordered.
db.insertSeriesEpisodesBatch('pl1', [
  { series_key: 'm3u-show-1', season: 2, episode: 1, name: 'Show S02E01', title: '', stream_url: 'http://x/s2e1.mkv', logo: null, group_title: 'Series' },
  { series_key: 'm3u-show-1', season: 1, episode: 2, name: 'Show S01E02', title: 'Two', stream_url: 'http://x/s1e2.mkv', logo: null, group_title: 'Series' },
  { series_key: 'm3u-show-1', season: 1, episode: 1, name: 'Show S01E01', title: 'One', stream_url: 'http://x/s1e1.mkv', logo: null, group_title: 'Series' },
]);
const eps = db.getSeriesEpisodes('pl1', 'm3u-show-1');
assert.deepEqual(eps.map((e) => [e.season, e.episode]), [[1, 1], [1, 2], [2, 1]]);

const byCat = db.getSeriesEpisodesByCategory('pl1', 'Series');
assert.equal(byCat.length, 3);
assert.equal(byCat[0].stream_url, 'http://x/s1e1.mkv');

// Stats
assert.deepEqual(db.getMediaStats('pl1'), { vodCount: 2, seriesCount: 0, episodeCount: 3 });

// Clear
db.clearPlaylistSeriesEpisodes('pl1');
assert.equal(db.getSeriesEpisodes('pl1', 'm3u-show-1').length, 0);

console.log('OK: db-episodes');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `ELECTRON_RUN_AS_NODE=1 npx electron tests/db-episodes.test.cjs`
Expected: FAIL (`db.insertSeriesEpisodesBatch is not a function`)

- [ ] **Step 3: Implement in `electron/db.cjs`**

3a. Update `stmts.insertVOD` (add the column):

```js
  stmts.insertVOD = db.prepare(`
    INSERT INTO vod_streams (playlist_id, stream_id, name, stream_icon, category_id, group_title, rating, added, container_extension, stream_url)
    VALUES (@playlist_id, @stream_id, @name, @stream_icon, @category_id, @group_title, @rating, @added, @container_extension, @stream_url)
  `);
```

and in `insertVODBatch`'s run object add:

```js
          stream_url: vod.stream_url || null,
```

3b. Add to `_prepareStatements` after the series statements:

```js
  // ── Series Episodes (M3U parity) ─────────────────────────────────────────
  stmts.insertSeriesEpisode = db.prepare(`
    INSERT INTO series_episodes (playlist_id, series_key, season, episode, name, title, stream_url, logo, group_title)
    VALUES (@playlist_id, @series_key, @season, @episode, @name, @title, @stream_url, @logo, @group_title)
  `);

  stmts.clearPlaylistSeriesEpisodes = db.prepare(`
    DELETE FROM series_episodes WHERE playlist_id = ?
  `);

  stmts.getSeriesEpisodes = db.prepare(`
    SELECT * FROM series_episodes WHERE playlist_id = ? AND series_key = ?
    ORDER BY season ASC, episode ASC
  `);

  stmts.getSeriesEpisodesByCategory = db.prepare(`
    SELECT * FROM series_episodes WHERE playlist_id = ? AND group_title = ?
    ORDER BY series_key ASC, season ASC, episode ASC LIMIT ? OFFSET ?
  `);

  stmts.getVODCount = db.prepare(`SELECT COUNT(*) AS count FROM vod_streams WHERE playlist_id = ?`);
  stmts.getSeriesCount = db.prepare(`SELECT COUNT(*) AS count FROM series WHERE playlist_id = ?`);
  stmts.getEpisodeCount = db.prepare(`SELECT COUNT(*) AS count FROM series_episodes WHERE playlist_id = ?`);
```

3c. Add functions after `getSeriesCategories`:

```js
function insertSeriesEpisodesBatch(playlistId, episodes, chunkSize = 500) {
  _ensureDB();
  let inserted = 0;
  for (let i = 0; i < episodes.length; i += chunkSize) {
    const chunk = episodes.slice(i, i + chunkSize);
    const txn = db.transaction((rows) => {
      for (const ep of rows) {
        stmts.insertSeriesEpisode.run({
          playlist_id: playlistId,
          series_key: ep.series_key,
          season: ep.season ?? 1,
          episode: ep.episode ?? 0,
          name: ep.name || 'Unknown Episode',
          title: ep.title || null,
          stream_url: ep.stream_url,
          logo: ep.logo || null,
          group_title: ep.group_title || null,
        });
      }
    });
    txn(chunk);
    inserted += chunk.length;
  }
  return { inserted };
}

function clearPlaylistSeriesEpisodes(playlistId) {
  _ensureDB();
  return stmts.clearPlaylistSeriesEpisodes.run(playlistId);
}

function getSeriesEpisodes(playlistId, seriesKey) {
  _ensureDB();
  return stmts.getSeriesEpisodes.all(playlistId, seriesKey);
}

function getSeriesEpisodesByCategory(playlistId, groupTitle, limit = 5000, offset = 0) {
  _ensureDB();
  return stmts.getSeriesEpisodesByCategory.all(playlistId, groupTitle, limit, offset);
}

function getMediaStats(playlistId) {
  _ensureDB();
  return {
    vodCount: stmts.getVODCount.get(playlistId).count,
    seriesCount: stmts.getSeriesCount.get(playlistId).count,
    episodeCount: stmts.getEpisodeCount.get(playlistId).count,
  };
}
```

3d. Add to `module.exports` under the VOD/Series section:

```js
  insertSeriesEpisodesBatch,
  clearPlaylistSeriesEpisodes,
  getSeriesEpisodes,
  getSeriesEpisodesByCategory,
  getMediaStats,
```

- [ ] **Step 4: Run test to verify it passes**

Run: `ELECTRON_RUN_AS_NODE=1 npx electron tests/db-episodes.test.cjs`
Expected: `OK: db-episodes`

- [ ] **Step 5: Register IPC + preload**

In `electron/ipcHandlers.cjs`, directly after the `db:getSeriesCategories` handler, add:

```js
  ipcMain.handle('db:getSeriesEpisodes', (_e, playlistId, seriesKey) => {
    try {
      return db.getSeriesEpisodes(playlistId, seriesKey);
    } catch (err) {
      console.error('[IPC] db:getSeriesEpisodes error:', err);
      return [];
    }
  });

  ipcMain.handle('db:getSeriesEpisodesByCategory', (_e, playlistId, groupTitle, limit = 5000, offset = 0) => {
    try {
      return db.getSeriesEpisodesByCategory(playlistId, groupTitle, limit, offset);
    } catch (err) {
      console.error('[IPC] db:getSeriesEpisodesByCategory error:', err);
      return [];
    }
  });

  ipcMain.handle('db:getMediaStats', (_e, playlistId) => {
    try {
      return db.getMediaStats(playlistId);
    } catch (err) {
      console.error('[IPC] db:getMediaStats error:', err);
      return { vodCount: 0, seriesCount: 0, episodeCount: 0 };
    }
  });
```

In `electron/preload.cjs`, inside the `electronDB` object after `getSeriesCategories`:

```js
  getSeriesEpisodes: (playlistId, seriesKey) => ipcRenderer.invoke('db:getSeriesEpisodes', playlistId, seriesKey),
  getSeriesEpisodesByCategory: (playlistId, groupTitle, limit, offset) => ipcRenderer.invoke('db:getSeriesEpisodesByCategory', playlistId, groupTitle, limit, offset),
  getMediaStats: (playlistId) => ipcRenderer.invoke('db:getMediaStats', playlistId),
```

- [ ] **Step 6: Commit**

```bash
git add electron/db.cjs electron/ipcHandlers.cjs electron/preload.cjs tests/db-episodes.test.cjs
git commit -m "feat(db): series episode storage, VOD stream_url persistence, media stats IPC"
```

---

### Task 4: M3U routing module (pure classification → table routing)

**Files:**
- Create: `electron/shared/m3uRouting.mjs`
- Test: `tests/m3u-routing.test.mjs`

**Interfaces:**
- Consumes: `classifyMedia` (Task 1), `parseEpisode` (Task 1), `m3uStreamId`/`m3uSeriesKey` (Task 1). Input rows are `parseM3UChannels` output: `{ name, stream_url, group_title, tvg_id, logo, stream_id: null, category_id: null }`.
- Produces: `routeM3UItems(parsedChannels) -> { liveChannels, vodRows, seriesRows, episodeRows }` where `vodRows` match `insertVODBatch` input (with `stream_url`), `seriesRows` match `insertSeriesBatch` input (`series_id` = series_key), `episodeRows` match `insertSeriesEpisodesBatch` input.

- [ ] **Step 1: Write the failing test**

`tests/m3u-routing.test.mjs`:

```js
import assert from 'node:assert/strict';
import { routeM3UItems } from '../electron/shared/m3uRouting.mjs';
import { m3uSeriesKey } from '../electron/shared/mediaKeys.mjs';

const parsed = [
  // live — both m3u8 and plain ts-style URLs
  { name: 'CNN', stream_url: 'http://p/live/u/p/1.m3u8', group_title: 'News', tvg_id: 'cnn.us', logo: 'l1', stream_id: null, category_id: null },
  { name: 'ESPN HD', stream_url: 'http://p/live/u/p/2.ts', group_title: 'Sports', tvg_id: null, logo: null, stream_id: null, category_id: null },
  // movies — Xtream-style path AND generic-provider naming
  { name: 'Inception (2010)', stream_url: 'http://p/movie/u/p/3.mkv', group_title: 'VOD', tvg_id: null, logo: 'l3', stream_id: null, category_id: null },
  { name: 'Interstellar (2014)', stream_url: 'http://p/get/777', group_title: 'General', tvg_id: null, logo: null, stream_id: null, category_id: null },
  // series — SxxExx, NxNN, spelled out; two conventions for the SAME show
  { name: 'Breaking Bad S01E01 Pilot', stream_url: 'http://p/series/u/p/4.mkv', group_title: 'Series', tvg_id: null, logo: 'l4', stream_id: null, category_id: null },
  { name: 'Breaking Bad 1x02', stream_url: 'http://p/series/u/p/5.mkv', group_title: 'Series', tvg_id: null, logo: null, stream_id: null, category_id: null },
  { name: 'The Office Season 2 Episode 3', stream_url: 'http://p/vids/6.mp4', group_title: 'Shows', tvg_id: null, logo: null, stream_id: null, category_id: null },
];

const { liveChannels, vodRows, seriesRows, episodeRows } = routeM3UItems(parsed);

assert.equal(liveChannels.length, 2);
assert.equal(liveChannels[0].name, 'CNN');

assert.equal(vodRows.length, 2);
assert.ok(vodRows.every((v) => v.stream_url && v.stream_id.startsWith('m3u-')));
assert.equal(vodRows[0].group_title, 'VOD');

// Both Breaking Bad naming conventions collapse into ONE show row.
assert.equal(seriesRows.length, 2);
const bb = seriesRows.find((s) => s.name === 'Breaking Bad');
assert.ok(bb, 'Breaking Bad show row exists');
assert.equal(bb.series_id, m3uSeriesKey('Breaking Bad'));
assert.equal(bb.cover, 'l4', 'first episode logo becomes the show cover');

assert.equal(episodeRows.length, 3);
const bbEps = episodeRows.filter((e) => e.series_key === bb.series_id);
assert.deepEqual(bbEps.map((e) => [e.season, e.episode]), [[1, 1], [1, 2]]);
assert.equal(bbEps[0].title, 'Pilot');
assert.equal(bbEps[0].stream_url, 'http://p/series/u/p/4.mkv');
const office = episodeRows.find((e) => e.name.startsWith('The Office'));
assert.deepEqual([office.season, office.episode], [2, 3]);

// Determinism: same input, same ids.
const again = routeM3UItems(parsed);
assert.deepEqual(again.vodRows.map((v) => v.stream_id), vodRows.map((v) => v.stream_id));

// Empty/garbage safety.
assert.deepEqual(routeM3UItems([]), { liveChannels: [], vodRows: [], seriesRows: [], episodeRows: [] });
assert.deepEqual(routeM3UItems(null), { liveChannels: [], vodRows: [], seriesRows: [], episodeRows: [] });

console.log('OK: m3u-routing');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/m3u-routing.test.mjs`
Expected: FAIL with `Cannot find module .../m3uRouting.mjs`

- [ ] **Step 3: Write `electron/shared/m3uRouting.mjs`**

```js
/**
 * electron/shared/m3uRouting.mjs
 *
 * Routes parsed M3U entries into their SQLite destinations using the SAME
 * classifier the renderer uses (single source of truth — see mediaClassifier).
 * Called by syncM3UPlaylist in the main process.
 */

import { classifyMedia } from './mediaClassifier.mjs';
import { parseEpisode } from './seriesGrouping.mjs';
import { m3uStreamId, m3uSeriesKey } from './mediaKeys.mjs';

// Same threshold toMediaItem (renderer) uses to demote weak guesses to
// 'unsorted': below it an entry stays a live channel, exactly as today.
const MIN_CONFIDENCE = 0.5;

/**
 * @param {Array<Object>} parsedChannels parseM3UChannels output
 * @returns {{ liveChannels: Array, vodRows: Array, seriesRows: Array, episodeRows: Array }}
 */
export function routeM3UItems(parsedChannels) {
  const liveChannels = [];
  const vodRows = [];
  const seriesRowsByKey = new Map();
  const episodeRows = [];

  for (const ch of parsedChannels || []) {
    const { type, confidence } = classifyMedia(ch);

    if (type === 'movie' && confidence >= MIN_CONFIDENCE) {
      vodRows.push({
        stream_id: m3uStreamId(ch.stream_url),
        name: ch.name,
        stream_icon: ch.logo || null,
        category_id: null,
        group_title: ch.group_title || 'Uncategorized',
        rating: 0,
        added: null,
        container_extension: null,
        stream_url: ch.stream_url,
      });
      continue;
    }

    if (type === 'series' && confidence >= MIN_CONFIDENCE) {
      const parsed = parseEpisode(ch.name);
      const show = parsed ? parsed.show : (ch.name || 'Unknown Show');
      const key = m3uSeriesKey(show);

      if (!seriesRowsByKey.has(key)) {
        seriesRowsByKey.set(key, {
          series_id: key,
          name: show,
          cover: ch.logo || null,
          plot: null,
          category_id: null,
          group_title: ch.group_title || 'Uncategorized',
          rating: 0,
          releaseDate: null,
        });
      } else if (!seriesRowsByKey.get(key).cover && ch.logo) {
        seriesRowsByKey.get(key).cover = ch.logo;
      }

      episodeRows.push({
        series_key: key,
        season: parsed ? parsed.season : 1,
        episode: parsed ? parsed.episode : 0,
        name: ch.name,
        title: parsed ? parsed.epTitle : '',
        stream_url: ch.stream_url,
        logo: ch.logo || null,
        group_title: ch.group_title || 'Uncategorized',
      });
      continue;
    }

    liveChannels.push(ch);
  }

  return { liveChannels, vodRows, seriesRows: [...seriesRowsByKey.values()], episodeRows };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/m3u-routing.test.mjs`
Expected: `OK: m3u-routing`

- [ ] **Step 5: Commit**

```bash
git add electron/shared/m3uRouting.mjs tests/m3u-routing.test.mjs
git commit -m "feat(ingest): shared M3U routing - classify entries into live/vod/series/episodes"
```

---

### Task 5: Wire routing into syncM3UPlaylist (+ integration test over HTTP fixture)

**Files:**
- Modify: `electron/ipcHandlers.cjs` (`syncM3UPlaylist`, module top, module exports)
- Create: `tests/fixtures/mixed.m3u`
- Test: `tests/integration.sync-m3u.test.cjs`

**Interfaces:**
- Consumes: `routeM3UItems` (Task 4), `db.insertVODBatch` / `db.insertSeriesBatch` / `db.insertSeriesEpisodesBatch` / clear functions (Task 3).
- Produces: `syncM3UPlaylist` writes all four tables; its result gains `vodCount`, `seriesCount`, `episodeCount` (additive — existing consumers read only `success`/`channelCount`/`epgCount`). `module.exports.__testables = { syncM3UPlaylist, parseM3UChannels }` for tests.

- [ ] **Step 1: Create the fixture**

`tests/fixtures/mixed.m3u` (both Xtream-style and generic-provider naming — the gap being closed):

```
#EXTM3U
#EXTINF:-1 tvg-id="cnn.us" tvg-logo="http://logo/cnn.png" group-title="News",CNN
http://fixture/live/user/pass/1.m3u8
#EXTINF:-1 group-title="Sports",ESPN HD
http://fixture/live/user/pass/2.ts
#EXTINF:-1 tvg-logo="http://logo/inc.png" group-title="VOD Movies",Inception (2010)
http://fixture/movie/user/pass/100.mkv
#EXTINF:-1 group-title="General",Interstellar (2014)
http://fixture/get/777
#EXTINF:-1 tvg-logo="http://logo/bb.png" group-title="Series",Breaking Bad S01E01 Pilot
http://fixture/series/user/pass/200.mkv
#EXTINF:-1 group-title="Series",Breaking Bad 1x02
http://fixture/series/user/pass/201.mkv
#EXTINF:-1 group-title="TV Shows",The Office Season 2 Episode 3
http://fixture/vids/office-s2e3.mp4
```

- [ ] **Step 2: Write the failing integration test**

`tests/integration.sync-m3u.test.cjs`:

```js
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

const db = require('../electron/db.cjs');
const ipc = require('../electron/ipcHandlers.cjs');

async function main() {
  assert.ok(ipc.__testables, 'ipcHandlers must export __testables');
  const { syncM3UPlaylist } = ipc.__testables;

  const m3uText = fs.readFileSync(path.join(__dirname, 'fixtures', 'mixed.m3u'), 'utf8');
  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/x-mpegurl' });
    res.end(m3uText);
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/list.m3u`;

  db.initDatabase(':memory:');
  db.upsertPlaylist({ id: 'pl1', profile_id: 'prof1', name: 'Fixture', type: 'm3u', url });

  const result = await syncM3UPlaylist('pl1', url);
  server.close();

  assert.equal(result.success, true, `sync failed: ${result.error}`);
  assert.equal(result.channelCount, 2, 'only live entries land in channels');
  assert.equal(result.vodCount, 2);
  assert.equal(result.seriesCount, 2);
  assert.equal(result.episodeCount, 3);

  const raw = db.getDatabase();
  assert.equal(raw.prepare(`SELECT COUNT(*) c FROM channels WHERE playlist_id='pl1'`).get().c, 2);

  const vods = raw.prepare(`SELECT * FROM vod_streams WHERE playlist_id='pl1' ORDER BY name`).all();
  assert.deepEqual(vods.map((v) => v.name), ['Inception (2010)', 'Interstellar (2014)']);
  assert.ok(vods.every((v) => v.stream_url && v.stream_id.startsWith('m3u-')));

  const shows = raw.prepare(`SELECT * FROM series WHERE playlist_id='pl1' ORDER BY name`).all();
  assert.deepEqual(shows.map((s) => s.name), ['Breaking Bad', 'The Office']);

  const eps = raw.prepare(`SELECT * FROM series_episodes WHERE playlist_id='pl1' ORDER BY series_key, season, episode`).all();
  assert.equal(eps.length, 3);
  assert.ok(eps.every((e) => e.stream_url.startsWith('http://fixture/')));

  // Re-sync must replace, not duplicate (clear-before-insert on every table).
  const again = await new Promise((resolve) => {
    const s2 = http.createServer((_q, res) => { res.writeHead(200); res.end(m3uText); });
    s2.listen(0, '127.0.0.1', async () => {
      const r = await syncM3UPlaylist('pl1', `http://127.0.0.1:${s2.address().port}/list.m3u`);
      s2.close();
      resolve(r);
    });
  });
  assert.equal(again.success, true);
  assert.equal(raw.prepare(`SELECT COUNT(*) c FROM vod_streams WHERE playlist_id='pl1'`).get().c, 2);
  assert.equal(raw.prepare(`SELECT COUNT(*) c FROM series_episodes WHERE playlist_id='pl1'`).get().c, 3);

  console.log('OK: integration.sync-m3u');
}

main().catch((err) => { console.error(err); process.exit(1); });
```

- [ ] **Step 3: Run test to verify it fails**

Run: `ELECTRON_RUN_AS_NODE=1 npx electron tests/integration.sync-m3u.test.cjs`
Expected: FAIL at `ipcHandlers must export __testables`

- [ ] **Step 4: Implement in `electron/ipcHandlers.cjs`**

4a. At the module top (after the existing requires) add:

```js
const path = require('path');
const { pathToFileURL } = require('url');

// Shared media modules are ESM (also consumed by the renderer via shims in
// src/lib/media/). The CJS main process loads them once via dynamic import.
let _sharedMediaPromise = null;
function loadSharedMedia() {
  if (!_sharedMediaPromise) {
    _sharedMediaPromise = import(
      pathToFileURL(path.join(__dirname, 'shared', 'm3uRouting.mjs')).href
    );
  }
  return _sharedMediaPromise;
}
```

(If `path` is already required at the top, keep the existing line — do not require it twice.)

4b. In `syncM3UPlaylist`, replace Stage 3 + Stage 4 (from `// Stage 3: Clear old channels...` through the `sendProgress(...'Inserted N channels.')` line) with:

```js
    // Stage 3: Classify + route (same classifier the renderer uses)
    const { routeM3UItems } = await loadSharedMedia();
    const routed = routeM3UItems(channels);
    sendProgress(
      playlistId, 'inserting', 40,
      `Inserting ${routed.liveChannels.length} channels, ${routed.vodRows.length} movies, ${routed.episodeRows.length} episodes...`
    );

    // Stage 4: Clear + chunked insert per table (replace, never accumulate)
    db.clearPlaylistChannels(playlistId);
    const { inserted } = db.insertChannelsBatch(playlistId, routed.liveChannels);

    db.clearPlaylistVODs(playlistId);
    const insertedVOD = db.insertVODBatch(playlistId, routed.vodRows).inserted;

    db.clearPlaylistSeries(playlistId);
    const insertedSeries = db.insertSeriesBatch(playlistId, routed.seriesRows).inserted;

    db.clearPlaylistSeriesEpisodes(playlistId);
    const insertedEpisodes = db.insertSeriesEpisodesBatch(playlistId, routed.episodeRows).inserted;

    sendProgress(playlistId, 'inserting', 60,
      `Inserted ${inserted} channels, ${insertedVOD} movies, ${insertedSeries} series (${insertedEpisodes} episodes).`);
```

4c. Update the two ends of `syncM3UPlaylist`: the final `sendProgress(... 'done' ...)` message becomes

```js
    sendProgress(playlistId, 'done', 100,
      `Sync complete: ${inserted} channels, ${insertedVOD} movies, ${insertedSeries} series, ${epgCount} EPG entries.`);
```

and the success return becomes

```js
    return {
      success: true,
      channelCount: inserted,
      vodCount: insertedVOD,
      seriesCount: insertedSeries,
      episodeCount: insertedEpisodes,
      epgCount,
      epgUrl: epgUrl || null,
    };
```

4d. At the very bottom of the file, after the existing `module.exports` assignment, add:

```js
// Test-only surface: lets integration tests drive the sync pipeline under
// ELECTRON_RUN_AS_NODE without an ipcMain. Not part of the runtime API.
module.exports.__testables = { syncM3UPlaylist, parseM3UChannels };
```

- [ ] **Step 5: Run tests to verify they pass (including no regressions)**

Run: `ELECTRON_RUN_AS_NODE=1 npx electron tests/integration.sync-m3u.test.cjs`
Expected: `OK: integration.sync-m3u`

Run: `ELECTRON_RUN_AS_NODE=1 npx electron tests/migrations.test.cjs && ELECTRON_RUN_AS_NODE=1 npx electron tests/db-episodes.test.cjs && node tests/m3u-routing.test.mjs && node tests/shared-media.test.mjs`
Expected: all four `OK:` lines.

- [ ] **Step 6: Commit**

```bash
git add electron/ipcHandlers.cjs tests/fixtures/mixed.m3u tests/integration.sync-m3u.test.cjs
git commit -m "feat(ingest): route M3U sync into channels/vod_streams/series/series_episodes"
```

---

### Task 6: Renderer — DB-backed shows adapter + VODLibrary dedupe/episode path

**Files:**
- Create: `src/lib/media/dbSeriesAdapter.js`
- Modify: `src/components/VODLibrary.jsx`
- Test: `tests/db-series-adapter.test.mjs`

**Interfaces:**
- Consumes: `window.electronDB.getSeriesEpisodesByCategory` (Task 3), `toMediaItem` (`src/lib/media/mediaAdapter.js`), `groupSeries` (shim path unchanged).
- Produces: `buildShowsFromDbEpisodes(seriesRows, episodeRows, playlistId) -> Show[]` where Show is **exactly** the `groupSeries` output shape: `{ key, show, poster, group, seasons: Map<number, Episode[]>, seasonNumbers: number[], episodes: Episode[], episodeCount }` and each Episode is a MediaItem (has `.id`, `.url`, `.name`, `type: 'series'`) plus `_season`, `_episode`, `_epTitle` — so `SeriesDetailOverlay` and `playSeriesEpisode` need zero changes.

- [ ] **Step 1: Write the failing test**

`tests/db-series-adapter.test.mjs`:

```js
import assert from 'node:assert/strict';
import { buildShowsFromDbEpisodes } from '../src/lib/media/dbSeriesAdapter.js';

const seriesRows = [
  { id: 1, series_id: 'm3u-show-bb', name: 'Breaking Bad', cover: 'http://logo/bb.png', group_title: 'Series' },
];
const episodeRows = [
  { id: 11, series_key: 'm3u-show-bb', season: 1, episode: 2, name: 'Breaking Bad S01E02', title: 'Cat', stream_url: 'http://x/s1e2.mkv', logo: null, group_title: 'Series' },
  { id: 10, series_key: 'm3u-show-bb', season: 1, episode: 1, name: 'Breaking Bad S01E01', title: 'Pilot', stream_url: 'http://x/s1e1.mkv', logo: null, group_title: 'Series' },
  { id: 12, series_key: 'm3u-show-bb', season: 2, episode: 1, name: 'Breaking Bad S02E01', title: '', stream_url: 'http://x/s2e1.mkv', logo: null, group_title: 'Series' },
  // Orphan episode with no matching show row — must still produce a show.
  { id: 20, series_key: 'm3u-show-x', season: 1, episode: 1, name: 'Orphan S01E01', title: '', stream_url: 'http://x/o1.mkv', logo: 'http://logo/o.png', group_title: 'Series' },
];

const shows = buildShowsFromDbEpisodes(seriesRows, episodeRows, 'pl1');

assert.equal(shows.length, 2);
const bb = shows.find((s) => s.show === 'Breaking Bad');
assert.equal(bb.key, 'm3u-show-bb');
assert.equal(bb.poster, 'http://logo/bb.png');
assert.deepEqual(bb.seasonNumbers, [1, 2]);
assert.equal(bb.episodeCount, 3);
// Ordered flat episode list, MediaItem contract for the player.
assert.deepEqual(bb.episodes.map((e) => [e._season, e._episode]), [[1, 1], [1, 2], [2, 1]]);
assert.equal(bb.episodes[0].url, 'http://x/s1e1.mkv');
assert.equal(bb.episodes[0].type, 'series');
assert.ok(bb.episodes[0].id != null);
assert.equal(bb.episodes[0]._epTitle, 'Pilot');
assert.ok(bb.seasons instanceof Map);
assert.equal(bb.seasons.get(1).length, 2);

const orphan = shows.find((s) => s.key === 'm3u-show-x');
assert.equal(orphan.show, 'Orphan S01E01');
assert.equal(orphan.poster, 'http://logo/o.png');

// Empty inputs are safe.
assert.deepEqual(buildShowsFromDbEpisodes([], [], 'pl1'), []);

console.log('OK: db-series-adapter');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/db-series-adapter.test.mjs`
Expected: FAIL with `Cannot find module .../dbSeriesAdapter.js`

- [ ] **Step 3: Write `src/lib/media/dbSeriesAdapter.js`**

```js
/**
 * src/lib/media/dbSeriesAdapter.js
 *
 * Builds grouped Show objects (the exact shape groupSeries emits) from the
 * SQLite series + series_episodes tables written by M3U ingestion, so
 * SeriesDetailOverlay / playSeriesEpisode work unchanged on DB-backed data.
 */

import { toMediaItem } from './mediaAdapter.js';

/**
 * @param {Array<Object>} seriesRows   Rows from the `series` table (show metadata)
 * @param {Array<Object>} episodeRows  Rows from `series_episodes`
 * @param {string} playlistId
 * @returns {Array<Object>} Shows sorted by name — same shape as groupSeries()
 */
export function buildShowsFromDbEpisodes(seriesRows, episodeRows, playlistId) {
  const meta = new Map((seriesRows || []).map((r) => [String(r.series_id), r]));
  const shows = new Map();

  for (const row of episodeRows || []) {
    const key = String(row.series_key);
    if (!shows.has(key)) {
      const m = meta.get(key);
      shows.set(key, {
        key,
        show: (m && m.name) || row.name || 'Unknown Show',
        poster: (m && m.cover) || row.logo || null,
        group: row.group_title || 'Series',
        seasons: new Map(),
        episodes: [],
      });
    }
    const showObj = shows.get(key);
    if (!showObj.poster && row.logo) showObj.poster = row.logo;

    const mediaItem = toMediaItem({ ...row, type: 'series' }, playlistId);
    const epObj = {
      ...mediaItem,
      _season: row.season ?? 1,
      _episode: row.episode ?? 0,
      _epTitle: row.title || '',
    };
    showObj.episodes.push(epObj);
    if (!showObj.seasons.has(epObj._season)) showObj.seasons.set(epObj._season, []);
    showObj.seasons.get(epObj._season).push(epObj);
  }

  for (const showObj of shows.values()) {
    for (const eps of showObj.seasons.values()) eps.sort((a, b) => a._episode - b._episode);
    showObj.episodes.sort((a, b) => a._season - b._season || a._episode - b._episode);
    showObj.seasonNumbers = [...showObj.seasons.keys()].sort((a, b) => a - b);
    showObj.episodeCount = showObj.episodes.length;
  }

  return [...shows.values()].sort((a, b) => a.show.localeCompare(b.show));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/db-series-adapter.test.mjs`
Expected: `OK: db-series-adapter`

- [ ] **Step 5: Update `src/components/VODLibrary.jsx`**

5a. Add the import:

```js
import { buildShowsFromDbEpisodes } from '../lib/media/dbSeriesAdapter.js';
```

5b. Add state next to `categoryData` (`const [categoryData, setCategoryData] = useState({});`):

```js
  // Series-only: per-category DB payload { rows: series[], episodes: series_episodes[] }.
  const [seriesDbData, setSeriesDbData] = useState({});
```

5c. In `loadCategories`, replace the eager-load `entries` block (the `const entries = await Promise.all(...)` through `setCategoryData(...)`) with:

```js
      const initialCats = mergedCats.slice(0, 5);
      const dbSeriesEntries = {};
      const entries = await Promise.all(initialCats.map(async (cat) => {
        let items = [];
        if (dbCats.includes(cat) && window.electronDB) {
          try {
            items = (isMovies
              ? await window.electronDB.getVODsByCategory(activePlaylistId, cat, 50, 0)
              : await window.electronDB.getSeriesByCategory(activePlaylistId, cat, 50, 0)) || [];
            if (!isMovies && typeof window.electronDB.getSeriesEpisodesByCategory === 'function') {
              const episodes = (await window.electronDB.getSeriesEpisodesByCategory(activePlaylistId, cat, 5000, 0)) || [];
              dbSeriesEntries[cat] = { rows: items, episodes };
            }
          } catch (e) {
            console.warn('[VODLibrary] DB item fetch failed (non-fatal):', e);
          }
        }
        if (storeGroups[cat]) {
          // DB rows win; drop store items whose stream URL the DB already has.
          const dbUrls = new Set(items.map((i) => i.stream_url).filter(Boolean));
          items = [...items, ...storeGroups[cat].filter((it) => {
            const u = it.streamUrl || it.url || it.stream_url;
            return !u || !dbUrls.has(u);
          })];
        }
        return [cat, items];
      }));
      setSeriesDbData(dbSeriesEntries);
      setCategoryData(Object.fromEntries(entries));
```

5d. Replace the body of `loadCategory` (scroll-time lazy load) with the same pattern:

```js
  const loadCategory = useCallback(async (category) => {
    if (categoryData[category]) return;

    let items = [];
    if (activePlaylistId && window.electronDB) {
      try {
        items = (isMovies
          ? await window.electronDB.getVODsByCategory(activePlaylistId, category, 50, 0)
          : await window.electronDB.getSeriesByCategory(activePlaylistId, category, 50, 0)) || [];
        if (!isMovies && typeof window.electronDB.getSeriesEpisodesByCategory === 'function') {
          const episodes = (await window.electronDB.getSeriesEpisodesByCategory(activePlaylistId, category, 5000, 0)) || [];
          setSeriesDbData((prev) => ({ ...prev, [category]: { rows: items, episodes } }));
        }
      } catch (e) {
        // Might not exist in DB
      }
    }

    const storeItems = isMovies ? media.movies : media.series;
    const dbUrls = new Set(items.map((i) => i.stream_url).filter(Boolean));
    const storeMatches = storeItems.filter((item) => {
      if ((item.group || 'Uncategorized') !== category) return false;
      const u = item.streamUrl || item.url || item.stream_url;
      return !u || !dbUrls.has(u);
    });
    if (storeMatches.length > 0) {
      items = [...items, ...storeMatches];
    }

    setCategoryData(prev => ({ ...prev, [category]: items }));
  }, [activePlaylistId, isMovies, categoryData, media]);
```

5e. Replace the `groupedCategoryData` memo with:

```js
  const groupedCategoryData = useMemo(() => {
    if (isMovies) return categoryData;
    const out = {};
    for (const [cat, items] of Object.entries(categoryData)) {
      const dbData = seriesDbData[cat];
      const dbEpisodes = (dbData && dbData.episodes) || [];

      // M3U path: structured episode rows exist → build shows from the DB.
      const dbShows = dbEpisodes.length > 0
        ? buildShowsFromDbEpisodes(dbData.rows, dbEpisodes, activePlaylistId)
        : [];

      // Fallback (Xtream show rows without episodes + in-memory store items),
      // minus anything the DB shows already cover.
      const coveredKeys = new Set(dbEpisodes.map((e) => String(e.series_key)));
      const dbEpUrls = new Set(dbEpisodes.map((e) => e.stream_url).filter(Boolean));
      const fallbackItems = items.filter((it) => {
        if (it.series_id != null && coveredKeys.has(String(it.series_id))) return false;
        const u = it.streamUrl || it.url || it.stream_url;
        return !u || !dbEpUrls.has(u);
      });

      out[cat] = [...dbShows, ...groupSeries(fallbackItems)]
        .sort((a, b) => a.show.localeCompare(b.show));
    }
    return out;
  }, [categoryData, seriesDbData, isMovies, activePlaylistId]);
```

- [ ] **Step 6: Verify the renderer builds and logic tests still pass**

Run: `npm run build && node tests/db-series-adapter.test.mjs`
Expected: build succeeds; `OK: db-series-adapter`.

- [ ] **Step 7: Commit**

```bash
git add src/lib/media/dbSeriesAdapter.js src/components/VODLibrary.jsx tests/db-series-adapter.test.mjs
git commit -m "feat(vod): DB-backed series shows for M3U + dedupe DB vs store items"
```

---

### Task 7: DB_VOD_PARITY observational diagnostic

**Files:**
- Modify: `src/config/featureFlags.js`
- Create: `src/lib/media/vodParity.js`
- Modify: `src/supreme_layout.jsx` (inside the `.syncPlaylist(...).then(...)` block, next to the existing `DB_CHANNEL_PARITY` call)
- Test: `tests/vod-parity.test.mjs`

**Interfaces:**
- Consumes: `window.electronDB.getMediaStats` (Task 3), `useAppStore` media state.
- Produces: `DB_VOD_PARITY: boolean` flag (default on in dev, off in prod, `VITE_DB_VOD_PARITY` override — identical pattern to `DB_CHANNEL_PARITY`); `compareVodParity({ rendererMovieCount, rendererEpisodeCount, dbStats }) -> { moviesMatch, episodesMatch, deltas }` (pure); `runVodParityCheck({ playlistId }) -> Promise<Object|null>` (reads store, calls IPC, logs, never throws).

- [ ] **Step 1: Write the failing test (pure comparator only)**

`tests/vod-parity.test.mjs`:

```js
import assert from 'node:assert/strict';
import { compareVodParity } from '../src/lib/media/vodParity.js';

const match = compareVodParity({
  rendererMovieCount: 10,
  rendererEpisodeCount: 30,
  dbStats: { vodCount: 10, seriesCount: 4, episodeCount: 30 },
});
assert.equal(match.moviesMatch, true);
assert.equal(match.episodesMatch, true);
assert.deepEqual(match.deltas, { movies: 0, episodes: 0 });

const drift = compareVodParity({
  rendererMovieCount: 10,
  rendererEpisodeCount: 28,
  dbStats: { vodCount: 12, seriesCount: 4, episodeCount: 30 },
});
assert.equal(drift.moviesMatch, false);
assert.equal(drift.episodesMatch, false);
assert.deepEqual(drift.deltas, { movies: 2, episodes: 2 });

// Missing stats (IPC failed) — safe, reports non-match without throwing.
const none = compareVodParity({ rendererMovieCount: 1, rendererEpisodeCount: 1, dbStats: null });
assert.equal(none.moviesMatch, false);

console.log('OK: vod-parity');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node tests/vod-parity.test.mjs`
Expected: FAIL with `Cannot find module .../vodParity.js`

- [ ] **Step 3: Write `src/lib/media/vodParity.js`**

```js
/**
 * src/lib/media/vodParity.js
 *
 * Observational parity diagnostic for the M3U → SQLite VOD/Series pipeline,
 * mirroring the Live TV DB_CHANNEL_PARITY precedent (dbChannelAdapter.js):
 * compares DB-backed counts against renderer-classified counts after a sync.
 * Log-only; never throws, never mutates state, changes no behavior.
 *
 * NOTE: store/logger are imported lazily inside runVodParityCheck so the pure
 * comparator stays importable from plain-node test scripts.
 */

/**
 * Pure comparison — exported for tests.
 *
 * @param {Object} args
 * @param {number} args.rendererMovieCount   media.movies.length
 * @param {number} args.rendererEpisodeCount media.series.length (flat episodes)
 * @param {{vodCount:number, seriesCount:number, episodeCount:number}|null} args.dbStats
 */
export function compareVodParity({ rendererMovieCount, rendererEpisodeCount, dbStats }) {
  const stats = dbStats || { vodCount: -1, seriesCount: -1, episodeCount: -1 };
  return {
    moviesMatch: stats.vodCount === rendererMovieCount,
    episodesMatch: stats.episodeCount === rendererEpisodeCount,
    deltas: {
      movies: Math.abs(stats.vodCount - rendererMovieCount),
      episodes: Math.abs(stats.episodeCount - rendererEpisodeCount),
    },
  };
}

/**
 * Runs the diagnostic against the current appStore media state.
 * @param {Object} args
 * @param {string} args.playlistId
 * @returns {Promise<Object|null>} result, or null when unavailable
 */
export async function runVodParityCheck({ playlistId }) {
  try {
    if (typeof window === 'undefined' || !window.electronDB ||
        typeof window.electronDB.getMediaStats !== 'function' || !playlistId) {
      return null;
    }
    const [{ useAppStore }, { logger }] = await Promise.all([
      import('../../store/appStore.js'),
      import('../logger.js'),
    ]);
    const dbStats = await window.electronDB.getMediaStats(playlistId);
    const { media } = useAppStore.getState();
    const rendererMovieCount = (media && media.movies && media.movies.length) || 0;
    const rendererEpisodeCount = (media && media.series && media.series.length) || 0;

    const result = compareVodParity({ rendererMovieCount, rendererEpisodeCount, dbStats });

    logger.info('[VodParity] ── DB VOD/Series parity check ──');
    logger.info(`[VodParity] Movies:   renderer=${rendererMovieCount} sqlite=${dbStats ? dbStats.vodCount : 'n/a'} match=${result.moviesMatch ? 'YES' : 'NO'}`);
    logger.info(`[VodParity] Episodes: renderer=${rendererEpisodeCount} sqlite=${dbStats ? dbStats.episodeCount : 'n/a'} match=${result.episodesMatch ? 'YES' : 'NO'} (shows=${dbStats ? dbStats.seriesCount : 'n/a'})`);

    try {
      if (window.electronLog) {
        window.electronLog.write(
          result.moviesMatch && result.episodesMatch ? 'info' : 'warn',
          `[VodParity] movies r=${rendererMovieCount}/db=${dbStats?.vodCount} episodes r=${rendererEpisodeCount}/db=${dbStats?.episodeCount}`
        );
      }
    } catch { /* logging must never affect behavior */ }

    return result;
  } catch (err) {
    // console, not logger — the failure may predate the lazy logger import.
    console.error('[VodParity] check failed (non-fatal):', err);
    return null;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `node tests/vod-parity.test.mjs`
Expected: `OK: vod-parity`

- [ ] **Step 5: Add the flag and wire the call site**

In `src/config/featureFlags.js`, after the `DB_CHANNEL_PARITY` export add:

```js
/**
 * When true, emits DB-vs-renderer VOD/Series parity diagnostics after an M3U
 * sync (see src/lib/media/vodParity.js). Purely observational (log only).
 * Defaults ON in dev, OFF in production; forceable with
 * `VITE_DB_VOD_PARITY=true` / `=false`.
 */
export const DB_VOD_PARITY = (() => {
  try {
    const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined;
    if (!env) return false;
    if (env.VITE_DB_VOD_PARITY === 'true') return true;
    if (env.VITE_DB_VOD_PARITY === 'false') return false;
    return Boolean(env.DEV); // default: on in dev only
  } catch {
    return false;
  }
})();
```

and add `DB_VOD_PARITY,` to the `featureFlags` object.

In `src/supreme_layout.jsx`:
- extend the existing flags import: `import { DB_CHANNEL_PARITY, USE_DB_CHANNELS, DB_VOD_PARITY } from "./config/featureFlags.js";`
- add the import: `import { runVodParityCheck } from './lib/media/vodParity.js';`
- directly after the existing `if (DB_CHANNEL_PARITY) { runChannelParityCheck(...) }` block, add:

```js
             // ── VOD/Series parity diagnostics (observational) ────────────
             if (DB_VOD_PARITY) {
               runVodParityCheck({ playlistId: playlist.id }).catch(() => {});
             }
```

- [ ] **Step 6: Verify build**

Run: `npm run build`
Expected: success.

- [ ] **Step 7: Commit**

```bash
git add src/config/featureFlags.js src/lib/media/vodParity.js src/supreme_layout.jsx tests/vod-parity.test.mjs
git commit -m "feat(diagnostics): DB_VOD_PARITY observational check for M3U VOD/Series pipeline"
```

---

### Task 8: End-to-end verification in real Electron + full test sweep

**Files:**
- None created (verification only; fix regressions found, committing each fix separately).

- [ ] **Step 1: Run the full scripted test sweep**

```bash
node tests/shared-media.test.mjs && \
node tests/m3u-routing.test.mjs && \
node tests/db-series-adapter.test.mjs && \
node tests/vod-parity.test.mjs && \
ELECTRON_RUN_AS_NODE=1 npx electron tests/migrations.test.cjs && \
ELECTRON_RUN_AS_NODE=1 npx electron tests/db-episodes.test.cjs && \
ELECTRON_RUN_AS_NODE=1 npx electron tests/integration.sync-m3u.test.cjs
```

Expected: seven `OK:` lines.

- [ ] **Step 2: Launch the real app** (per the repo's runtime-testing contract: strip `ELECTRON_RUN_AS_NODE` from the environment before launching)

```bash
npm run build
env -u ELECTRON_RUN_AS_NODE npx electron ./electron/main.cjs
```

Serve `tests/fixtures/mixed.m3u` locally first (`npx http-server tests/fixtures -p 8765` or `node -e "require('http').createServer((q,s)=>s.end(require('fs').readFileSync('tests/fixtures/mixed.m3u','utf8'))).listen(8765)"` in a second terminal), then add `http://127.0.0.1:8765/mixed.m3u` as an M3U source in the app.

- [ ] **Step 3: Verify against the checklist**

1. Live TV tab shows exactly CNN + ESPN HD (movies/series rows no longer pollute `channels`).
2. Movies tab: "Inception (2010)" and "Interstellar (2014)" render with DB-backed categories ("VOD Movies", "General").
3. Opening Inception → Play starts playback resolving the direct `stream_url` (network request to `http://fixture/movie/...` — a failed connection is fine, the URL being requested is the assertion).
4. Series tab: "Breaking Bad" appears as ONE show card (2 episodes, S01E01/S01E02 across two naming conventions) and "The Office" as another; the detail overlay lists seasons/episodes; pressing an episode routes into the player with the episode's `stream_url`.
5. Dev console shows `[VodParity]` lines after sync; counts match (`match=YES` for movies and episodes) — this is the cutover gate.
6. An existing Xtream source (if configured) still loads Movies/Series exactly as before (no schema/behavior regression).
7. Migration on a real profile DB: the existing `%APPDATA%/matrix_iptv.db` opens with `[DB] Migrated schema from v0 to v1.` logged once, and never again on subsequent launches.

- [ ] **Step 4: Final review + branch finish**

Use superpowers:requesting-code-review for a whole-branch review (`git diff fix/sqlite-refresh-sync...HEAD`), fix findings, then follow superpowers:finishing-a-development-branch.

---

## Self-Review Notes (performed at plan time)

- **Spec coverage:** migration → Task 2; shared classifier → Task 1; ingestion routing → Tasks 4–5; episode storage → Tasks 2–3; playback via `stream_url` → existing `VODDetailOverlay` order + Task 6 episode MediaItems (`url` = `stream_url`); parity → Task 7; E2E on both naming conventions → fixture in Task 5 + Task 8.
- **Type consistency:** episode row fields (`series_key, season, episode, name, title, stream_url, logo, group_title`) are identical across migration DDL (Task 2), insert statement (Task 3), routing output (Task 4), and adapter input (Task 6). `seriesRows.series_id` = `episodeRows.series_key` = `m3uSeriesKey(show)`.
- **Known accepted risk:** dynamic `import()` of `electron/shared/*.mjs` from the packaged asar requires Electron ≥28 ESM support (repo uses 31). If the portable build ever fails to resolve the `.mjs` files, the fallback is inlining a CJS copy — but verify the packaged build (`npm run make:exe`) before shipping a release, not as part of this plan's tasks.
