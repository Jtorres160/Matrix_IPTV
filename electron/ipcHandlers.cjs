// electron/ipcHandlers.cjs
// ─────────────────────────────────────────────────────────────────────────────
// Phase 7: IPC Handler Registration for SQLite Database Operations
//
// Registers all database-related IPC channels, keeping main.cjs clean.
// Handles playlist CRUD, channel queries, EPG retrieval, and background
// sync orchestration (M3U fetch + parse → chunked SQLite insertion).
//
// Architecture:
//   Renderer ──(IPC invoke)──> Main Process ──(db.cjs)──> SQLite
//   Main Process ──(webContents.send)──> Renderer (progress events)
// ─────────────────────────────────────────────────────────────────────────────

const { ipcMain } = require('electron');
const http = require('http');
const https = require('https');
const db = require('./db.cjs');

let _mainWindow = null;

// ── M3U Parsing Utilities (Main Process — off the renderer thread) ──────────

/**
 * Extracts the x-tvg-url EPG URL from the #EXTM3U header line.
 *
 * @param {string} headerLine The first line of the M3U file
 * @returns {string|null} The EPG URL or null
 */
function parseM3UHeaderForEPG(headerLine) {
  if (!headerLine || !headerLine.startsWith('#EXTM3U')) return null;
  const match = headerLine.match(/x-tvg-url="([^"]+)"/i);
  return match ? match[1].trim() : null;
}

/**
 * Parses an M3U text body into an array of channel objects.
 * Designed for zero unnecessary allocations — single-pass parsing.
 *
 * @param {string} text Raw M3U text content
 * @returns {Array<Object>} Parsed channel objects
 */
function parseM3UChannels(text) {
  const lines = text.split(/\r?\n/);
  const channels = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.startsWith('#EXTINF')) continue;

    const url = (lines[i + 1] || '').trim();
    if (!url || url.startsWith('#')) continue;

    // Extract channel name (after the last comma)
    const nameMatch = line.match(/,(.*)$/);
    const name = nameMatch ? nameMatch[1].trim() : 'Channel';

    // Extract group-title
    const groupMatch = line.match(/group-title="([^"]*)"/i);
    const group = groupMatch ? groupMatch[1].trim() : '';

    // Extract tvg-id
    const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);
    const tvgId = tvgIdMatch ? tvgIdMatch[1].trim() : null;

    // Extract tvg-logo
    const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
    const logo = logoMatch ? logoMatch[1].trim() : null;

    channels.push({
      name,
      stream_url: url,
      group_title: group || null,
      tvg_id: tvgId || null,
      logo: logo || null,
      stream_id: null,
      category_id: null,
    });
  }

  return channels;
}

/**
 * Fetches text content from a URL (M3U playlist or EPG XML).
 * Uses raw Node http/https for minimal overhead — no fetch() polyfill needed.
 *
 * @param {string} url The URL to fetch
 * @param {number} [timeoutMs=30000] Request timeout
 * @returns {Promise<string>} The response body as text
 */
function fetchText(url, timeoutMs = 30000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;

    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      // Follow redirects (301, 302, 307, 308)
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchText(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }

      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

/**
 * Fetches JSON from a URL (for Xtream API endpoints).
 *
 * @param {string} url
 * @param {number} [timeoutMs=15000]
 * @returns {Promise<Object>}
 */
function fetchJSON(url, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    const mod = url.startsWith('https') ? https : http;

    const req = mod.get(url, { timeout: timeoutMs }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location, timeoutMs).then(resolve).catch(reject);
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        return reject(new Error(`HTTP ${res.statusCode}`));
      }

      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        try {
          resolve(JSON.parse(Buffer.concat(chunks).toString()));
        } catch (err) {
          reject(new Error('Invalid JSON response'));
        }
      });
      res.on('error', reject);
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', reject);
  });
}

// ── Progress Reporting ───────────────────────────────────────────────────────

/**
 * Sends a sync progress event to the renderer process.
 *
 * @param {string} playlistId
 * @param {string} stage 'fetching' | 'parsing' | 'inserting' | 'epg' | 'done' | 'error'
 * @param {number} progress 0-100
 * @param {string} [message] Human-readable status message
 */
function sendProgress(playlistId, stage, progress, message) {
  if (_mainWindow && !_mainWindow.isDestroyed()) {
    _mainWindow.webContents.send('db:syncProgress', {
      playlistId,
      stage,
      progress: Math.min(100, Math.max(0, Math.round(progress))),
      message: message || '',
      timestamp: Date.now(),
    });
  }
}

