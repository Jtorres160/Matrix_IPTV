// src/lib/tv/dbChannelAdapter.js
// ─────────────────────────────────────────────────────────────────────────────
// Phase 2.1 — DB-backed Live TV Adapter (read-only, observational)
//
//   SQLite channels                (electron/db.cjs)
//         │
//         ▼
//   DB channel adapter             (this module — normalize + load)
//         │
//         ▼
//   appStore.channels shape        (same shape produced by m3uParser)
//         │
//         ▼
//   LiveTVView (UNCHANGED)
//
// This module ONLY reads from SQLite (via window.electronDB) and reshapes rows
// into the existing renderer channel model. It is NOT wired into the production
// Live TV flow. Its purpose in Phase 2.1 is to prove that SQLite can produce the
// exact same channel model as the current pipeline (see runChannelParityCheck).
//
// Constraints honored here:
//   • Does not switch Live TV to SQLite.
//   • Does not touch favorites / watchHistory / EPG.
//   • Does not solve identity migration (durable identity is `dbId`; the legacy
//     `${name}-${idx}` `id` is preserved only for temporary UI compatibility).
// ─────────────────────────────────────────────────────────────────────────────

import { mapGroupToAllowed } from '../m3u/m3uParser.js';
import { logger } from '../logger.js';

/**
 * The SQLite channel row shape (see electron/db.cjs `channels` table):
 *   { id, playlist_id, stream_id, name, logo, category_id, group_title,
 *     stream_url, tvg_id }
 *
 * @typedef {Object} DbChannelRow
 * @property {number} id             Integer PK (durable identity — the real one)
 * @property {string} name
 * @property {string|null} stream_url
 * @property {string|null} group_title
 * @property {string|null} tvg_id
 * @property {string|null} logo
 */

/**
 * The renderer / appStore channel shape (see lib/m3u/m3uParser.js
 * `processPlaylistText`). Kept byte-for-byte compatible so LiveTVView and its
 * children (filtering, rails, virtualized list) work unchanged.
 *
 * @typedef {Object} AppStoreChannel
 * @property {number} dbId     SQLite row id — durable identity for Phase 2.3+
 * @property {string} id       Legacy `${name}-${idx}` id (temporary UI compat)
 * @property {string} name
 * @property {'LIVE'} status
 * @property {string} url
 * @property {string[]} groups
 * @property {string|null} tvgId
 * @property {string|null} logo
 */

// ── 1. Normalizer ────────────────────────────────────────────────────────────

/**
 * Converts a single SQLite channel row into the existing appStore channel shape.
 *
 * Identity note: `dbId` carries the durable SQLite PK. `id` is deliberately the
 * legacy `${name}-${index}` string so current UI code (favorites keyed on
 * `channel.id`, playerStore, ranking) keeps working during migration. The real
 * identity bridge is Phase 2.3 — do NOT rely on `id` for anything durable.
 *
 * @param {DbChannelRow} row   A SQLite channel row
 * @param {number} index       Zero-based position in the ordered result set
 *                             (mirrors the renderer parser's array index)
 * @returns {AppStoreChannel}
 */
export function normalizeDbChannel(row, index) {
  return {
    dbId: row.id,
    // Legacy, renderer-compatible id. Mirrors m3uParser: `${name}-${idx}`.
    id: `${row.name}-${index}`,
    name: row.name,
    status: 'LIVE',
    url: row.stream_url || '',
    groups: mapGroupToAllowed(row.group_title),
    tvgId: row.tvg_id || null,
    logo: row.logo || null,
  };
}

/**
 * Derives the sorted, de-duplicated category list from normalized channels,
 * using the identical algorithm as m3uParser.processPlaylistText so the
 * category array matches the renderer path.
 *
 * @param {AppStoreChannel[]} channels
 * @returns {string[]}
 */
export function deriveCategories(channels) {
  const allGroups = channels.flatMap((c) => c.groups);
  return Array.from(new Set(allGroups)).filter(Boolean).sort();
}

// ── 2. Read-only DB channel loader ───────────────────────────────────────────

/**
 * Loads ALL channels for a playlist from SQLite and returns them in the existing
 * appStore shape ({ channels, categories }). Pages through the existing
 * `db:getChannels` IPC (which is capped per call) so no main-process changes are
 * needed. Purely read-only; does not mutate any store or DB state.
 *
 * NOT connected to the production Live TV flow — call sites in Phase 2.1 use
 * this only for parity diagnostics.
 *
 * @param {string} playlistId          Active playlist id
 * @param {Object} [opts]
 * @param {number} [opts.pageSize=1000] Rows per IPC round-trip
 * @param {boolean} [opts.omitLocked=false] Respect parental-control locks
 * @returns {Promise<{success: boolean, channels: AppStoreChannel[], categories: string[], total: number, reason?: string}>}
 */
