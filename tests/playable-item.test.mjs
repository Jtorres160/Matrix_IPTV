import assert from 'node:assert/strict';
import { toPlayableVodItem } from '../src/lib/media/playableItem.js';

// Regression: a DB vod_streams row (stream_url/stream_icon only, no url/type/logo)
// must come out playable — this exact gap caused the "Tuning…" hang when a DB
// movie row reached playMediaItem with no url/type.
const dbRow = {
  stream_id: 'abc123',
  name: 'Inception (2010)',
  stream_url: 'http://host/movie/1.mp4',
  stream_icon: 'http://host/icons/inception.jpg',
  category_name: 'Movies',
};
const playable = toPlayableVodItem(dbRow);
assert.equal(playable.url, 'http://host/movie/1.mp4');
assert.equal(playable.type, 'movie');
assert.equal(playable.logo, 'http://host/icons/inception.jpg');
assert.equal(playable.stream_url, 'http://host/movie/1.mp4'); // original fields kept

// A resolved URL from the detail overlay wins over every field on the item.
const resolved = toPlayableVodItem(dbRow, 'http://host/movie/1-resolved.mp4');
assert.equal(resolved.url, 'http://host/movie/1-resolved.mp4');

// A store MediaItem that is already playable passes through unchanged.
const storeItem = {
  id: '9',
  name: 'Store Movie',
  url: 'http://host/store.mp4',
  streamUrl: 'http://host/store.mp4',
  type: 'movie',
  logo: 'http://host/store.png',
};
const passthrough = toPlayableVodItem(storeItem);
assert.equal(passthrough.url, 'http://host/store.mp4');
assert.equal(passthrough.type, 'movie');
assert.equal(passthrough.logo, 'http://host/store.png');

// streamUrl is preferred over stream_url when both exist (matches the old
// inline ordering in VODLibrary's onPlay).
const both = toPlayableVodItem({ streamUrl: 'http://a/1.mp4', stream_url: 'http://b/2.mp4' });
assert.equal(both.url, 'http://a/1.mp4');

// An item with no URL anywhere must not gain a bogus url key, and an existing
// url must not be clobbered by an undefined.
const noUrl = toPlayableVodItem({ name: 'Broken Row' });
assert.equal('url' in noUrl, false);
assert.equal(noUrl.type, 'movie');
assert.equal(noUrl.logo, null);

// An explicit type (e.g. 'series') is preserved, not forced to 'movie'.
const typed = toPlayableVodItem({ url: 'http://x/ep.mp4', type: 'series' });
assert.equal(typed.type, 'series');

console.log('OK: playable-item');
