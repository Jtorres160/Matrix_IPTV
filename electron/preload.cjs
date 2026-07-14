// electron/preload.cjs

const { contextBridge, ipcRenderer } = require('electron');
// Expose VLC controls to the renderer process
contextBridge.exposeInMainWorld('electronVLC', {
  load: (config) => ipcRenderer.invoke('vlc:load', config),
  stop: () => ipcRenderer.invoke('vlc:stop'),
  check: () => ipcRenderer.invoke('vlc:check'),
                
  onError: (callback) => ipcRenderer.on('vlc:error', (_, error) => callback(error)),
  removeErrorListener: () => ipcRenderer.removeAllListeners('vlc:error')
});
// Expose electron store
contextBridge.exposeInMainWorld('electronStore', {
  get: (key) => ipcRenderer.invoke('store:get', key),
  set: (key, value) => ipcRenderer.invoke('store:set', key, value),
  delete: (key) => ipcRenderer.invoke('store:delete', key),
            
  clear: () => ipcRenderer.invoke('store:clear')
});
// Also expose desktop detection
contextBridge.exposeInMainWorld('desktop', {
  isElectron: true
});

// Removed the extra '}' from here
