// electron/main.cjs

const { app, BrowserWindow, ipcMain, Menu, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');
const logger = require('./logger.cjs');

// ── Phase 7: SQLite Database Layer ───────────────────────────────────────────
const { initDatabase, closeDatabase, cleanupExpiredEPG } = require('./db.cjs');
const { registerIPCHandlers, setMainWindow } = require('./ipcHandlers.cjs');
// ─────────────────────────────────────────────────────────────────────────────

// ── Recorded-Files Library ──────────────────────────────────────────────────
const { listRecordings, resolveRecordingPath, createRecordingServer } = require('./recordingLibrary.cjs');
const { createScheduler } = require('./scheduler.cjs');
const { verifyLicense, STORE_KEY: LICENSE_STORE_KEY } = require('./licensing.cjs');
let recordingServer = null;
let scheduler = null;
// Single source of truth for where DVR captures live and are served from.
function getRecordingsDir() {
  return path.join(app.getPath('downloads'), 'Matrix Recordings');
}
// ─────────────────────────────────────────────────────────────────────────────

// Global Error Catching
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', error);
});
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Promise Rejection', reason);
});

app.on('render-process-gone', (event, webContents, details) => {
  logger.error('Render Process Gone', details);
});
app.on('child-process-gone', (event, details) => {
  logger.error('Child Process Gone', details);
});

ipcMain.handle('log:write', (event, level, message, errorObj) => {
  if (logger[level]) {
    logger[level](message, errorObj);
  }
});
ipcMain.handle('log:memory', (event, context) => {
  logger.logMemory(context);
});

let mainWindow;
let vlcProcess = null;
let store;

// --- *** NEW: Helper function to debounce saving *** ---
function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}
// --- *** END OF CHANGE *** ---

async function initStore() {
  const Store = (await import('electron-store')).default;
  store = new Store();
}

function createWindow() {
  // --- *** NEW: Load saved window bounds *** ---
  const bounds = store.get('windowBounds');
  // --- *** END OF CHANGE *** ---

  mainWindow = new BrowserWindow({
    // --- *** NEW: Use saved bounds or set defaults *** ---
    ...(bounds || { width: 1400, height: 900 }),
                                 // --- *** END OF CHANGE *** ---
                                 webPreferences: {
                                   nodeIntegration: false,
                                   contextIsolation: true,
                                   preload: path.join(__dirname, 'preload.cjs')
                                 }
  });

  // --- *** NEW: Save bounds on resize, move, or close *** ---
  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    store.set('windowBounds', mainWindow.getBounds());
  };

  // Debounce move/resize for performance, but save immediately on close
  const debouncedSaveBounds = debounce(saveBounds, 500);
  mainWindow.on('resize', debouncedSaveBounds);
  mainWindow.on('move', debouncedSaveBounds);
  mainWindow.on('close', saveBounds);
  // --- *** END OF CHANGE *** ---

  // Load your app
  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
  }

  // --- *** NEW: Native Context Menu *** ---
  mainWindow.webContents.on('context-menu', (event, params) => {
    const template = [];
    
    if (params.isEditable) {
      template.push({ role: 'undo' });
      template.push({ role: 'redo' });
      template.push({ type: 'separator' });
      template.push({ role: 'cut' });
    }

    if (params.isEditable || params.selectionText.trim().length > 0) {
      template.push({ role: 'copy' });
    }

    if (params.isEditable) {
      template.push({ role: 'paste' });
      template.push({ type: 'separator' });
      template.push({ role: 'selectAll' });
    }

    if (!app.isPackaged) {
      if (template.length > 0) template.push({ type: 'separator' });
      template.push({ role: 'toggleDevTools' });
    }

    if (template.length > 0) {
      const contextMenu = Menu.buildFromTemplate(template);
      contextMenu.popup(mainWindow);
    }
  });
  // --- *** END OF CHANGE *** ---
}

