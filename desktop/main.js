'use strict';
// Top Bunk desktop shell (Electron main process).
// Serves the web game from the repo root over the privileged app:// scheme (static.js), bridges Steam
// (steam.js) to the page through preload.js, and runs the headless smoke test behind `--smoke`.
//
//   electron .                 play (fullscreen; F11 or Alt+Enter toggles)
//   electron . --windowed      start in a window
//   electron . --hash=night    same as opening index.html#night (dev shortcut, see README; a packaged build needs --devtools too)
//   electron . --no-steam      do not touch Steam
//   electron . --smoke         load the game, print SMOKE_OK / SMOKE_FAIL <reason>, exit 0 / 1 within 90 s
const { app, BrowserWindow, Menu, ipcMain, protocol, session, shell } = require('electron');
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

// Every handler checks the call comes from the game window, so no other web content could reach Steam.
function registerIpc(steam) {
  const fromGame = (e) => !!win && !win.isDestroyed() && e.sender === win.webContents;
  ipcMain.on('desktop:info', (e) => {
    e.returnValue = fromGame(e) ? { isSteam: steam.isSteam, playerName: steam.playerName, appId: steam.appId, version: app.getVersion(), platform: process.platform } : null;
  });
  ipcMain.handle('desktop:achieve', (e, id) => fromGame(e) && steam.achieve(id));
  ipcMain.handle('desktop:clear-achievement', (e, id) => fromGame(e) && steam.clearAchievement(id));
  ipcMain.handle('desktop:is-achieved', (e, id) => fromGame(e) && steam.isAchieved(id));
  ipcMain.handle('desktop:quit', (e) => { if (fromGame(e)) setImmediate(() => app.quit()); return true; });
  ipcMain.handle('desktop:toggle-fullscreen', (e) => { if (!fromGame(e)) return false; toggleFullscreen(win); return win.isFullScreen(); });
  ipcMain.handle('desktop:is-fullscreen', (e) => fromGame(e) && win.isFullScreen());
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
  setTimeout(() => app.exit(ok ? 0 : 1), 100);
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
    let ach = 'threw';
    try { ach = await w.webContents.executeJavaScript('window.desktop.achieve("SMOKE_TEST")', true); } catch (e) { /* reported below */ }
    smokeEnd(true, `window.__game ready in ${Date.now() - t0}ms; renderer=${r.renderer}; desktop bridge ok; steam=${steam.isSteam}; achieve->${ach}${tail()}`);
  }
}
