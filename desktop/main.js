'use strict';
// Top Bunk desktop shell (Electron main process).
// Serves the web game from the repo root over the privileged app:// scheme (static.js), bridges Steam
// (steam.js) and the save files to the page through preload.js, and runs the headless smoke test behind `--smoke`.
//
//   electron .                   play (fullscreen; F11 or Alt+Enter toggles)
//   electron . --windowed        start in a window
//   electron . --hash=night      same as opening index.html#night (dev shortcut, see README; a packaged build needs --devtools too)
//   electron . --no-steam        do not touch Steam
//   electron . --user-data=DIR   keep Electron's data and the saves in DIR (DIR/saves) instead of the usual folders
//   electron . --smoke           load the game, change a setting and check its save file, print SMOKE_OK / SMOKE_FAIL <reason>,
//                                exit 0 / 1 within 90 s. It uses a throwaway folder unless --user-data names one: run it twice
//                                with the same DIR and the second run also checks the page started with what the first one saved.
const { app, BrowserWindow, Menu, ipcMain, protocol, session, shell } = require('electron');
const fs = require('fs');
const os = require('os');
const path = require('path');
const serve = require('./static');
const steamBridge = require('./steam');

const ROOT = path.join(__dirname, '..');                 // repo root (inside app.asar when packaged)
const ARGS = process.argv.slice(1);
const flag = (name) => ARGS.includes(name);
const opt = (name) => { const a = ARGS.find((s) => s.startsWith(name + '=')); return a ? a.slice(name.length + 1) : null; };
const SMOKE = flag('--smoke');
const SMOKE_MS = 90e3;
const SCHEME = 'app';
const ORIGIN = `${SCHEME}://top-bunk`;
const DEVTOOLS = !app.isPackaged || SMOKE || flag('--devtools');
const log = (...a) => console.log('[desktop]', ...a);

// the smoke test never touches the player's saves (and the single-instance lock below lives in userData too, so this comes first)
const USER_DATA = opt('--user-data') ? path.resolve(opt('--user-data')) : SMOKE ? fs.mkdtempSync(path.join(os.tmpdir(), 'top-bunk-smoke-')) : null;
const THROWAWAY = SMOKE && !opt('--user-data');
if (USER_DATA) app.setPath('userData', USER_DATA);
const SAVES = savesFolder();

let win = null;

// One running copy (the smoke test may run beside a game that is open).
if (!SMOKE && !app.requestSingleInstanceLock()) { app.quit(); }
else main();

