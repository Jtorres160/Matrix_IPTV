// electron/main.cjs

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const http = require('http');
const https = require('https');

// ── Phase 7: SQLite Database Layer ───────────────────────────────────────────
const { initDatabase, closeDatabase, cleanupExpiredEPG } = require('./db.cjs');
const { registerIPCHandlers, setMainWindow } = require('./ipcHandlers.cjs');
// ─────────────────────────────────────────────────────────────────────────────

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
}

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
      
      const downloadsPath = app.getPath('downloads');
      const filePath = path.join(downloadsPath, finalFilename);

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

ipcMain.handle('recording:start', async (event, streamId, url, filename) => {
  return await recordingManager.startRecording(streamId, url, filename);
});

ipcMain.handle('recording:stop', async (event, streamId) => {
  return await recordingManager.stopRecording(streamId);
});

ipcMain.handle('recording:status', async () => {
  return recordingManager.getStatus();
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
  await initStore(); // Initialize store before creating window

  // ── Phase 7: Initialize SQLite database ─────────────────────────────────
  try {
    initDatabase();
    // Prune EPG entries older than 5 days on every launch
    cleanupExpiredEPG(5);
    console.log('[Main] SQLite database initialized and EPG cleanup complete.');
  } catch (err) {
    console.error('[Main] Failed to initialize SQLite database:', err);
  }
  // ────────────────────────────────────────────────────────────────────────

  createWindow();

  // ── Phase 7: Register database IPC handlers ─────────────────────────────
  if (mainWindow) {
    registerIPCHandlers(mainWindow);
  }
  // ────────────────────────────────────────────────────────────────────────
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
  if (vlcProcess) {
    vlcProcess.kill();
  }
  // ── Phase 7: Close SQLite database gracefully ───────────────────────────
  closeDatabase();
  // ────────────────────────────────────────────────────────────────────────
});
