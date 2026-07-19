// src/lib/tv/identityBridge.js
// ─────────────────────────────────────────────────────────────────────────────
// Phase 2.3 — Identity Bridge (legacyId ↔ dbId)
//
// The dangerous part of the migration. Favorites and watchHistory are persisted
// keyed on the LEGACY channel id (`${name}-${idx}`), produced by the renderer
// M3U parser (see lib/m3u/m3uParser.js) and by the DB adapter's compatibility
// `id`/`legacyId` fields (see dbChannelAdapter.js). SQLite rows have a durable
// integer `dbId`.
//
// This module builds a bidirectional index over a channel list and resolves
// stored identifiers to concrete channels, tolerating three cases:
//   1. stored legacyId matches a channel's legacyId  → exact (fast path)
//   2. stored value matches a channel's dbId          → forward-compatible
//   3. legacyId doesn't match, but the embedded name  → name-fallback recovery
//      (covers `${name}-${idx}` drift when channel ordering changes)
//
// It is READ-ONLY and OBSERVATIONAL for Phase 2.3:
//   • Does NOT migrate the stored favorites/watchHistory format.
//   • Does NOT delete legacy ids.
//   • Does NOT change how LiveTVView reads favorites/watchHistory.
// Its output (mapped / unresolved counts) is the evidence needed before any
// future storage-format migration (a later phase).
// ─────────────────────────────────────────────────────────────────────────────

import { logger } from '../logger.js';

/**
 * Returns the legacy identity for a channel from either pipeline.
 * DB-adapter channels expose an explicit `legacyId`; renderer channels only
 * carry `id` (which IS the legacy id). Falls back gracefully.
 *
 * @param {{legacyId?: string, id?: string}} channel
 * @returns {string|null}
 */
export function getLegacyId(channel) {
  if (!channel) return null;
  return channel.legacyId != null ? channel.legacyId : (channel.id != null ? channel.id : null);
}

/**
 * @typedef {Object} IdentityIndex
 * @property {Map<string, object>} legacyToChannel
 * @property {Map<number, object>} dbToChannel
 * @property {Map<string, object[]>} nameToChannels
 * @property {number} size
 */

/**
 * Builds a bidirectional identity index over a channel list.
 *
 * @param {Array<object>} channels
 * @returns {IdentityIndex}
 */
export function buildIdentityIndex(channels = []) {
  const legacyToChannel = new Map();
  const dbToChannel = new Map();
  const nameToChannels = new Map();

  for (const ch of channels) {
    const legacy = getLegacyId(ch);
    if (legacy != null && !legacyToChannel.has(legacy)) legacyToChannel.set(legacy, ch);
    if (ch && ch.dbId != null && !dbToChannel.has(ch.dbId)) dbToChannel.set(ch.dbId, ch);
    if (ch && ch.name) {
      const arr = nameToChannels.get(ch.name);
      if (arr) arr.push(ch);
      else nameToChannels.set(ch.name, [ch]);
    }
  }

  return { legacyToChannel, dbToChannel, nameToChannels, size: channels.length };
}

/**
 * Resolves a stored identifier (legacy string OR dbId number) to a channel.
 * Resolution order: exact legacy → exact dbId → name-prefix fallback.
 *
 * @param {IdentityIndex} index
 * @param {string|number} storedId
 * @returns {object|null} The resolved channel, or null if unresolved
 */
export function resolveChannel(index, storedId) {
  if (storedId == null) return null;

  // 1. Exact legacy id
  const byLegacy = index.legacyToChannel.get(storedId);
  if (byLegacy) return byLegacy;

  // 2. Exact dbId (forward-compat: stores may already hold numeric ids)
  if (index.dbToChannel.has(storedId)) return index.dbToChannel.get(storedId);

  // 3. Name-prefix fallback for `${name}-${idx}` drift. The legacy id embeds the
  //    channel name before the final dash; recover by name when the index moved.
  if (typeof storedId === 'string') {
    const dash = storedId.lastIndexOf('-');
    if (dash > 0) {
      const name = storedId.slice(0, dash);
      const byName = index.nameToChannels.get(name);
      if (byName && byName.length > 0) return byName[0];
    }
  }

  return null;
}

