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

// Expose Recording Engine API safely
contextBridge.exposeInMainWorld('electronRecording', {
  start: (streamId, url, filename) => ipcRenderer.invoke('recording:start', streamId, url, filename),
  stop: (streamId) => ipcRenderer.invoke('recording:stop', streamId),
  getStatus: () => ipcRenderer.invoke('recording:status'),
  onProgress: (callback) => {
    const subscription = (event, data) => callback(data);
    ipcRenderer.on('recording:progress', subscription);
    // Return a cleanup function so React can safely unsubscribe
    return () => ipcRenderer.removeListener('recording:progress', subscription);
  }
});

// Expose SQLite DB API safely
contextBridge.exposeInMainWorld('electronDB', {
  getPlaylists:      (profileId) => ipcRenderer.invoke('db:getPlaylists', profileId),
  addPlaylist:       (data) => ipcRenderer.invoke('db:addPlaylist', data),
  deletePlaylist:    (playlistId) => ipcRenderer.invoke('db:deletePlaylist', playlistId),
  syncPlaylist:      (playlistId) => ipcRenderer.invoke('db:syncPlaylist', playlistId),
  setActivePlaylist: (playlistId) => ipcRenderer.invoke('db:setActivePlaylist', playlistId),
  getChannels:       (playlistId, groupTitle, limit, offset) => ipcRenderer.invoke('db:getChannels', playlistId, groupTitle, limit, offset),
  getCategories:     (playlistId) => ipcRenderer.invoke('db:getCategories', playlistId),
  searchChannels:    (playlistId, searchTerm, limit, offset) => ipcRenderer.invoke('db:searchChannels', playlistId, searchTerm, limit, offset),
  toggleFavorite:    (playlistId, channelId) => ipcRenderer.invoke('db:toggleFavorite', playlistId, channelId),
  getFavorites:      (playlistId) => ipcRenderer.invoke('db:getFavorites', playlistId),
  getEPGForChannel:  (channelId, startTime, endTime) => ipcRenderer.invoke('db:getEPGForChannel', channelId, startTime, endTime),
  onSyncProgress:    (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('db:syncProgress', handler);
    return () => ipcRenderer.removeListener('db:syncProgress', handler);
  }
});

// Removed the extra '}' from here
