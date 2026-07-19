import assert from 'node:assert/strict';
import { buildShowsFromDbEpisodes, fetchAllSeriesEpisodes } from '../src/lib/media/dbSeriesAdapter.js';

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

// fetchAllSeriesEpisodes pages past the per-call IPC cap — a category with
// more episodes than one page must not silently drop shows.
{
  const all = Array.from({ length: 2500 }, (_, i) => ({ id: i }));
  const calls = [];
  const fetchPage = async (plid, cat, limit, offset) => {
    calls.push([plid, cat, limit, offset]);
    return all.slice(offset, offset + limit);
  };
  const rows = await fetchAllSeriesEpisodes(fetchPage, 'pl1', 'Series', 1000);
  assert.equal(rows.length, 2500);
  assert.deepEqual(rows.map((r) => r.id).slice(0, 3), [0, 1, 2]);
  assert.equal(rows[2499].id, 2499);
  assert.deepEqual(calls, [
    ['pl1', 'Series', 1000, 0],
    ['pl1', 'Series', 1000, 1000],
    ['pl1', 'Series', 1000, 2000],
  ]);

  // A single short page stops after one call.
  const one = await fetchAllSeriesEpisodes(async () => [{ id: 'a' }], 'pl1', 'Series', 1000);
  assert.equal(one.length, 1);

  // A null page (failed IPC) is safe and returns what was collected.
  const none = await fetchAllSeriesEpisodes(async () => null, 'pl1', 'Series', 1000);
  assert.deepEqual(none, []);
}

console.log('OK: db-series-adapter');
