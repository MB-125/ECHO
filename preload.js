// Exposes a tiny, safe storage API to the game. The game falls back to
// localStorage when this bridge is absent (e.g. running in a plain browser).
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('echoNative', {
  isDesktop: true,
  listWorlds: () => ipcRenderer.invoke('worlds:list'),
  loadWorld: (id) => ipcRenderer.invoke('worlds:load', id),
  saveWorld: (id, json, meta) => ipcRenderer.invoke('worlds:save', id, json, meta),
  deleteWorld: (id) => ipcRenderer.invoke('worlds:delete', id),
  quit: () => ipcRenderer.invoke('app:quit'),
  toggleFullscreen: () => ipcRenderer.invoke('app:toggleFullscreen')
});
