// Provider-style coverage for the "movies & shows don't display" bug:
//  1. classifyMedia must honor an explicit tvg-type attribute.
//  2. The movie-extension check must not substring-match ".mov" inside
//     channel slugs like "fox.movies.rs.m3u8" (live channels were landing
//     in the Movies tab).
//  3. Multi-list providers (starlite-style /api/list/<u>/<p>/<fmt>/livetv)
//     must expand to their /movies and /tvshows sibling lists.
//  4. Both M3U parsers must extract tvg-type so 1) has data to work with.
//  5. Series routing must not create one category per show when the
//     provider sets group-title to the show name itself.
import assert from 'node:assert/strict';
import { classifyMedia } from '../electron/shared/mediaClassifier.mjs';
import { expandPlaylistUrls } from '../electron/shared/multiListProvider.mjs';
import { routeM3UItems } from '../electron/shared/m3uRouting.mjs';
import { parseM3UChannels as parseRenderer } from '../src/lib/m3u/m3uParser.js';

// ── 1. tvg-type is authoritative ─────────────────────────────────────────────
assert.deepEqual(
  classifyMedia({ name: 'FOX Movies', tvg_type: 'live', stream_url: 'https://s/api/stream/u/p/livetv.epg/fox.movies.rs.m3u8' }),
  { type: 'live', confidence: 1.0 }
);
assert.equal(
  classifyMedia({ name: 'Avatar', tvg_type: 'movies', stream_url: 'https://s/api/stream/u/p/movie/tt18259538' }).type,
  'movie'
);
assert.equal(
  classifyMedia({ name: 'Foundation S02 E05', tvgType: 'tvshows', stream_url: 'https://s/api/stream/u/p/tvshow/tt1/2/5' }).type,
  'series'
);

// ── 2. extension check anchors to the end of the URL path ────────────────────
// "fox.movies.rs.m3u8" contains ".mov" as a substring — must stay live.
const foxLive = classifyMedia({ name: 'FOX Movies', group_title: 'EX-YU', stream_url: 'https://s/api/stream/u/p/livetv.epg/fox.movies.rs.m3u8' });
assert.equal(foxLive.type, 'live', 'live channel with ".movies." in slug must not become a movie');
// Real file extensions (with or without a query string) still classify as movie.
assert.equal(classifyMedia({ name: 'Some Film', group_title: 'X', stream_url: 'http://p/get/777/file.mkv' }).type, 'movie');
assert.equal(classifyMedia({ name: 'Some Film', group_title: 'X', stream_url: 'http://p/get/777/file.mp4?token=abc' }).type, 'movie');

// ── 3. starlite-style URL expansion ──────────────────────────────────────────
const expanded = expandPlaylistUrls('https://starlite.best/api/list/user/pass/m3u8/livetv');
assert.equal(expanded.length, 3);
assert.deepEqual(expanded.map((e) => e.kind), ['live', 'movies', 'tvshows']);
assert.equal(expanded[0].url, 'https://starlite.best/api/list/user/pass/m3u8/livetv');
assert.equal(expanded[1].url, 'https://starlite.best/api/list/user/pass/m3u8/movies');
assert.equal(expanded[2].url, 'https://starlite.best/api/list/user/pass/m3u8/tvshows');
assert.ok(expanded[0].required && !expanded[1].required && !expanded[2].required,
  'only the original list is required; siblings are best-effort');

// Trailing slash tolerated; case preserved in credentials.
assert.equal(expandPlaylistUrls('http://h/api/list/User1/Pw2/m3u/livetv/').length, 3);

// Anything else passes through untouched.
assert.deepEqual(expandPlaylistUrls('http://host/get.php?username=a&password=b&type=m3u_plus'),
  [{ url: 'http://host/get.php?username=a&password=b&type=m3u_plus', kind: 'any', required: true }]);
assert.deepEqual(expandPlaylistUrls('https://starlite.best/api/list/user/pass/m3u8/movies').length, 1,
  'a movies-only URL is not expanded');

