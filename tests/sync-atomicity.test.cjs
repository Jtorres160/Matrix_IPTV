// A mid-sync failure must not leave some media tables updated and others stale.
// syncPlaylistMediaTables clears+inserts all four M3U tables (channels, vod,
// series, series_episodes) in ONE transaction, so a throw partway through rolls
// the whole thing back to the pre-sync state.
const assert = require('node:assert/strict');
const db = require('../electron/db.cjs');

db.initDatabase(':memory:');
db.upsertPlaylist({ id: 'pl1', profile_id: 'prof1', name: 'Fixture', type: 'm3u', url: 'http://x/1.m3u' });

const raw = db.getDatabase();
const count = (table) => raw.prepare(`SELECT COUNT(*) c FROM ${table} WHERE playlist_id='pl1'`).get().c;

// A good first sync: 2 of each, 3 episodes.
const good = {
  liveChannels: [
    { name: 'CNN', stream_url: 'http://x/live/1.ts', group_title: 'News' },
    { name: 'ESPN', stream_url: 'http://x/live/2.ts', group_title: 'Sports' },
  ],
  vodRows: [
    { stream_id: 'm3u-a', name: 'A (2020)', stream_url: 'http://x/movie/a.mkv', group_title: 'Movies' },
    { stream_id: 'm3u-b', name: 'B (2021)', stream_url: 'http://x/movie/b.mkv', group_title: 'Movies' },
  ],
  seriesRows: [
    { series_id: 'm3u-show-1', name: 'Show One', group_title: 'Series' },
    { series_id: 'm3u-show-2', name: 'Show Two', group_title: 'Series' },
  ],
  episodeRows: [
    { series_key: 'm3u-show-1', season: 1, episode: 1, name: 'S1', stream_url: 'http://x/s/1.mkv', group_title: 'Series' },
    { series_key: 'm3u-show-1', season: 1, episode: 2, name: 'S2', stream_url: 'http://x/s/2.mkv', group_title: 'Series' },
    { series_key: 'm3u-show-2', season: 1, episode: 1, name: 'S3', stream_url: 'http://x/s/3.mkv', group_title: 'Series' },
  ],
};

const first = db.syncPlaylistMediaTables('pl1', good);
assert.deepEqual(
  { ch: count('channels'), vod: count('vod_streams'), ser: count('series'), ep: count('series_episodes') },
  { ch: 2, vod: 2, ser: 2, ep: 3 },
);
assert.deepEqual(first, { inserted: 2, insertedVOD: 2, insertedSeries: 2, insertedEpisodes: 3 });

// A bad re-sync: valid channels/vod/series, but an episode row whose series_key
// is undefined forces a bind-time throw at the LAST table.
const bad = {
  liveChannels: [{ name: 'NEW', stream_url: 'http://x/live/new.ts', group_title: 'News' }],
  vodRows: [{ stream_id: 'm3u-c', name: 'C (2022)', stream_url: 'http://x/movie/c.mkv', group_title: 'Movies' }],
  seriesRows: [{ series_id: 'm3u-show-3', name: 'Show Three', group_title: 'Series' }],
  episodeRows: [
    { series_key: undefined, season: 1, episode: 1, name: 'BadRow', stream_url: 'http://x/s/bad.mkv', group_title: 'Series' },
  ],
};

assert.throws(() => db.syncPlaylistMediaTables('pl1', bad), 'a bad episode row must throw');

// The whole sync rolled back: the first three tables still hold the ORIGINAL
// data, not the partial re-sync, and episode count is unchanged.
assert.deepEqual(
  { ch: count('channels'), vod: count('vod_streams'), ser: count('series'), ep: count('series_episodes') },
  { ch: 2, vod: 2, ser: 2, ep: 3 },
  'a mid-sync failure must leave every table at its pre-sync state',
);
assert.equal(raw.prepare(`SELECT COUNT(*) c FROM channels WHERE name='NEW'`).get().c, 0, 'partial insert must not survive');

console.log('OK: sync-atomicity');
