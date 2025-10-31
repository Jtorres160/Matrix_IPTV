const { contextBridge } = require('electron')
const Store = require('electron-store')

// Initialize electron-store in the main process
const store = new Store()

contextBridge.exposeInMainWorld('desktop', {
	isElectron: true,
})

// Expose a 'localStorage'-like API for zustand
// This allows zustand's persist middleware to save to a JSON file
// instead of the browser's localStorage.
contextBridge.exposeInMainWorld('electronStore', {
  setItem: (key, value) => {
    store.set(key, value)
  },
  getItem: (key) => {
    const value = store.get(key)
    // Match localStorage API, which returns null for missing keys
    return value === undefined ? null : value
  },
  removeItem: (key) => {
    store.delete(key)
  },
})