/**
 * src/lib/media/metaService.js
 *
 * External metadata enrichment keyed by IMDb id (providers that set
 * tvg-id="tt...", which the sync now carries into vod_streams.tvg_id /
 * series.tvg_id / MediaItem.tvgId).
 *
 * Sources (free, no API key):
 *   - Posters: images.metahub.space direct image URLs — zero JSON calls, the
 *     <img> tag is the request. Broken ids fall back to the designed tile via
 *     the card's onError path.
 *   - Plot / genres / rating / cast: Cinemeta (v3-cinemeta.strem.io), which
 *     sends Access-Control-Allow-Origin: * so the renderer can fetch it
 *     directly. Results (including misses) cache in IndexedDB so each title
 *     is fetched at most once per TTL.
 */

const IDB_NAME = 'MatrixIPTV_Meta';
const IDB_STORE = 'meta';
const MISS_TTL_MS = 7 * 24 * 3600 * 1000;   // retry unknown ids weekly
const HIT_TTL_MS = 30 * 24 * 3600 * 1000;   // refresh known ids monthly

const mem = new Map();       // imdbId -> normalized meta (or {missing:true})
const inflight = new Map();  // imdbId -> Promise

export function isImdbId(id) {
  return /^tt\d{4,}$/.test(String(id || '').trim());
}

/** Direct poster URL for an IMDb id — usable straight in an <img src>. */
export function posterUrlFor(imdbId, size = 'small') {
  if (!isImdbId(imdbId)) return null;
  return `https://images.metahub.space/poster/${size}/${imdbId}/img`;
}

/** Wide backdrop art for detail views. */
export function backgroundUrlFor(imdbId) {
  if (!isImdbId(imdbId)) return null;
  return `https://images.metahub.space/background/medium/${imdbId}/img`;
}

let _dbPromise = null;
function openDb() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve) => {
    try {
      const req = indexedDB.open(IDB_NAME, 1);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(IDB_STORE)) {
          req.result.createObjectStore(IDB_STORE, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null); // cache is best-effort
    } catch {
      resolve(null);
    }
  });
  return _dbPromise;
}

async function idbGet(id) {
  const db = await openDb();
  if (!db) return null;
  return new Promise((resolve) => {
    try {
      const req = db.transaction(IDB_STORE).objectStore(IDB_STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(record) {
  const db = await openDb();
  if (!db) return;
  try {
    db.transaction(IDB_STORE, 'readwrite').objectStore(IDB_STORE).put(record);
  } catch {
    /* best-effort */
  }
}

function normalize(id, kind, meta) {
  return {
    id,
    kind,
    name: meta.name || null,
    poster: meta.poster || posterUrlFor(id),
    background: meta.background || backgroundUrlFor(id),
    description: meta.description || null,
    genres: Array.isArray(meta.genre) ? meta.genre : (Array.isArray(meta.genres) ? meta.genres : []),
    imdbRating: meta.imdbRating || null,
    year: meta.year || (meta.released ? String(meta.released).slice(0, 4) : null),
    runtime: meta.runtime || null,
    cast: Array.isArray(meta.cast) ? meta.cast.slice(0, 6) : [],
    director: Array.isArray(meta.director) ? meta.director.slice(0, 3) : [],
    fetchedAt: Date.now(),
  };
}

async function fetchCinemeta(id, kind) {
  const res = await fetch(`https://v3-cinemeta.strem.io/meta/${kind}/${id}.json`);
  if (!res.ok) return null;
  const json = await res.json().catch(() => null);
  return json && json.meta ? json.meta : null;
}

/**
 * Full metadata for one title. `kind` is a hint ('movie' | 'series'); the
 * other kind is tried on a miss since provider classification can differ
 * from IMDb's. Returns null when nothing is known.
 */
export async function getMeta(imdbId, kind = 'movie') {
  const id = String(imdbId || '').trim();
  if (!isImdbId(id)) return null;

  const cachedMem = mem.get(id);
  if (cachedMem) return cachedMem.missing ? null : cachedMem;

  if (inflight.has(id)) return inflight.get(id);

  const p = (async () => {
    const stored = await idbGet(id);
    if (stored) {
      const age = Date.now() - (stored.fetchedAt || 0);
      if (stored.missing ? age < MISS_TTL_MS : age < HIT_TTL_MS) {
        mem.set(id, stored);
        return stored.missing ? null : stored;
      }
    }

    let meta = null;
    try {
      meta = await fetchCinemeta(id, kind);
      if (!meta) meta = await fetchCinemeta(id, kind === 'movie' ? 'series' : 'movie');
    } catch {
      // Network down: reuse stale cache if we had one, don't record a miss.
      if (stored && !stored.missing) {
        mem.set(id, stored);
        return stored;
      }
      return null;
    }

    const record = meta ? normalize(id, kind, meta) : { id, missing: true, fetchedAt: Date.now() };
    mem.set(id, record);
    idbPut(record);
    return meta ? record : null;
  })().finally(() => inflight.delete(id));

  inflight.set(id, p);
  return p;
}

/**
 * Bulk enrichment with bounded concurrency. `entries` = [{ id, kind }].
 * Calls `onItem(id, metaOrNull)` as each completes; resolves with a Map.
 * An AbortSignal stops scheduling new fetches (in-flight ones finish).
 */
export async function getMetaMany(entries, { concurrency = 6, onItem, signal } = {}) {
  const out = new Map();
  const queue = (entries || []).filter((e) => e && isImdbId(e.id));
  let idx = 0;

  async function worker() {
    while (idx < queue.length) {
      if (signal && signal.aborted) return;
      const entry = queue[idx++];
      const meta = await getMeta(entry.id, entry.kind || 'movie');
      out.set(entry.id, meta);
      if (onItem) onItem(entry.id, meta);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, queue.length) }, worker));
  return out;
}