// ── Background Sync Logic ────────────────────────────────────────────────────

/**
 * Performs a full background sync for an M3U playlist:
 *  1. Fetches M3U text from the URL
 *  2. Parses channels
 *  3. Wipes old channel data for this playlist
 *  4. Inserts channels in chunked transactions
 *  5. Extracts and fetches EPG if x-tvg-url is present
 *  6. Inserts EPG programs in chunked transactions
 *
 * @param {string} playlistId
 * @param {string} url M3U URL
 * @returns {Promise<Object>} Sync result summary
 */
async function syncM3UPlaylist(playlistId, url) {
  try {
    // Stage 1: Fetch M3U
    sendProgress(playlistId, 'fetching', 10, 'Downloading playlist...');
    const text = await fetchText(url);

    // Stage 2: Parse
    sendProgress(playlistId, 'parsing', 30, 'Parsing channels...');
    const channels = parseM3UChannels(text);
    const lines = text.split(/\r?\n/);
    const epgUrl = parseM3UHeaderForEPG(lines[0]);

    if (channels.length === 0) {
      sendProgress(playlistId, 'error', 100, 'No channels found in playlist.');
      return { success: false, error: 'No channels found', channelCount: 0, epgCount: 0 };
    }

    // Stage 3: Clear old channels for this playlist
    sendProgress(playlistId, 'inserting', 40, `Inserting ${channels.length} channels...`);
    db.clearPlaylistChannels(playlistId);

    // Stage 4: Chunked insert
    const { inserted } = db.insertChannelsBatch(playlistId, channels);
    sendProgress(playlistId, 'inserting', 60, `Inserted ${inserted} channels.`);

    // Update playlist last_updated timestamp
    const playlist = db.getPlaylistById(playlistId);
    if (playlist) {
      db.upsertPlaylist({ ...playlist, last_updated: Date.now() });
    }

    // Stage 5: EPG fetch (if available)
    let epgCount = 0;
    if (epgUrl) {
      try {
        sendProgress(playlistId, 'epg', 65, 'Downloading EPG data...');
        const epgText = await fetchText(epgUrl, 60000); // 60s timeout for large EPG files

        sendProgress(playlistId, 'epg', 75, 'Parsing EPG data...');
        const programs = parseEPGXML(epgText);

        if (programs.length > 0) {
          sendProgress(playlistId, 'epg', 85, `Inserting ${programs.length} EPG entries...`);
          // Clear old EPG before inserting fresh data
          db.clearAllEPG();
          const epgResult = db.insertEPGBatch(programs);
          epgCount = epgResult.inserted;
          sendProgress(playlistId, 'epg', 95, `Inserted ${epgCount} EPG entries.`);
        }
      } catch (epgErr) {
        console.error('[IPC] EPG fetch/parse failed:', epgErr.message);
        sendProgress(playlistId, 'epg', 95, `EPG failed: ${epgErr.message}`);
        // Non-fatal — channels still synced successfully
      }
    }

    // Stage 6: Done
    sendProgress(playlistId, 'done', 100, `Sync complete: ${inserted} channels, ${epgCount} EPG entries.`);

    return {
      success: true,
      channelCount: inserted,
      epgCount,
      epgUrl: epgUrl || null,
    };
  } catch (err) {
    console.error('[IPC] M3U sync failed:', err);
    sendProgress(playlistId, 'error', 100, `Sync failed: ${err.message}`);
    return { success: false, error: err.message, channelCount: 0, epgCount: 0 };
  }
}

/**
 * Performs a full background sync for an Xtream playlist:
 *  1. Fetches live streams from the Xtream API
 *  2. Wipes old channel data
 *  3. Inserts channels in chunked transactions
 *  4. Fetches short EPG for each channel (optional, deferred)
 *
 * @param {string} playlistId
 * @param {Object} playlist The playlist record with serverUrl, username, password
 * @returns {Promise<Object>} Sync result summary
 */
