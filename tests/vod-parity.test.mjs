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