function main() {
  protocol.registerSchemesAsPrivileged([{ scheme: SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, stream: true, codeCache: true } }]);

  if (SMOKE) {
    // Headless CI boxes have no GPU: let Chromium rasterize WebGL with SwiftShader.
    app.commandLine.appendSwitch('enable-unsafe-swiftshader');
    app.commandLine.appendSwitch('use-gl', 'angle');
    app.commandLine.appendSwitch('use-angle', 'swiftshader');
    app.commandLine.appendSwitch('ignore-gpu-blocklist');
    app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
    process.on('uncaughtException', (e) => smokeEnd(false, `uncaught: ${e && e.stack || e}`));
  }

  // Steam before ready: the overlay's Chromium switches only count before the GPU process starts.
  const steam = steamBridge.create({ log, disabled: flag('--no-steam'), restart: app.isPackaged && !SMOKE });
  if (steam.restart) { app.quit(); return; }

  app.on('second-instance', () => { if (win) { if (win.isMinimized()) win.restore(); win.focus(); } });
  app.on('window-all-closed', () => app.quit());
  app.on('web-contents-created', (e, wc) => {
    wc.on('will-attach-webview', (ev) => ev.preventDefault());
    wc.setWindowOpenHandler(({ url }) => { if (/^https?:\/\//i.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    wc.on('will-navigate', (ev, url) => { if (!url.startsWith(ORIGIN + '/')) ev.preventDefault(); });
  });

  app.whenReady().then(() => {
    protocol.handle(SCHEME, (request) => serve.respond(ROOT, request));
    const allowed = new Set(['pointerLock', 'keyboardLock', 'fullscreen']);
    session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(allowed.has(permission)));
    session.defaultSession.setPermissionCheckHandler((wc, permission) => allowed.has(permission));
    Menu.setApplicationMenu(process.platform === 'darwin' ? macMenu() : null);   // macOS keeps Cmd+Q, Cmd+H; elsewhere no menu at all
    registerIpc(steam);
    if (SMOKE) blockNetwork();
    win = createWindow();
    if (SMOKE) smoke(win, steam);
  });
}

function createWindow() {
  const w = new BrowserWindow({
    width: 1280, height: 720, minWidth: 640, minHeight: 360, show: false, title: 'Top Bunk',
    fullscreen: !SMOKE && !flag('--windowed'), backgroundColor: '#000000', autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, sandbox: true,
      backgroundThrottling: false, spellcheck: false, devTools: DEVTOOLS,
    },
  });
  w.once('ready-to-show', () => w.show());
  w.on('closed', () => { if (win === w) win = null; });
  w.webContents.on('before-input-event', (e, input) => {   // seen before the page's own key handlers
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11' || (input.key === 'Enter' && input.alt && !input.control && !input.meta)) { e.preventDefault(); toggleFullscreen(w); }
    else if (input.key === 'F12' && DEVTOOLS) { e.preventDefault(); w.webContents.toggleDevTools(); }
  });
  const hash = !app.isPackaged || flag('--devtools') ? opt('--hash') : null;   // (a jump from the Steam launch options would skip the game)
  w.loadURL(`${ORIGIN}/index.html${hash ? '#' + hash : ''}`);
  return w;
}

function toggleFullscreen(w) { if (w && !w.isDestroyed()) w.setFullScreen(!w.isFullScreen()); }

function macMenu() {
  return Menu.buildFromTemplate([
    { role: 'appMenu' },
    { label: 'View', submenu: [{ role: 'togglefullscreen' }] },
    { role: 'windowMenu' },
  ]);
}

// Every handler checks the call comes from the game window, so no other web content could reach Steam or the saves.
function registerIpc(steam) {
  const fromGame = (e) => !!win && !win.isDestroyed() && e.sender === win.webContents;
  ipcMain.on('desktop:info', (e) => {
    e.returnValue = fromGame(e) ? { isSteam: steam.isSteam, playerName: steam.playerName, appId: steam.appId, version: app.getVersion(), platform: process.platform } : null;
  });
  ipcMain.on('desktop:saves', (e, legacy) => {
    if (!fromGame(e)) { e.returnValue = null; return; }
    try { e.returnValue = openSaves(legacy); }
    catch (err) { log(`saves: cannot use ${SAVES} (${err.message}); the game keeps them in localStorage this time`); e.returnValue = null; }
  });
  ipcMain.handle('desktop:save', (e, key, text) => fromGame(e) && writeSave(String(key), text));
  ipcMain.handle('desktop:delete-save', (e, key) => fromGame(e) && deleteSave(String(key)));
  ipcMain.handle('desktop:achieve', (e, id) => fromGame(e) && steam.achieve(id));
  ipcMain.handle('desktop:clear-achievement', (e, id) => fromGame(e) && steam.clearAchievement(id));
  ipcMain.handle('desktop:is-achieved', (e, id) => fromGame(e) && steam.isAchieved(id));
  ipcMain.handle('desktop:quit', (e) => { if (fromGame(e)) setImmediate(() => app.quit()); return true; });
  ipcMain.handle('desktop:toggle-fullscreen', (e) => { if (!fromGame(e)) return false; toggleFullscreen(win); return win.isFullScreen(); });
  ipcMain.handle('desktop:is-fullscreen', (e) => fromGame(e) && win.isFullScreen());
}