async function syncXtreamPlaylist(playlistId, playlist) {
  try {
    const { server_url, username, password } = playlist;
    const base = server_url.replace(/\/+$/, '');

    // ── Live TV ──
    sendProgress(playlistId, 'fetching', 10, 'Fetching Xtream Live Categories...');
    const liveCatsUrl = `${base}/player_api.php?username=${username}&password=${password}&action=get_live_categories`;
    const liveCats = await fetchJSON(liveCatsUrl, 20000).catch(() => []);
    const liveCatMap = new Map();
    if (Array.isArray(liveCats)) {
      liveCats.forEach(c => liveCatMap.set(String(c.category_id), c.category_name));
    }

    sendProgress(playlistId, 'fetching', 20, 'Fetching Xtream Live Streams...');
    const streamsUrl = `${base}/player_api.php?username=${username}&password=${password}&action=get_live_streams`;
    const streams = await fetchJSON(streamsUrl, 30000);

    if (!Array.isArray(streams) || streams.length === 0) {
      sendProgress(playlistId, 'error', 100, 'No live streams returned from Xtream API.');
      return { success: false, error: 'No streams', channelCount: 0, epgCount: 0 };
    }

    const channels = streams.map(item => ({
      stream_id: String(item.stream_id || ''),
      name: item.name || 'Unknown Channel',
      logo: item.stream_icon || null,
      category_id: String(item.category_id || ''),
      group_title: liveCatMap.get(String(item.category_id)) || 'Uncategorized',
      stream_url: `${base}/live/${username}/${password}/${item.stream_id}.ts`,
      tvg_id: item.epg_channel_id || null,
    }));

    sendProgress(playlistId, 'inserting', 40, `Inserting ${channels.length} live channels...`);
    db.clearPlaylistChannels(playlistId);
    const { inserted: insertedLive } = db.insertChannelsBatch(playlistId, channels);

    // ── VOD ──
    sendProgress(playlistId, 'fetching', 60, 'Fetching Xtream VOD...');
    const vodCatsUrl = `${base}/player_api.php?username=${username}&password=${password}&action=get_vod_categories`;
    const vodCats = await fetchJSON(vodCatsUrl, 20000).catch(() => []);
    const vodCatMap = new Map();
    if (Array.isArray(vodCats)) {
      vodCats.forEach(c => vodCatMap.set(String(c.category_id), c.category_name));
    }

    const vodUrl = `${base}/player_api.php?username=${username}&password=${password}&action=get_vod_streams`;
    const vods = await fetchJSON(vodUrl, 45000).catch(() => []);
    
    let insertedVOD = 0;
    if (Array.isArray(vods)) {
      const mappedVODs = vods.map(item => ({
        stream_id: String(item.stream_id || ''),
        name: item.name || 'Unknown',
        stream_icon: item.stream_icon || null,
        category_id: String(item.category_id || ''),
        group_title: vodCatMap.get(String(item.category_id)) || 'Uncategorized',
        rating: parseFloat(item.rating_5based || item.rating || 0) || 0,
        added: item.added || null,
        container_extension: item.container_extension || null
      }));
      db.clearPlaylistVODs(playlistId);
      insertedVOD = db.insertVODBatch(playlistId, mappedVODs).inserted;
    }

    // ── Series ──
    sendProgress(playlistId, 'fetching', 80, 'Fetching Xtream Series...');
    const seriesCatsUrl = `${base}/player_api.php?username=${username}&password=${password}&action=get_series_categories`;
    const seriesCats = await fetchJSON(seriesCatsUrl, 20000).catch(() => []);
    const seriesCatMap = new Map();
    if (Array.isArray(seriesCats)) {
      seriesCats.forEach(c => seriesCatMap.set(String(c.category_id), c.category_name));
    }

    const seriesUrl = `${base}/player_api.php?username=${username}&password=${password}&action=get_series`;
    const seriesList = await fetchJSON(seriesUrl, 45000).catch(() => []);

    let insertedSeries = 0;
    if (Array.isArray(seriesList)) {
      const mappedSeries = seriesList.map(item => ({
        series_id: String(item.series_id || ''),
        name: item.name || 'Unknown',
        cover: item.cover || null,
        plot: item.plot || null,
        category_id: String(item.category_id || ''),
        group_title: seriesCatMap.get(String(item.category_id)) || 'Uncategorized',
        rating: parseFloat(item.rating_5based || item.rating || 0) || 0,
        releaseDate: item.releaseDate || null
      }));
      db.clearPlaylistSeries(playlistId);
      insertedSeries = db.insertSeriesBatch(playlistId, mappedSeries).inserted;
    }

    db.upsertPlaylist({ ...playlist, last_updated: Date.now() });

    sendProgress(playlistId, 'done', 100, `Sync complete: ${insertedLive} Live, ${insertedVOD} VOD, ${insertedSeries} Series.`);

    return {
      success: true,
      channelCount: insertedLive,
      epgCount: 0,
    };
  } catch (err) {
    console.error('[IPC] Xtream sync failed:', err);
    sendProgress(playlistId, 'error', 100, `Sync failed: ${err.message}`);
    return { success: false, error: err.message, channelCount: 0, epgCount: 0 };
  }
}

