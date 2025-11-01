// electron/main.cjs - FIXED VERSION

const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { spawn } = require('child_process');

let mainWindow;
let vlcProcess = null;
let store;

// *** FIX: Properly detect development vs production ***
const isDev = process.env.VITE_DEV_SERVER_URL !== undefined;

function debounce(fn, delay) {
  let timeoutId;
  return function (...args) {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn.apply(this, args), delay);
  };
}

async function initStore() {
  const Store = (await import('electron-store')).default;
  store = new Store();
}

function createWindow() {
  const bounds = store ? store.get('windowBounds') : null;

  mainWindow = new BrowserWindow({
    ...(bounds || { width: 1400, height: 900 }),
                                 webPreferences: {
                                   nodeIntegration: false,
                                   contextIsolation: true,
                                   preload: path.join(__dirname, 'preload.cjs')
                                 }
  });

  const saveBounds = () => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (store) store.set('windowBounds', mainWindow.getBounds());
  };

    const debouncedSaveBounds = debounce(saveBounds, 500);
    mainWindow.on('resize', debouncedSaveBounds);
    mainWindow.on('move', debouncedSaveBounds);
    mainWindow.on('close', saveBounds);

    // *** FIX: Load correct path based on environment ***
    if (isDev) {
      console.log('[Matrix_IPTV] Loading DEV from:', process.env.VITE_DEV_SERVER_URL);
      mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
      mainWindow.webContents.openDevTools();
    } else {
      const indexPath = path.join(__dirname, '../dist/index.html');
      console.log('[Matrix_IPTV] Loading PRODUCTION from:', indexPath);
      mainWindow.loadFile(indexPath);
    }

    // *** FIX: Add error logging ***
    mainWindow.webContents.on('did-fail-load', (event, errorCode, errorDescription) => {
      console.error('[Matrix_IPTV] Failed to load:', errorCode, errorDescription);
    });

    mainWindow.webContents.on('console-message', (event, level, message) => {
      console.log('[Matrix_IPTV] Renderer:', message);
    });
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
      console.error('[Matrix_IPTV] VLC process error:', err);
      if (mainWindow) {
        mainWindow.webContents.send('vlc:error', err.message);
      }
    });
    vlcProcess.on('close', (code) => {
      console.log(`[Matrix_IPTV] VLC process exited with code ${code}`);
      vlcProcess = null;
    });
    return { success: true };
  } catch (error) {
    console.error('[Matrix_IPTV] Failed to start VLC:', error);
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

app.whenReady().then(async () => {
  console.log('[Matrix_IPTV] App starting...');
  console.log('[Matrix_IPTV] Development mode:', isDev);
  console.log('[Matrix_IPTV] __dirname:', __dirname);
  await initStore();
  createWindow();
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
});