// ---- saves ------------------------------------------------------------------------------------
// One JSON file per key (js/store.js), in the folder Steam Auto-Cloud syncs (STEAM.md): <userData>/saves on Windows and macOS.
// On Linux Electron's userData is under ~/.config, which Steam has no documented cloud root for, so the saves go under
// $XDG_DATA_HOME instead (LinuxXdgDataHome); Steam and the game it launched read the same variable.
const SAVE_KEY = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
const SAVE_MAX = 1 << 20;
const saveFile = (key) => path.join(SAVES, `${key}.json`);
const isJson = (text) => { try { JSON.parse(text); return true; } catch (e) { return false; } };

function savesFolder() {
  if (process.platform !== 'linux' || USER_DATA) return path.join(app.getPath('userData'), 'saves');
  const xdg = process.env.XDG_DATA_HOME;
  return path.join(xdg && path.isAbsolute(xdg) ? xdg : path.join(os.homedir(), '.local', 'share'), app.getName(), 'saves');
}

// Every save as { key: JSON text }, read once when the page starts (preload.js). `legacy` is what an earlier version kept in
// localStorage, sent on the first desktop run only: each value is written out unless that key already has a file (from Steam Cloud, say).
function openSaves(legacy) {
  fs.mkdirSync(SAVES, { recursive: true });
  for (const [key, value] of Object.entries(legacy && typeof legacy === 'object' ? legacy : {})) {
    if (typeof value === 'string' && SAVE_KEY.test(key) && !fs.existsSync(saveFile(key))) writeSave(key, isJson(value) ? value : JSON.stringify(value));
  }
  const out = {};
  for (const name of fs.readdirSync(SAVES)) {
    const key = name.slice(0, -'.json'.length);
    if (!name.endsWith('.json') || !SAVE_KEY.test(key)) continue;
    let text = null;
    try { text = fs.readFileSync(path.join(SAVES, name), 'utf8'); } catch (e) { log(`saves: cannot read ${name}: ${e.message}`); continue; }
    if (isJson(text)) out[key] = text; else log(`saves: ${name} is not JSON, left alone`);
  }
  return out;
}

// written to a temp file and renamed over the old one, so a crash or power cut mid-write leaves the last good save, never half of one
function writeSave(key, text) {
  if (!SAVE_KEY.test(key) || typeof text !== 'string' || text.length > SAVE_MAX || !isJson(text)) return false;
  const file = saveFile(key), tmp = `${file}.tmp`;
  try {
    fs.mkdirSync(SAVES, { recursive: true });
    const fd = fs.openSync(tmp, 'w');
    try { fs.writeFileSync(fd, text); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, file);
    return true;
  } catch (e) {
    log(`saves: cannot write ${key}: ${e.message}`);
    try { fs.unlinkSync(tmp); } catch (e2) { /* never created */ }
    return false;
  }
}

function deleteSave(key) {
  if (!SAVE_KEY.test(key)) return false;
  try { fs.unlinkSync(saveFile(key)); } catch (e) { if (e.code !== 'ENOENT') { log(`saves: cannot delete ${key}: ${e.message}`); return false; } }
  return true;
}

// ---- smoke test -------------------------------------------------------------------------------
// The game must run with no network at all: in smoke mode every http(s) request is refused and fails the run.
const blocked = [];
function blockNetwork() {
  session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*', 'ws://*/*', 'wss://*/*'] }, (d, cb) => { blocked.push(d.url); cb({ cancel: true }); });
}
let smokeDone = false;
function smokeEnd(ok, why) {
  if (smokeDone) return; smokeDone = true;
  console.log(`${ok ? 'SMOKE_OK' : 'SMOKE_FAIL'} ${why}`);
  setTimeout(() => {
    if (THROWAWAY) try { fs.rmSync(USER_DATA, { recursive: true, force: true }); } catch (e) { /* Chromium may still hold a file on Windows */ }
    app.exit(ok ? 0 : 1);
  }, 100);
}