/**
 * Resolves a list of stored identifiers, partitioning into mapped/unresolved.
 *
 * @param {IdentityIndex} index
 * @param {Array<string|number>} ids
 * @returns {{mapped: Array<{storedId: string|number, dbId: number|null, legacyId: string|null, name: string, via: string}>, unresolved: Array<string|number>}}
 */
export function resolveIdList(index, ids = []) {
  const mapped = [];
  const unresolved = [];

  for (const id of ids) {
    let via = 'legacy';
    let ch = index.legacyToChannel.get(id);
    if (!ch && index.dbToChannel.has(id)) { ch = index.dbToChannel.get(id); via = 'dbId'; }
    if (!ch) { ch = resolveChannel(index, id); if (ch) via = 'name-fallback'; }

    if (ch) {
      mapped.push({ storedId: id, dbId: ch.dbId ?? null, legacyId: getLegacyId(ch), name: ch.name, via });
    } else {
      unresolved.push(id);
    }
  }

  return { mapped, unresolved };
}

/**
 * Extracts channel ids from a watchHistory array. Entries are either raw string
 * ids (very old data) or `{ channelId, ... }` objects (current schema).
 *
 * @param {Array<any>} watchHistory
 * @returns {Array<string|number>}
 */
export function extractWatchHistoryIds(watchHistory = []) {
  return watchHistory
    .map((h) => (typeof h === 'string' ? h : (h && (h.channelId ?? h.id))))
    .filter((x) => x != null);
}

/**
 * Runs the identity-bridge diagnostics: how many favorites and watchHistory
 * entries resolve against the current channel list, and what stays unresolved.
 * OBSERVATIONAL — logs only, mutates nothing, never throws.
 *
 * @param {Object} args
 * @param {Array<object>} args.channels      Active channel list (either pipeline)
 * @param {Array<string|number>} args.favorites
 * @param {Array<any>} args.watchHistory
 * @param {string} [args.mode='unknown']     'renderer' | 'db'
 * @returns {{index: IdentityIndex, favorites: object, watchHistory: object}}
 */
export function runIdentityBridgeDiagnostics({ channels = [], favorites = [], watchHistory = [], mode = 'unknown' }) {
  const index = buildIdentityIndex(channels);

  const favResult = resolveIdList(index, favorites);
  const historyIds = extractWatchHistoryIds(watchHistory);
  const histResult = resolveIdList(index, historyIds);

  const favFallback = favResult.mapped.filter((m) => m.via === 'name-fallback').length;
  const histFallback = histResult.mapped.filter((m) => m.via === 'name-fallback').length;

  logger.info(`[IdentityBridge] ── mode=${mode} channels=${channels.length} ──`);
  logger.info(`[IdentityBridge] favorites: ${favResult.mapped.length}/${favorites.length} mapped ` +
    `(${favFallback} via name-fallback), ${favResult.unresolved.length} unresolved`);
  logger.info(`[IdentityBridge] watchHistory: ${histResult.mapped.length}/${historyIds.length} mapped ` +
    `(${histFallback} via name-fallback), ${histResult.unresolved.length} unresolved`);
  if (favResult.unresolved.length) logger.warn('[IdentityBridge] Unresolved favorites:', favResult.unresolved);
  if (histResult.unresolved.length) logger.warn('[IdentityBridge] Unresolved watchHistory:', histResult.unresolved);

  // One-line summary to the persistent Electron log for production inspection.
  try {
    if (typeof window !== 'undefined' && window.electronLog) {
      const dirty = favResult.unresolved.length || histResult.unresolved.length;
      window.electronLog.write(
        dirty ? 'warn' : 'info',
        `[IdentityBridge] mode=${mode} fav=${favResult.mapped.length}/${favorites.length} ` +
          `hist=${histResult.mapped.length}/${historyIds.length} ` +
          `unresolvedFav=${favResult.unresolved.length} unresolvedHist=${histResult.unresolved.length} ` +
          `fallback=${favFallback + histFallback}`
      );
    }
  } catch {
    /* logging must never affect behavior */
  }

  return { index, favorites: favResult, watchHistory: histResult };
}