// ── 4. parsers extract tvg-type ──────────────────────────────────────────────
const m3u = `#EXTM3U
#EXTINF:-1 tvg-id="fox.movies.rs" tvg-type="live" group-title="EX-YU" tvg-logo="https://m/fox.png",FOX Movies
https://s/api/stream/u/p/livetv.epg/fox.movies.rs.m3u8
#EXTINF:-1 tvg-id="tt18259538" tvg-type="movies" group-title="Movies 2026" ,Avatar
https://s/api/stream/u/p/movie/tt18259538
#EXTINF:-1 tvg-id="tt8622160" tvg-type="tvshows" group-title="Star Trek: Starfleet Academy (2026)" ,Star Trek: Starfleet Academy (2026) S01 E01
https://s/api/stream/u/p/tvshow/tt8622160/1/1
`;

const rendererRows = parseRenderer(m3u);
assert.equal(rendererRows.length, 3);
assert.deepEqual(rendererRows.map((r) => r.tvgType), ['live', 'movies', 'tvshows']);

// Electron main-process parser (CJS) — same M3U, same expectation.
const { createRequire } = await import('node:module');
const require = createRequire(import.meta.url);
const { __testables } = require('../electron/ipcHandlers.cjs');
const mainRows = __testables.parseM3UChannels(m3u);
assert.equal(mainRows.length, 3);
assert.deepEqual(mainRows.map((r) => r.tvg_type), ['live', 'movies', 'tvshows']);

// ── 5. routing the starlite shape end-to-end ─────────────────────────────────
const routed = routeM3UItems(mainRows);
assert.equal(routed.liveChannels.length, 1, 'FOX Movies stays a live channel');
assert.equal(routed.vodRows.length, 1);
assert.equal(routed.vodRows[0].name, 'Avatar');
assert.equal(routed.seriesRows.length, 1);
assert.equal(routed.episodeRows.length, 1);
assert.deepEqual([routed.episodeRows[0].season, routed.episodeRows[0].episode], [1, 1]);
// group-title === show name → collapse into an alphabetical bucket
assert.equal(routed.seriesRows[0].group_title, 'TV Shows · S',
  'per-show group-titles collapse into alphabetical "TV Shows · X" buckets');
assert.equal(routed.episodeRows[0].group_title, 'TV Shows · S');

// ── 6. punctuation survives; commas in attributes don't corrupt names ────────
const trickyM3u = `#EXTM3U
#EXTINF:-1 tvg-id="tt1" tvg-type="tvshows" group-title="American Manhunt: O.J. Simpson (2025)" ,American Manhunt: O.J. Simpson (2025) S01 E02
https://s/api/stream/u/p/tvshow/tt1/1/2
#EXTINF:-1 tvg-id="tt2" tvg-type="tvshows" group-title="Genie, Make a Wish (2025)" ,Genie, Make a Wish (2025) S01 E01
https://s/api/stream/u/p/tvshow/tt2/1/1
`;
const trickyMain = __testables.parseM3UChannels(trickyM3u);
assert.equal(trickyMain[0].name, 'American Manhunt: O.J. Simpson (2025) S01 E02');
assert.equal(trickyMain[1].name, 'Genie, Make a Wish (2025) S01 E01',
  'comma inside group-title must not truncate the display name');
assert.equal(trickyMain[1].group_title, 'Genie, Make a Wish (2025)');

const trickyRenderer = parseRenderer(trickyM3u);
assert.equal(trickyRenderer[1].name, 'Genie, Make a Wish (2025) S01 E01');

const trickyRouted = routeM3UItems(trickyMain);
assert.equal(trickyRouted.seriesRows.length, 2);
const oj = trickyRouted.seriesRows.find((s) => s.name.includes('Manhunt'));
assert.equal(oj.name, 'American Manhunt: O.J. Simpson (2025)',
  'natural titles keep their punctuation — no "O J Simpson"');
assert.equal(oj.group_title, 'TV Shows · A',
  'dotted show names still collapse (punctuation-insensitive compare)');
const genie = trickyRouted.seriesRows.find((s) => s.name.includes('Genie'));
assert.equal(genie.group_title, 'TV Shows · G');

// Filename-style dotted labels still get dots-as-separators treatment.
const dotted = routeM3UItems([{ name: 'The.Office.S02E03.Office.Olympics', stream_url: 'http://p/series/u/p/9.mkv', group_title: 'Series' }]);
assert.equal(dotted.seriesRows[0].name, 'The Office');
assert.equal(dotted.seriesRows[0].group_title, 'Series', 'real category groups pass through untouched');

console.log('OK: multi-list-provider');
