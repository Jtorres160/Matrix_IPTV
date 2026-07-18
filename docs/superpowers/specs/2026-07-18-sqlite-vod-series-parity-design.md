# SQLite VOD/Series Parity for M3U Sources — Design Spec

**Date:** 2026-07-18
**Status:** Approved (locked decisions from build brief)
**Branch:** `feat/sqlite-vod-series-parity` (off `fix/sqlite-refresh-sync`, which contains the classifier hardening this depends on)

## Problem

SQLite's `vod_streams` / `series` tables are only ever populated by `syncXtreamPlaylist`
(electron/ipcHandlers.cjs). A plain M3U playlist never gets Movies/Series rows written to
the database at all — `syncM3UPlaylist` writes every parsed entry into `channels`, and the
Movies/Series tabs depend entirely on the renderer-side keyword classifier
(`src/lib/media/mediaClassifier.js`) plus a render-time regroup
(`src/lib/media/seriesGrouping.js`). Xtream sources get DB-backed categories, pagination,
and instant loads; M3U sources don't.

**Goal:** give M3U the same SQLite-backed path Xtream already has, without changing any
Xtream behavior.

## Locked Decisions

1. **Additive schema migration only** — versioned via `PRAGMA user_version`, backward
   compatible. Existing Xtream rows/behavior must not change.
2. **`vod_streams` gets a nullable `stream_url` column.** Xtream leaves it null and keeps
   reconstructing the URL from `stream_id` + credentials as today; M3U rows populate it
   directly (there is no username/password/id pattern to reconstruct from).
3. **New `series_episodes` table** `(playlist_id, series_key, season, episode, name,
   title, stream_url, logo, group_title)`. The `series` table stores only show-level
   metadata; Xtream fetches episodes per-series on demand, which doesn't fit M3U's flat
   episode list. M3U ingestion writes structured episode rows directly. Xtream never
   writes this table.
4. **Classification logic must not fork.** The just-fixed
   `src/lib/media/mediaClassifier.js` heuristics and the `seriesGrouping.js` parser move
   to `electron/shared/*.mjs` (packaged — electron-builder ships `electron/**`; `src/`
   is NOT packaged). The renderer keeps its import paths via one-line re-export shims;
   the CJS main process loads the same files via dynamic `import(pathToFileURL(...))`.
   One classifier, literally shared.
5. **Playback resolution prefers `stream_url` when present** (M3U), falling back to the
   existing Xtream reconstruction when absent. `VODDetailOverlay.handlePlayClick` already
   implements exactly this order (`item.streamUrl || item.url || item.stream_url` first,
   Xtream URL-build second) — the fix is making the column flow through the query path.
6. **Verification mirrors the `DB_CHANNEL_PARITY` precedent**
   (`src/config/featureFlags.js` + `src/lib/tv/dbChannelAdapter.js`): a new
   `DB_VOD_PARITY` flag (default on in dev, off in prod, env-overridable) drives an
   observational, non-fatal diagnostic comparing DB-backed counts against
   renderer-classified counts after each M3U sync.

## Architecture

```
M3U text ──parseM3UChannels──> parsed entries
                                    │
                       routeM3UItems (electron/shared/m3uRouting.mjs)
                       uses classifyMedia + parseEpisode + stable keys
                                    │
        ┌──────────────┬────────────┴──────────────┬────────────────┐
        ▼              ▼                           ▼                ▼
    channels       vod_streams               series (show rows)  series_episodes
   (live only)   (+ stream_url)             series_id=series_key  (episode rows)
```

### Identity

M3U entries have no provider IDs. Stable, content-derived keys (djb2 hash, hex):

- movie `stream_id` = `m3u-<hash(stream_url)>`
- show `series_id` / episode `series_key` = `m3u-show-<hash(normalized show name)>`

Stable across resyncs (derived from content, not insertion order).

### Classification routing rule

`classifyMedia` runs in the main process during sync. Entries route to `vod_streams` /
`series`+`series_episodes` only when `confidence >= 0.5` — the same threshold
`toMediaItem` uses to demote low-confidence guesses to `unsorted` — otherwise they stay
in `channels` (today's behavior). Series shows/episodes derive from
`parseEpisode(name)`; unparseable series-classified names become single-episode shows
(season 1, episode 0), mirroring `groupSeries`.

### Renderer read path

- **Movies:** unchanged query path (`getVODsByCategory`), now returning `stream_url` for
  M3U rows. `VODLibrary` dedupes DB rows vs. in-memory store items by stream URL so
  titles don't double up while both paths are alive.
- **Series:** new IPC `getSeriesEpisodesByCategory(playlistId, groupTitle, limit, offset)`.
  A new renderer adapter `buildShowsFromDbEpisodes(seriesRows, episodeRows, playlistId)`
  produces the exact show shape `groupSeries` emits (`{ key, show, poster, group,
  seasons: Map, seasonNumbers, episodes, episodeCount }`) with each episode a full
  MediaItem (via `toMediaItem`, `type: 'series'`, `url = stream_url`), so
  `SeriesDetailOverlay` and `playSeriesEpisode` work unchanged. Xtream series rows (no
  episode rows) keep the existing `groupSeries` fallback path.

### Parity diagnostic

New `db:getMediaStats(playlistId)` IPC returns `{ vodCount, seriesCount, episodeCount }`.
`src/lib/media/vodParity.js` compares those against the renderer store's
`media.movies.length` / `media.series.length` after an M3U sync, logging
`[VodParity] ...` lines (console + persistent electron log), never throwing, never
changing behavior. Wired next to the existing `DB_CHANNEL_PARITY` call in
`supreme_layout.jsx`.

## Out of Scope

- Cutover of `VODLibrary` away from the in-memory store entirely (store merge stays as
  the fallback; removal happens after parity proves out in the field).
- Xtream episode ingestion into `series_episodes` (Xtream keeps on-demand fetch).
- Identity migration for favorites/watch history of VOD items.
- Full-text VOD search.

## Testing Strategy

No test runner exists in this repo. Tests are plain `node:assert` scripts in `tests/`:

- **Pure logic** (classifier shims, keys, routing, show building): run with `node`.
- **DB layer** (migrations, episode statements, sync integration): run with
  `ELECTRON_RUN_AS_NODE=1 npx electron <script>` so `better-sqlite3` loads against the
  ABI it was built for. `db.cjs` gains an optional `initDatabase(dbPathOverride)`
  parameter (`':memory:'` in tests) since `app.getPath` is unavailable in that mode.
- **Sync integration**: a local `http.createServer` serves a synthetic fixture M3U
  containing both Xtream-style paths (`/movie/`, `/series/`) and generic-provider naming
  (plain `.mkv` + year-in-title movies, `SxxExx` / `1x01` / spelled-out episodes, live
  `.m3u8`/`.ts`) — that generic-provider gap is the thing being closed.
- **End-to-end**: real Electron launch (strip `ELECTRON_RUN_AS_NODE`), synthetic M3U
  source, verify Movies/Series tabs render DB-backed content and playback resolves
  `stream_url` directly; confirm `[VodParity]` output.
