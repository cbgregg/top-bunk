'use strict';
// Runs in the page's isolated world before js/main.js, sandboxed (only `electron` is requirable here).
// window.desktop is everything the game can see of Electron and Steam. All async calls resolve to a
// boolean and never reject, so game code can fire and forget: `window.desktop?.achieve('NIGHT_1')`.
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('desktop:info') || {};
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args).catch(() => false);

contextBridge.exposeInMainWorld('desktop', {
  isDesktop: true,
  isSteam: !!info.isSteam,
  playerName: info.playerName || null,     // Steam persona name, null when not running under Steam
  platform: info.platform || '',           // 'win32' | 'darwin' | 'linux'
  version: info.version || '',
  achieve: (id) => call('desktop:achieve', String(id)),                   // unlock a Steam achievement by API name
  clearAchievement: (id) => call('desktop:clear-achievement', String(id)),  // dev: lock it again
  isAchieved: (id) => call('desktop:is-achieved', String(id)),
  quit: () => call('desktop:quit'),
  toggleFullscreen: () => call('desktop:toggle-fullscreen'),            // resolves to the new state
  isFullscreen: () => call('desktop:is-fullscreen'),
});