export async function loadDbChannels(playlistId, opts = {}) {
  const { pageSize = 1000, omitLocked = false } = opts;

  const empty = (reason) => ({ success: false, channels: [], categories: [], total: 0, reason });

  if (typeof window === 'undefined' || !window.electronDB || typeof window.electronDB.getChannels !== 'function') {
    return empty('electronDB bridge unavailable');
  }
  if (!playlistId) {
    return empty('no active playlist id');
  }

  try {
    const channels = [];
    let total = 0;
    let offset = 0;

    // Page until we've collected `total` rows (or a page comes back short/empty).
    // Guard against a misbehaving IPC with a hard page ceiling.
    const MAX_PAGES = 10000;
    for (let page = 0; page < MAX_PAGES; page++) {
      const res = await window.electronDB.getChannels(playlistId, null, pageSize, offset, omitLocked);
      const rows = (res && res.channels) || [];
      if (page === 0) total = (res && typeof res.total === 'number') ? res.total : rows.length;

      for (let i = 0; i < rows.length; i++) {
        channels.push(normalizeDbChannel(rows[i], offset + i));
      }

      offset += rows.length;
      if (rows.length < pageSize || offset >= total) break;
    }

    return {
      success: true,
      channels,
      categories: deriveCategories(channels),
      total,
    };
  } catch (err) {
    logger.error('[dbChannelAdapter] loadDbChannels failed:', err);
    return empty(err && err.message ? err.message : 'unknown error');
  }
}

// ── 3. Parity diagnostics (read-only) ────────────────────────────────────────

/**
 * Builds a small, comparable fingerprint of a channel list: count plus the
 * first N and last N `{ name, id }` identities.
 *
 * @param {Array<{name: string, id: string}>} channels
 * @param {number} sampleSize
 */
function sampleIdentities(channels, sampleSize) {
  const pick = (c) => ({ name: c.name, id: c.id });
  return {
    count: channels.length,
    head: channels.slice(0, sampleSize).map(pick),
    tail: channels.slice(-sampleSize).map(pick),
  };
}

/**
 * Compares the renderer-parsed channel list against the SQLite adapter output
 * and logs a diagnostic report. **Observational only** — returns a result
 * object and never throws, never mutates state, and changes no behavior.
 *
 * @param {Object} args
 * @param {AppStoreChannel[]} args.rendererChannels  Channels already in appStore
 *                                                    (source of truth for the view)
 * @param {string} args.playlistId                    Active playlist id for the DB load
 * @param {number} [args.sampleSize=5]                Identities to sample at head/tail
 * @returns {Promise<Object>} Structured parity result (also logged)
 */
export async function runChannelParityCheck({ rendererChannels = [], playlistId, sampleSize = 5 }) {
  const dbResult = await loadDbChannels(playlistId);

  const rendererSample = sampleIdentities(rendererChannels, sampleSize);
  const dbSample = sampleIdentities(dbResult.channels, sampleSize);

  const countsMatch = rendererSample.count === dbSample.count;

  // Identity mismatches: compare head-sample ids position-by-position. This is a
  // spot check, not a full diff — it's enough to reveal ordering/identity drift.
  const identityMismatches = [];
  const headLen = Math.min(rendererSample.head.length, dbSample.head.length);
  for (let i = 0; i < headLen; i++) {
    const r = rendererSample.head[i];
    const d = dbSample.head[i];
    if (r.id !== d.id || r.name !== d.name) {
      identityMismatches.push({ index: i, renderer: r, sqlite: d });
    }
  }

  const result = {
    ok: dbResult.success,
    countsMatch,
    renderer: rendererSample,
    sqlite: dbSample,
    identityMismatches,
    dbReason: dbResult.reason || null,
  };

  // ── Emit diagnostics only ──────────────────────────────────────────────
  const line = (label, n) => `${label}: ${n} channels`;
  logger.info('[Parity] ── DB Channel Adapter parity check ──');
  logger.info('[Parity] ' + line('Renderer', rendererSample.count));
  logger.info('[Parity] ' + line('SQLite  ', dbResult.success ? dbSample.count : `unavailable (${dbResult.reason})`));
  if (dbResult.success) {
    logger.info(`[Parity] Counts match: ${countsMatch ? 'YES' : 'NO'}`);
    if (identityMismatches.length > 0) {
      logger.warn(`[Parity] ${identityMismatches.length} head-sample identity mismatch(es):`, identityMismatches);
    } else {
      logger.info('[Parity] Head-sample identities match.');
    }
  }

  // Route a one-line summary to the persistent Electron log when available, so
  // parity can be inspected from production diagnostics without a devtools open.
  try {
    if (typeof window !== 'undefined' && window.electronLog) {
      window.electronLog.write(
        countsMatch && dbResult.success ? 'info' : 'warn',
        `[Parity] renderer=${rendererSample.count} sqlite=${dbResult.success ? dbSample.count : 'n/a'} ` +
          `countsMatch=${countsMatch} idMismatches=${identityMismatches.length}`
      );
    }
  } catch {
    /* logging must never affect behavior */
  }

  return result;
}
