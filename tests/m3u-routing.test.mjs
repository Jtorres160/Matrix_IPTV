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