// A setting changed in the page has to reach its file. If the file was there before (a second run on the same --user-data),
// the page must have started with the value in it.
async function smokeSaves(w) {
  const file = saveFile('topbunk.settings');
  const readFov = () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')).fov; } catch (e) { return undefined; } };
  const before = readFov();
  if (!(await w.webContents.executeJavaScript('!!(window.desktop && window.desktop.saves)', true))) throw new Error(`the page has no save files (${SAVES})`);
  const fov = await w.webContents.executeJavaScript(`window.__game.settings.get('fov')`, true);
  if (before !== undefined && before !== fov) throw new Error(`the page started with fov ${fov}, ${file} has ${before}`);
  const next = fov >= 100 ? 60 : fov + 1;
  await w.webContents.executeJavaScript(`window.__game.settings.set('fov', ${next})`, true);
  for (let i = 0; i < 50 && readFov() !== next; i++) await new Promise((r) => setTimeout(r, 100));
  if (readFov() !== next) throw new Error(`fov ${next} never reached ${file} (it has ${readFov()})`);
  const temp = fs.readdirSync(SAVES).filter((n) => n.endsWith('.tmp'));
  if (temp.length) throw new Error(`temp files left in ${SAVES}: ${temp.join(' ')}`);
  return `fov ${fov} -> ${next} in ${file}${before !== undefined ? ', started with the saved value' : ''}`;
}

async function smoke(w, steam) {
  const t0 = Date.now(), errors = [];
  const tail = () => (errors.length ? `; console errors (${errors.length}): ${errors.slice(0, 4).join(' | ')}` : '');
  w.webContents.on('console-message', (e) => {
    if (e.level === 'error') errors.push(String(e.message).replace(/\s+/g, ' ').slice(0, 240));
  });
  w.webContents.on('render-process-gone', (e, d) => smokeEnd(false, `renderer gone: ${d.reason} exit ${d.exitCode}${tail()}`));
  w.webContents.on('did-fail-load', (e, code, desc, url, isMain) => { if (isMain) smokeEnd(false, `load failed ${code} ${desc} ${url}`); });
  w.webContents.on('preload-error', (e, p, err) => smokeEnd(false, `preload error: ${err && err.message}`));
  w.on('unresponsive', () => smokeEnd(false, 'renderer unresponsive' + tail()));
  setTimeout(() => smokeEnd(false, `timeout after ${SMOKE_MS / 1000}s waiting for window.__game${tail()}`), SMOKE_MS - 4000);
  const probe = `(() => { const g = window.__game; return { game: !!g, renderer: !!(g && g.renderer), desktop: !!(window.desktop && window.desktop.isDesktop), isSteam: !!(window.desktop && window.desktop.isSteam) }; })()`;
  while (!smokeDone) {
    await new Promise((r) => setTimeout(r, 500));
    let r = null;
    try { r = await w.webContents.executeJavaScript(probe, true); } catch (e) { /* page still loading */ }
    if (!r || !r.game) continue;
    if (!r.desktop) return smokeEnd(false, 'window.__game is up but window.desktop is missing: preload did not run' + tail());
    if (blocked.length) return smokeEnd(false, `tried the network (${blocked.length}): ${blocked.slice(0, 3).join(' | ')}`);
    let ach = 'threw', saves;
    try { ach = await w.webContents.executeJavaScript('window.desktop.achieve("SMOKE_TEST")', true); } catch (e) { /* reported below */ }
    try { saves = await smokeSaves(w); } catch (e) { return smokeEnd(false, `saves: ${e.message}${tail()}`); }
    smokeEnd(true, `window.__game ready in ${Date.now() - t0}ms; renderer=${r.renderer}; desktop bridge ok; steam=${steam.isSteam}; achieve->${ach}; saves: ${saves}${tail()}`);
  }
}
