// Saved data by key ('topbunk.run', 'topbunk.settings', 'topbunk.achievements', 'topbunk.stats', 'topbunk.quality'). Values are
// anything JSON can hold. The desktop build keeps each key in its own file in the saves folder, which Steam Cloud syncs (STEAM.md):
// preload.js hands the page every file once at startup and each change goes back through IPC. In a browser it's localStorage.
//   store.get(key) -> value or null    store.set(key, value)    store.remove(key)    store.onDisk
const disk = (typeof window !== 'undefined' && window.desktop && window.desktop.saves) || null;
const files = new Map(disk ? Object.entries(disk.files || {}) : []);

// localStorage can still hold an unquoted string from before (the graphics preset was kept that way)
function parse(text) {
  if (text == null) return null;
  try { return JSON.parse(text); } catch (e) { return text; }
}

function get(key) {
  if (disk) return parse(files.get(key));
  try { return parse(localStorage.getItem(key)); } catch (e) { return null; }
}

function set(key, value) {
  const text = JSON.stringify(value);
  if (text === undefined) { remove(key); return; }
  if (disk) { files.set(key, text); disk.write(key, text); return; }
  try { localStorage.setItem(key, text); } catch (e) { /* full, or blocked in a private window */ }
}

function remove(key) {
  if (disk) { files.delete(key); disk.remove(key); return; }
  try { localStorage.removeItem(key); } catch (e) { /* ignore */ }
}

export const store = { get, set, remove, onDisk: !!disk };