// ── Custom User-Agent (Settings > Advanced) ─────────────────────────────────
// Applies to every request the renderer makes: playlist downloads, EPG
// fetches and stream requests. An empty/blank value restores the default.
const { session } = require('electron');
let defaultUserAgent = null;
ipcMain.handle('session:setUserAgent', (event, ua) => {
  try {
    const ses = session.defaultSession;
    if (defaultUserAgent === null) defaultUserAgent = ses.getUserAgent();
    const value = typeof ua === 'string' ? ua.trim() : '';
    ses.setUserAgent(value || defaultUserAgent);
    logger.info(`User-Agent ${value ? 'set to: ' + value : 'reset to default'}`);
    return { success: true };
  } catch (err) {
    logger.error('Failed to set User-Agent', err);
    return { success: false, error: err.message };
  }
});

// Electron Store IPC Handlers
ipcMain.handle('store:get', async (event, key) => {
  if (!store) await initStore();
  return store.get(key);
});
ipcMain.handle('store:set', async (event, key, value) => {
  if (!store) await initStore();
  store.set(key, value);
  return true;
});
ipcMain.handle('store:delete', async (event, key) => {
  if (!store) await initStore();
  store.delete(key);
  return true;
});
ipcMain.handle('store:clear', async () => {
  if (!store) await initStore();
  store.clear();
  return true;
});
// --- *** NEW: Phase 4 Recording Engine *** ---
class RecordingManager {
  constructor() {
    this.activeRecordings = new Map();
  }