/**
 * Minimal XMLTV EPG parser for the Main Process.
 * Parses <programme> elements from XMLTV-format XML text.
 * Uses regex-based extraction to avoid heavy XML DOM parsing in Node.
 *
 * @param {string} xmlText Raw XMLTV XML text
 * @returns {Array<Object>} Parsed EPG program objects
 */
function parseEPGXML(xmlText) {
  const programs = [];

  // Match all <programme> blocks
  const programmeRegex = /<programme\s+([^>]*?)>([\s\S]*?)<\/programme>/gi;
  let match;

  while ((match = programmeRegex.exec(xmlText)) !== null) {
    const attrs = match[1];
    const body = match[2];

    // Extract attributes
    const channelMatch = attrs.match(/channel="([^"]+)"/);
    const startMatch = attrs.match(/start="([^"]+)"/);
    const stopMatch = attrs.match(/stop="([^"]+)"/);

    if (!channelMatch || !startMatch || !stopMatch) continue;

    const channelId = channelMatch[1];
    const startTime = parseXMLTVDate(startMatch[1]);
    const stopTime = parseXMLTVDate(stopMatch[1]);

    if (!startTime || !stopTime) continue;

    // Extract title
    const titleMatch = body.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : 'No Title';

    // Extract description
    const descMatch = body.match(/<desc[^>]*>([^<]*)<\/desc>/i);
    const description = descMatch ? descMatch[1].trim() : null;

    programs.push({
      channel_id: channelId,
      start_time: startTime,
      end_time: stopTime,
      title,
      description,
    });
  }

  return programs;
}

/**
 * Parses XMLTV date format (YYYYMMDDHHmmss +HHMM) to epoch milliseconds.
 *
 * @param {string} dateStr XMLTV-format date string
 * @returns {number|null} Epoch milliseconds or null on failure
 */
function parseXMLTVDate(dateStr) {
  if (!dateStr || dateStr.length < 14) return null;

  try {
    const year = parseInt(dateStr.substring(0, 4), 10);
    const month = parseInt(dateStr.substring(4, 6), 10) - 1; // JS months are 0-indexed
    const day = parseInt(dateStr.substring(6, 8), 10);
    const hour = parseInt(dateStr.substring(8, 10), 10);
    const minute = parseInt(dateStr.substring(10, 12), 10);
    const second = parseInt(dateStr.substring(12, 14), 10);

    // Handle timezone offset (e.g., +0000, -0500)
    const tzMatch = dateStr.match(/([+-])(\d{2})(\d{2})$/);
    let tzOffsetMs = 0;
    if (tzMatch) {
      const sign = tzMatch[1] === '+' ? 1 : -1;
      tzOffsetMs = sign * (parseInt(tzMatch[2], 10) * 60 + parseInt(tzMatch[3], 10)) * 60 * 1000;
    }

    const utcMs = Date.UTC(year, month, day, hour, minute, second);
    return utcMs - tzOffsetMs; // Convert local time to UTC
  } catch (e) {
    return null;
  }
}

// ── IPC Handler Registration ─────────────────────────────────────────────────

/**
 * Registers all database-related IPC handlers.
 * Must be called once during app initialization, after initDatabase().
 *
 * @param {Electron.BrowserWindow} mainWindow Reference to the main window for progress events
 */
