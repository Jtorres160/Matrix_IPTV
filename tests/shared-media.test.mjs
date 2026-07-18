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

// Spelled-out episode markers with dot/underscore separators (common in real
// M3U file names) must classify as series, not fall through to the movie
// extension heuristic — and must stay in lockstep with seriesGrouping's
// SPELLED_RE so classifier and grouper agree on the same rows.
assert.equal(classifyMedia({ name: 'The.Office.Season.2.Episode.3.mp4', stream_url: 'http://x/files/8821.mp4' }).type, 'series');
assert.equal(classifyMedia({ name: 'Show_Name_Season_1_Ep_2.mkv', stream_url: 'http://x/files/8822.mkv' }).type, 'series');
assert.equal(classifyMedia({ name: 'Dark-Season-3-Episode-8.avi', stream_url: 'http://x/files/8823.avi' }).type, 'series');
assert.equal(parseEpisode('The.Office.Season.2.Episode.3').show, 'The Office');

assert.match(contentHash('abc'), /^[0-9a-f]{8}$/);
assert.equal(contentHash('abc'), contentHash('abc'), 'hash must be deterministic');
assert.notEqual(contentHash('abc'), contentHash('abd'));
assert.equal(m3uStreamId('http://x/1.mkv'), `m3u-${contentHash('http://x/1.mkv')}`);
assert.equal(m3uSeriesKey('  Breaking   Bad '), m3uSeriesKey('breaking bad'), 'series key must normalize case/whitespace');

console.log('OK: shared-media');