  startRecording(streamId, url, filename) {
    return new Promise((resolve, reject) => {
      if (this.activeRecordings.has(streamId)) {
        return reject(new Error('Stream already recording.'));
      }

      // Sanitize filename and append timestamp
      const safeFilename = filename.replace(/[/\\?%*:|"<>]/g, '_');
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const finalFilename = `${safeFilename}_${timestamp}.ts`;
      
      const recordingsDir = getRecordingsDir();
      try { fs.mkdirSync(recordingsDir, { recursive: true }); } catch (e) { /* best effort */ }
      const filePath = path.join(recordingsDir, finalFilename);

      const isHttps = url.startsWith('https');
      const client = isHttps ? https : http;

      const req = client.get(url, { timeout: 10000 }, (res) => {
        // Explicitly reject non-200 responses
        if (res.statusCode !== 200) {
          req.destroy();
          return reject(new Error(`Failed to start recording. HTTP Status: ${res.statusCode}`));
        }

        const writeStream = fs.createWriteStream(filePath);
        
        // Masterclass backpressure handling natively via Node's pipe
        res.pipe(writeStream);

        const startTime = Date.now();
        
        const intervalId = setInterval(() => {
          if (mainWindow && !mainWindow.isDestroyed()) {
            const bytesWritten = writeStream.bytesWritten || 0;
            const elapsedMs = Date.now() - startTime;
            mainWindow.webContents.send('recording:progress', {
              streamId,
              bytesWritten,
              elapsedMs,
              filePath
            });
          }
        }, 1000);

        this.activeRecordings.set(streamId, {
          request: req,
          response: res,
          writeStream,
          filePath,
          startTime,
          intervalId
        });

        res.on('error', (err) => {
          console.error(`Recording stream error [${streamId}]:`, err);
          this.stopRecording(streamId);
        });
        
        writeStream.on('error', (err) => {
          console.error(`File write error [${streamId}]:`, err);
          this.stopRecording(streamId);
        });

        resolve({ success: true, filePath, streamId });
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Connection timed out.'));
      });

      req.on('error', (err) => {
        reject(err);
      });
    });
  }

  async stopRecording(streamId) {
    const record = this.activeRecordings.get(streamId);
    if (!record) return { success: false, message: 'No active recording found for this stream.' };

    clearInterval(record.intervalId);
    
    // Gracefully flush buffer to disk and close file without truncation
    if (record.writeStream && !record.writeStream.destroyed) {
      record.writeStream.end();
    }
    
    // Abort the incoming HTTP socket safely
    if (record.request && !record.request.destroyed) {
      record.request.destroy();
    }

    this.activeRecordings.delete(streamId);
    return { success: true, streamId };
  }

  getStatus() {
    const statusList = [];
    for (const [streamId, record] of this.activeRecordings.entries()) {
      statusList.push({
        streamId,
        filePath: record.filePath,
        startTime: record.startTime,
        sizeMb: record.writeStream ? (record.writeStream.bytesWritten / (1024 * 1024)).toFixed(2) : 0
      });
    }
    return statusList;
  }
}

const recordingManager = new RecordingManager();

function ensureScheduler() {
  if (scheduler) return scheduler;
  scheduler = createScheduler({
    store,
    recordingManager,
    onUpdate: (jobs) => {
      if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('schedule:update', jobs);
    },
  });
  return scheduler;
}

ipcMain.handle('recording:start', async (event, streamId, url, filename) => {
  return await recordingManager.startRecording(streamId, url, filename);
});

ipcMain.handle('recording:stop', async (event, streamId) => {
  return await recordingManager.stopRecording(streamId);
});

ipcMain.handle('recording:status', async () => {
  return recordingManager.getStatus();
});

// ── Recorded-Files Library IPC ──────────────────────────────────────────────
ipcMain.handle('recording:list', async () => {
  return await listRecordings(getRecordingsDir());
});

ipcMain.handle('recording:delete', async (event, id) => {
  try {
    const filePath = resolveRecordingPath(getRecordingsDir(), id);
    if (!filePath) return { success: false, error: 'Invalid recording id' };
    await fs.promises.unlink(filePath);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
});

ipcMain.handle('recording:getPlaybackBaseUrl', async () => {
  return recordingServer ? recordingServer.baseUrl : null;
});

// ── Scheduled Recordings IPC ────────────────────────────────────────────────
ipcMain.handle('schedule:add', async (event, job) => ensureScheduler().add(job));
ipcMain.handle('schedule:list', async () => ensureScheduler().list());
ipcMain.handle('schedule:cancel', async (event, id) => ensureScheduler().cancel(id));
// ────────────────────────────────────────────────────────────────────────────

// ── Matrix Pro Licensing IPC ────────────────────────────────────────────────
ipcMain.handle('license:activate', async (event, key) => {
  if (!store) await initStore();
  const entitlement = verifyLicense(key);
  if (!entitlement) return { success: false, error: 'Invalid or corrupted license key' };
  store.set(LICENSE_STORE_KEY, { key, ...entitlement });
  return { success: true, entitlement };
});

ipcMain.handle('license:status', async () => {
  if (!store) await initStore();
  const saved = store.get(LICENSE_STORE_KEY);
  if (!saved || !saved.key) return { tier: 'free' };
  // Re-verify on every read so a hand-edited store value can't grant Pro.
  const entitlement = verifyLicense(saved.key);
  if (!entitlement) {
    store.delete(LICENSE_STORE_KEY);
    return { tier: 'free' };
  }
  return entitlement;
});

ipcMain.handle('license:deactivate', async () => {
  if (!store) await initStore();
  store.delete(LICENSE_STORE_KEY);
  return { success: true };
});
// ────────────────────────────────────────────────────────────────────────────

ipcMain.handle('app:openExternal', async (event, url) => {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { success: false };
  await shell.openExternal(url);
  return { success: true };
});
// --- *** END OF CHANGE *** ---

// VLC IPC Handlers
ipcMain.handle('vlc:load', async (event, { url, title, options = [] }) => {
  try {
    if (vlcProcess) {
      vlcProcess.kill();
    }
    const vlcPath = getVLCPath();
    if (!vlcPath) {
      throw new Error('VLC not found. Please install VLC Media Player.');
    }
    const args = [
      url,
      '--meta-title', title || 'Matrix_IPTV',
      '--network-caching=1000',
      '--file-caching=1000',
      '--live-caching=1000',
      '--sout-mux-caching=1000',
      ...options
    ];
    vlcProcess = spawn(vlcPath, args);
    vlcProcess.on('error', (err) => {
      console.error('VLC process error:', err);
      if (mainWindow) {
        mainWindow.webContents.send('vlc:error', err.message);
      }
    });
    vlcProcess.on('close', (code) => {
      console.log(`VLC process exited with code ${code}`);
      vlcProcess = null;
    });
    return { success: true };
  } catch (error) {
    console.error('Failed to start VLC:', error);
    throw error;
  }
});
ipcMain.handle('vlc:stop', async () => {
  if (vlcProcess) {
    vlcProcess.kill();
    vlcProcess = null;
  }
  return { success: true };
});
ipcMain.handle('vlc:check', async () => {
  const vlcPath = getVLCPath();
  return { available: !!vlcPath, path: vlcPath };
});
// Helper function to find VLC installation
function getVLCPath() {
  const platform = process.platform;
  const fs = require('fs');
  const possiblePaths = {
    win32: [
      'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
      'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe',
      process.env.PROGRAMFILES + '\\VideoLAN\\VLC\\vlc.exe',
    ],
    darwin: [
      '/Applications/VLC.app/Contents/MacOS/VLC',
      '/Applications/VLC media player.app/Contents/MacOS/VLC',
    ],
    linux: [
      '/usr/bin/vlc',
      '/usr/local/bin/vlc',
      '/snap/bin/vlc',
      '/usr/bin/flatpak run org.videolan.VLC', // Flatpak
    ]
  };
  const paths = possiblePaths[platform] || [];
  for (const vlcPath of paths) {
    try {
      if (fs.existsSync(vlcPath)) {
        return vlcPath;
      }
    } catch (e) {
      continue;
    }
  }
  if (platform !== 'win32') {
    return 'vlc';
  }
  return null;
}

// Initialize app
app.whenReady().then(async () => {
  logger.info('APP_START');
  logger.logMemory('Startup Memory');
  
  await initStore(); // Initialize store before creating window

  // ── Phase 7: Initialize SQLite database ─────────────────────────────────
  try {
    initDatabase();
    // Prune EPG entries older than 5 days on every launch
    cleanupExpiredEPG(5);
    console.log('[Main] SQLite database initialized and EPG cleanup complete.');
  } catch (err) {
    console.error('[Main] Failed to initialize SQLite database:', err);
    logger.error('Failed to initialize SQLite database', err);
  }
  // ────────────────────────────────────────────────────────────────────────

  // ── CORS unblock for IPTV providers ──────────────────────────────────────
  // Xtream panels and most stream servers send no CORS headers, which blocks
  // renderer fetch (player_api/EPG) and hls.js XHRs. Force a permissive
  // Access-Control-Allow-Origin on every response. Credentials mode is never
  // used by this app, so '*' is safe here.
  try {
    session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
      const headers = details.responseHeaders || {};
      for (const key of Object.keys(headers)) {
        if (/^access-control-allow-origin$/i.test(key)) delete headers[key];
      }
      headers['Access-Control-Allow-Origin'] = ['*'];
      callback({ responseHeaders: headers });
    });
  } catch (err) {
    logger.error('Failed to install CORS unblock', err);
  }
  // ─────────────────────────────────────────────────────────────────────────

  createWindow();

  // ── Phase 7: Register database IPC handlers ─────────────────────────────
  if (mainWindow) {
    registerIPCHandlers(mainWindow);
  }
  // ────────────────────────────────────────────────────────────────────────

  // ── Recorded-Files Library: start the loopback playback server ──────────
  try {
    fs.mkdirSync(getRecordingsDir(), { recursive: true });
    recordingServer = await createRecordingServer(getRecordingsDir());
    logger.info(`[Recordings] server on ${recordingServer.baseUrl}`);
  } catch (e) {
    logger.error('[Recordings] server failed to start', e);
  }
  // ────────────────────────────────────────────────────────────────────────

  // ── Scheduled Recordings: reconcile + arm persisted jobs ────────────────
  try {
    if (!store) await initStore();
    ensureScheduler().init();
  } catch (e) {
    logger.error('[Scheduler] init failed', e);
  }
  // ────────────────────────────────────────────────────────────────────────

  logger.info('APP_READY');
});
app.on('window-all-closed', () => {
  if (vlcProcess) {
    vlcProcess.kill();
  }
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
app.on('before-quit', () => {
  logger.info('APP_QUIT');
  if (vlcProcess) {
    vlcProcess.kill();
  }
  // ── Phase 7: Close SQLite database gracefully ───────────────────────────
  closeDatabase();
  // ────────────────────────────────────────────────────────────────────────
  if (recordingServer) { try { recordingServer.close(); } catch (e) { /* ignore */ } }
});