function registerIPCHandlers(mainWindow) {
  _mainWindow = mainWindow;

  // ── Playlist CRUD ────────────────────────────────────────────────────

  /**
   * Get all playlists for a profile.
   * @param {string} profileId
   * @returns {Array<Object>}
   */
  ipcMain.handle('db:getPlaylists', (_e, profileId) => {
    try {
      return db.getPlaylists(profileId);
    } catch (err) {
      console.error('[IPC] db:getPlaylists error:', err);
      return [];
    }
  });

  /**
   * Add a new playlist and trigger background sync.
   * @param {Object} data { id, profile_id, name, url, type, username?, password?, server_url? }
   * @returns {Promise<Object>} { success, playlist, syncResult }
   */
  ipcMain.handle('db:addPlaylist', async (_e, data) => {
    try {
      // Upsert the playlist record
      db.upsertPlaylist(data);

      // Trigger background sync based on type
      let syncResult;
      if (data.type === 'xtream') {
        syncResult = await syncXtreamPlaylist(data.id, data);
      } else {
        // M3U
        if (data.url) {
          syncResult = await syncM3UPlaylist(data.id, data.url);
        } else {
          syncResult = { success: true, channelCount: 0, epgCount: 0 };
        }
      }

      return {
        success: true,
        playlist: db.getPlaylistById(data.id),
        syncResult,
      };
    } catch (err) {
      console.error('[IPC] db:addPlaylist error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Delete a playlist (cascades to channels).
   * @param {string} playlistId
   * @returns {Object} { success }
   */
  ipcMain.handle('db:deletePlaylist', (_e, playlistId) => {
    try {
      db.deletePlaylist(playlistId);
      return { success: true };
    } catch (err) {
      console.error('[IPC] db:deletePlaylist error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Re-sync an existing playlist (re-fetch, re-parse, re-insert).
   * @param {string} playlistId
   * @returns {Promise<Object>} Sync result
   */
  ipcMain.handle('db:syncPlaylist', async (_e, playlistId) => {
    try {
      const playlist = db.getPlaylistById(playlistId);
      if (!playlist) {
        return { success: false, error: 'Playlist not found' };
      }

      let syncResult;
      if (playlist.type === 'xtream') {
        syncResult = await syncXtreamPlaylist(playlistId, playlist);
      } else {
        syncResult = await syncM3UPlaylist(playlistId, playlist.url);
      }

      return syncResult;
    } catch (err) {
      console.error('[IPC] db:syncPlaylist error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Set the active playlist (deactivates others in the same profile).
   * @param {Object} { profileId, playlistId }
   * @returns {Object} { success }
   */
  ipcMain.handle('db:setActivePlaylist', (_e, { profileId, playlistId }) => {
    try {
      db.setActivePlaylist(profileId, playlistId);
      return { success: true };
    } catch (err) {
      console.error('[IPC] db:setActivePlaylist error:', err);
      return { success: false, error: err.message };
    }
  });

  // ── Channel Queries ──────────────────────────────────────────────────

  /**
   * Get channels with pagination and optional group filter.
   * @param {string} playlistId
   * @param {string|null} groupTitle
   * @param {number} limit
   * @param {number} offset
   * @param {boolean} omitLocked
   * @returns {Object} { channels, total }
   */
  ipcMain.handle('db:getChannels', (_e, playlistId, groupTitle, limit = 200, offset = 0, omitLocked = false) => {
    try {
      const channels = db.getChannels(playlistId, groupTitle || null, limit, offset, omitLocked);
      const total = db.getChannelCount(playlistId, groupTitle || null, omitLocked);
      return { channels, total };
    } catch (err) {
      console.error('[IPC] db:getChannels error:', err);
      return { channels: [], total: 0 };
    }
  });

  /**
   * Get distinct categories (group_title values) for a playlist.
   * @param {string} playlistId
   * @param {boolean} omitLocked
   * @returns {Array<string>}
   */
  ipcMain.handle('db:getCategories', (_e, playlistId, omitLocked = false) => {
    try {
      return db.getCategories(playlistId, omitLocked);
    } catch (err) {
      console.error('[IPC] db:getCategories error:', err);
      return [];
    }
  });

  /**
   * Search channels by name.
   * @param {string} playlistId
   * @param {string} searchTerm
   * @param {number} limit
   * @param {number} offset
   * @param {boolean} omitLocked
   * @returns {Object} { channels }
   */
  ipcMain.handle('db:searchChannels', (_e, playlistId, searchTerm, limit = 100, offset = 0, omitLocked = false) => {
    try {
      const channels = db.searchChannels(playlistId, searchTerm, limit, offset, omitLocked);
      return { channels };
    } catch (err) {
      console.error('[IPC] db:searchChannels error:', err);
      return { channels: [] };
    }
  });

  /**
   * Toggle a channel's favorite status.
   * @param {string} playlistId
   * @param {number} channelId
   * @returns {Object} { isFavorite }
   */
  ipcMain.handle('db:toggleFavorite', (_e, playlistId, channelId) => {
    try {
      const isFavorite = db.toggleFavorite(playlistId, channelId);
      return { success: true, isFavorite };
    } catch (err) {
      console.error('[IPC] db:toggleFavorite error:', err);
      return { success: false, error: err.message };
    }
  });

  /**
   * Get all favorited channels for a playlist.
   * @param {string} playlistId
   * @returns {Array<Object>}
   */
  ipcMain.handle('db:getFavorites', (_e, playlistId) => {
    try {
      return db.getFavorites(playlistId);
    } catch (err) {
      console.error('[IPC] db:getFavorites error:', err);
      return [];
    }
  });

  // ── Parental Control ──────────────────────────────────────────────────

  ipcMain.handle('db:addLockedCategory', (_e, playlistId, groupTitle) => {
    try {
      db.addLockedCategory(playlistId, groupTitle);
      return { success: true };
    } catch (err) {
      console.error('[IPC] db:addLockedCategory error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('db:removeLockedCategory', (_e, playlistId, groupTitle) => {
    try {
      db.removeLockedCategory(playlistId, groupTitle);
      return { success: true };
    } catch (err) {
      console.error('[IPC] db:removeLockedCategory error:', err);
      return { success: false, error: err.message };
    }
  });

  ipcMain.handle('db:getLockedCategories', (_e, playlistId) => {
    try {
      return db.getLockedCategories(playlistId);
    } catch (err) {
      console.error('[IPC] db:getLockedCategories error:', err);
      return [];
    }
  });

  // ── VOD and Series Queries ─────────────────────────────────────────────

  ipcMain.handle('db:getVODsByCategory', (_e, playlistId, groupTitle, limit = 200, offset = 0) => {
    try {
      return db.getVODsByCategory(playlistId, groupTitle, limit, offset);
    } catch (err) {
      console.error('[IPC] db:getVODsByCategory error:', err);
      return [];
    }
  });

  ipcMain.handle('db:getVODCategories', (_e, playlistId) => {
    try {
      return db.getVODCategories(playlistId);
    } catch (err) {
      console.error('[IPC] db:getVODCategories error:', err);
      return [];
    }
  });

  ipcMain.handle('db:getSeriesByCategory', (_e, playlistId, groupTitle, limit = 200, offset = 0) => {
    try {
      return db.getSeriesByCategory(playlistId, groupTitle, limit, offset);
    } catch (err) {
      console.error('[IPC] db:getSeriesByCategory error:', err);
      return [];
    }
  });

  ipcMain.handle('db:getSeriesCategories', (_e, playlistId) => {
    try {
      return db.getSeriesCategories(playlistId);
    } catch (err) {
      console.error('[IPC] db:getSeriesCategories error:', err);
      return [];
    }
  });

  // ── EPG Queries ──────────────────────────────────────────────────────

  /**
   * Get EPG programs for a channel within a time window.
   * @param {string} channelId (tvg_id)
   * @param {number} startTime Epoch ms
   * @param {number} endTime Epoch ms
   * @returns {Array<Object>}
   */
  ipcMain.handle('db:getEPGForChannel', (_e, channelId, startTime, endTime) => {
    try {
      return db.getEPGForChannel(channelId, startTime, endTime);
    } catch (err) {
      console.error('[IPC] db:getEPGForChannel error:', err);
      return [];
    }
  });

  /**
   * Get EPG data summary (total count).
   * @returns {Object} { count }
   */
  ipcMain.handle('db:getEPGCount', (_e) => {
    try {
      return { count: db.getEPGCount() };
    } catch (err) {
      console.error('[IPC] db:getEPGCount error:', err);
      return { count: 0 };
    }
  });

  // ── Maintenance ──────────────────────────────────────────────────────

  /**
   * Manually trigger EPG cleanup.
   * @param {number} [retentionDays=5]
   * @returns {Object} { deleted }
   */
  ipcMain.handle('db:cleanupEPG', (_e, retentionDays = 5) => {
    try {
      return db.cleanupExpiredEPG(retentionDays);
    } catch (err) {
      console.error('[IPC] db:cleanupEPG error:', err);
      return { deleted: 0 };
    }
  });

  console.log('[IPC] All database IPC handlers registered.');
}

/**
 * Updates the mainWindow reference (e.g., after window recreation).
 *
 * @param {Electron.BrowserWindow} win
 */
function setMainWindow(win) {
  _mainWindow = win;
}

// ── Exports ──────────────────────────────────────────────────────────────────

module.exports = {
  registerIPCHandlers,
  setMainWindow,
};
