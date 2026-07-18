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

// Session-level configuration (custom User-Agent for providers)
contextBridge.exposeInMainWorld('electronSession', {
  setUserAgent: (ua) => ipcRenderer.invoke('session:setUserAgent', ua)
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
  },
  // Recorded-Files Library
  list: () => ipcRenderer.invoke('recording:list'),
  delete: (id) => ipcRenderer.invoke('recording:delete', id),
  getPlaybackBaseUrl: () => ipcRenderer.invoke('recording:getPlaybackBaseUrl')
});

// Expose Scheduled Recordings API safely
contextBridge.exposeInMainWorld('electronSchedule', {
  add: (job) => ipcRenderer.invoke('schedule:add', job),
  list: () => ipcRenderer.invoke('schedule:list'),
  cancel: (id) => ipcRenderer.invoke('schedule:cancel', id),
  onUpdate: (callback) => {
    const sub = (event, data) => callback(data);
    ipcRenderer.on('schedule:update', sub);
    return () => ipcRenderer.removeListener('schedule:update', sub);
  }
});

// Expose Matrix Pro licensing safely
contextBridge.exposeInMainWorld('electronLicense', {
  activate: (key) => ipcRenderer.invoke('license:activate', key),
  status: () => ipcRenderer.invoke('license:status'),
  deactivate: () => ipcRenderer.invoke('license:deactivate')
});

// Expose a minimal external-link opener (for the "Get Pro" payment link)
contextBridge.exposeInMainWorld('electronApp', {
  openExternal: (url) => ipcRenderer.invoke('app:openExternal', url)
});

// Expose SQLite DB API safely
contextBridge.exposeInMainWorld('electronDB', {
  getPlaylists:      (profileId) => ipcRenderer.invoke('db:getPlaylists', profileId),
  addPlaylist:       (data) => ipcRenderer.invoke('db:addPlaylist', data),
  deletePlaylist:    (playlistId) => ipcRenderer.invoke('db:deletePlaylist', playlistId),
  syncPlaylist:      (playlistId) => ipcRenderer.invoke('db:syncPlaylist', playlistId),
  setActivePlaylist: (playlistId) => ipcRenderer.invoke('db:setActivePlaylist', playlistId),
  getChannels:       (playlistId, groupTitle, limit, offset, omitLocked) => ipcRenderer.invoke('db:getChannels', playlistId, groupTitle, limit, offset, omitLocked),
  getCategories:     (playlistId, omitLocked) => ipcRenderer.invoke('db:getCategories', playlistId, omitLocked),
  searchChannels:    (playlistId, searchTerm, limit, offset, omitLocked) => ipcRenderer.invoke('db:searchChannels', playlistId, searchTerm, limit, offset, omitLocked),
  toggleFavorite:    (playlistId, channelId) => ipcRenderer.invoke('db:toggleFavorite', playlistId, channelId),
  getFavorites:      (playlistId) => ipcRenderer.invoke('db:getFavorites', playlistId),
  addLockedCategory: (playlistId, groupTitle) => ipcRenderer.invoke('db:addLockedCategory', playlistId, groupTitle),
  removeLockedCategory: (playlistId, groupTitle) => ipcRenderer.invoke('db:removeLockedCategory', playlistId, groupTitle),
  getLockedCategories: (playlistId) => ipcRenderer.invoke('db:getLockedCategories', playlistId),
  getVODsByCategory: (playlistId, groupTitle, limit, offset) => ipcRenderer.invoke('db:getVODsByCategory', playlistId, groupTitle, limit, offset),
  getVODCategories:  (playlistId) => ipcRenderer.invoke('db:getVODCategories', playlistId),
  getSeriesByCategory: (playlistId, groupTitle, limit, offset) => ipcRenderer.invoke('db:getSeriesByCategory', playlistId, groupTitle, limit, offset),
  getSeriesCategories: (playlistId) => ipcRenderer.invoke('db:getSeriesCategories', playlistId),
  getSeriesEpisodes: (playlistId, seriesKey) => ipcRenderer.invoke('db:getSeriesEpisodes', playlistId, seriesKey),
  getSeriesEpisodesByCategory: (playlistId, groupTitle, limit, offset) => ipcRenderer.invoke('db:getSeriesEpisodesByCategory', playlistId, groupTitle, limit, offset),
  getMediaStats: (playlistId) => ipcRenderer.invoke('db:getMediaStats', playlistId),
  getEPGForChannel:  (channelId, startTime, endTime) => ipcRenderer.invoke('db:getEPGForChannel', channelId, startTime, endTime),
  onSyncProgress:    (callback) => {
    const handler = (_, data) => callback(data);
    ipcRenderer.on('db:syncProgress', handler);
    return () => ipcRenderer.removeListener('db:syncProgress', handler);
  }
});

// Expose logger
contextBridge.exposeInMainWorld('electronLog', {
  write: (level, message, errorObj = null) => ipcRenderer.invoke('log:write', level, message, errorObj),
  logMemory: (context) => ipcRenderer.invoke('log:memory', context)
});

// Removed the extra '}' from here
