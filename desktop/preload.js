'use strict';
// Runs in the page's isolated world before js/main.js, sandboxed (only `electron` is requirable here).
// window.desktop is everything the game can see of Electron, Steam and the save files. All async calls resolve to a
// boolean and never reject, so game code can fire and forget: `window.desktop?.achieve('NIGHT_1')`.
const { contextBridge, ipcRenderer } = require('electron');

const info = ipcRenderer.sendSync('desktop:info') || {};
const call = (channel, ...args) => ipcRenderer.invoke(channel, ...args).catch(() => false);

// The save files (js/store.js), all read before the page starts so it can load them synchronously. On the first desktop run
// whatever an earlier version kept in localStorage goes along to be written out; the flag stops that happening twice, so a
// save deleted later (a finished run) can't come back from the old copy. null when the folder can't be used: the page then
// falls back to localStorage.
const LEGACY = ['topbunk.run', 'topbunk.settings', 'topbunk.achievements', 'topbunk.stats', 'topbunk.quality'];
const MOVED = 'topbunk.saves';
function legacy() {
  try {
    if (localStorage.getItem(MOVED)) return null;
    const out = {};
    for (const k of LEGACY) { const v = localStorage.getItem(k); if (v !== null) out[k] = v; }
    return out;
  } catch (e) { return null; }
}
const files = ipcRenderer.sendSync('desktop:saves', legacy());
if (files) try { localStorage.setItem(MOVED, 'files'); } catch (e) { /* asked again next time; files already there win */ }

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
  // { key: JSON text } at startup; write() and remove() resolve once the file is written or gone
  saves: files ? {
    files,
    write: (key, text) => call('desktop:save', String(key), String(text)),
    remove: (key) => call('desktop:delete-save', String(key)),
  } : null,
});
