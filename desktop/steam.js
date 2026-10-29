'use strict';
// Steamworks bridge for the Electron main process, built on steamworks.js (an optional dependency).
// Without the module, or without the Steam client running, every call is a no-op that logs once, so the
// game behaves the same on Steam, from a bare folder, or in CI. Nothing here touches the renderer:
// main.js forwards the calls over IPC and preload.js exposes them as window.desktop.
const fs = require('fs');
const path = require('path');

const DEFAULT_APP_ID = 480;                 // Valve's Spacewar test app: achievements work with any Steam account
const ID_RE = /^[A-Za-z0-9_.-]{1,128}$/;    // Steamworks "API name" of an achievement

// App ID precedence: the Steam client (SteamAppId env, set when it launches us) > desktop/steam_appid.txt > Spacewar.
function readAppId(file = path.join(__dirname, 'steam_appid.txt')) {
  const env = Number(process.env.SteamAppId);
  if (Number.isInteger(env) && env > 0) return env;
  try { const n = parseInt(fs.readFileSync(file, 'utf8').trim(), 10); if (Number.isInteger(n) && n > 0) return n; } catch (e) { /* no file */ }
  return DEFAULT_APP_ID;
}

function loadModule() { try { return require('steamworks.js'); } catch (e) { return null; } }

// Builds the bridge. Call it BEFORE app.whenReady(): the Steam overlay needs Chromium switches
// (in-process-gpu, disable-direct-composition) that only take effect before the GPU process starts.
//   appId     - defaults to readAppId()
//   disabled  - skip Steam entirely (--no-steam)
//   restart   - call SteamAPI_RestartAppIfNecessary first (packaged release builds only); when it
//               returns true Steam is relaunching us and the caller should quit at once (bridge.restart)
//   overlay   - enable the Steam overlay through steamworks.js (default true)
//   module    - the steamworks.js module (default: require it; null when it is not installed); check.js injects fakes
//   log       - logger
function create({ appId = readAppId(), disabled = false, restart = false, overlay = true, module: sw = loadModule(), log = () => {} } = {}) {
  const once = (why) => { let said = false; return () => { if (!said) { said = true; log(`steam: ${why}; achievements are no-ops`); } }; };
  const off = (why, extra = {}) => {
    const say = once(why);
    return { isSteam: false, appId, playerName: null, restart: false, ...extra,
      achieve() { say(); return false; }, clearAchievement() { say(); return false; }, isAchieved() { return false; } };
  };
  if (disabled) return off('disabled with --no-steam');
  if (!sw) return off('steamworks.js is not installed');
  const safe = (fn, fallback) => { try { return fn(); } catch (e) { log('steam:', (e && e.message) || e); return fallback; } };
  if (restart && appId !== DEFAULT_APP_ID && !process.env.SteamAppId && safe(() => sw.restartAppIfNecessary(appId), false)) return off('relaunching through the Steam client', { restart: true });
  let client;
  try { client = sw.init(appId); } catch (e) { return off(`init failed for app ${appId} (${(e && e.message) || e}); is Steam running?`); }
  if (overlay) safe(() => sw.electronEnableSteamOverlay());
  const playerName = safe(() => client.localplayer.getName(), null) || null;
  log(`steam: connected (app ${appId}${playerName ? ', ' + playerName : ''})`);
  const valid = (id) => ID_RE.test(String(id));
  return {
    isSteam: true, appId, playerName, restart: false,
    achieve(id) { if (!valid(id)) return false; const ok = safe(() => client.achievement.activate(id), false); if (ok) safe(() => client.stats.store(), false); return ok; },
    clearAchievement(id) { if (!valid(id)) return false; const ok = safe(() => client.achievement.clear(id), false); if (ok) safe(() => client.stats.store(), false); return ok; },
    isAchieved(id) { return valid(id) && safe(() => client.achievement.isActivated(id), false); },
  };
}

module.exports = { DEFAULT_APP_ID, ID_RE, readAppId, loadModule, create };
