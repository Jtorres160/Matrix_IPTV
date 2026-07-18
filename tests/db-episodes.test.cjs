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
