#!/usr/bin/env node
'use strict';
// `npm run check`: plain-Node checks that need neither Electron nor Steam, so they run anywhere (CI
// included). They exercise the app:// file server (static.js) against the real repo, the Steam bridge
// (steam.js) with fake steamworks modules, and the shipping config: package.json "build", steam/*.vdf
// (through a tiny VDF parser) and .github/workflows/desktop.yml. Exit code 1 when anything fails.
const fs = require('fs');
const os = require('os');
const path = require('path');
const assert = require('assert');
const serve = require('./static');
const steam = require('./steam');

const ROOT = path.join(__dirname, '..');
const ORIGIN = 'app://top-bunk';
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const exists = (rel) => fs.existsSync(path.join(ROOT, rel));

let passed = 0, failed = 0, skipped = 0;
const section = (s) => console.log(`\n${s}`);
async function test(name, fn) {
  try { const r = await fn(); if (r === 'skip') { skipped++; console.log(`  skip ${name}`); } else { passed++; console.log(`  ok   ${name}`); } }
  catch (e) { failed++; console.log(`  FAIL ${name}\n       ${String(e && e.stack || e).split('\n').slice(0, 3).join('\n       ')}`); }
}

// ---- tiny VDF (KeyValues) parser --------------------------------------------------------------
// Returns nested arrays of [key, value] pairs (value is a string or another array), keeping duplicates
// such as repeated "FileExclusion" lines. Handles // comments, quoted and bare tokens, \" escapes.
function parseVdf(text) {
  const tokens = [];
  const re = /\/\/[^\n]*|"((?:[^"\\]|\\.)*)"|([{}])|([^\s"{}]+)/g;
  let m;
  while ((m = re.exec(text))) {
    if (m[0].startsWith('//')) continue;
    if (m[1] !== undefined) tokens.push({ s: m[1].replace(/\\(["\\])/g, '$1') });
    else if (m[2]) tokens.push({ b: m[2] });
    else tokens.push({ s: m[3] });
  }
  let i = 0;
  function block(top) {
    const out = [];
    while (i < tokens.length) {
      const t = tokens[i++];
      if (t.b === '}') { if (top) throw new Error('unexpected }'); return out; }
      if (t.b === '{') throw new Error('value without key');
      const v = tokens[i++];
      if (!v) throw new Error(`key "${t.s}" has no value`);
      if (v.b === '{') out.push([t.s, block(false)]);
      else if (v.b === '}') throw new Error(`key "${t.s}" has no value`);
      else out.push([t.s, v.s]);
    }
    if (!top) throw new Error('missing }');
    return out;
  }
  return block(true);
}
const get = (kv, key) => { const e = kv.find(([k]) => k.toLowerCase() === key.toLowerCase()); return e ? e[1] : undefined; };
const all = (kv, key) => kv.filter(([k]) => k.toLowerCase() === key.toLowerCase()).map(([, v]) => v);
const PLACEHOLDER = /^YOUR_[A-Z_]+$/;
const idOk = (v) => PLACEHOLDER.test(v) || /^[1-9]\d*$/.test(v);

async function main() {
  section('static.js (app:// file server)');
  await test('MIME types the game needs', () => {
    for (const ext of ['html', 'js', 'mjs', 'css', 'json', 'mp3', 'ogg', 'wav', 'glb', 'gltf', 'webp', 'png', 'jpg', 'svg', 'woff2', 'woff', 'ttf', 'hdr', 'wasm', 'bin']) {
      assert.ok(serve.MIME[ext], `no MIME for .${ext}`);
    }
    assert.match(serve.mimeFor('a/b.js'), /^text\/javascript/);
    assert.match(serve.mimeFor('x.MJS'), /^text\/javascript/);
    assert.match(serve.mimeFor('x.html'), /^text\/html/);
    assert.strictEqual(serve.mimeFor('x.glb'), 'model/gltf-binary');
    assert.strictEqual(serve.mimeFor('x.woff2'), 'font/woff2');
    assert.strictEqual(serve.mimeFor('x.unknownext'), 'application/octet-stream');
  });
  await test('resolve() maps URLs into the root and never out of it', () => {
    assert.strictEqual(serve.resolve(ROOT, `${ORIGIN}/js/main.js`), path.join(ROOT, 'js', 'main.js'));
    assert.strictEqual(serve.resolve(ROOT, `${ORIGIN}/`), path.join(ROOT, 'index.html'));
    assert.strictEqual(serve.resolve(ROOT, ORIGIN), path.join(ROOT, 'index.html'));
    assert.strictEqual(serve.resolve(ROOT, `${ORIGIN}/index.html?x=1#night`), path.join(ROOT, 'index.html'));
    assert.strictEqual(serve.resolve(ROOT, `${ORIGIN}/assets/a%20b.mp3`), path.join(ROOT, 'assets', 'a b.mp3'));
    for (const u of [`${ORIGIN}/../../etc/passwd`, `${ORIGIN}/%2e%2e/%2e%2e/etc/passwd`, `${ORIGIN}/js/..%2f..%2f..%2fetc/passwd`, `${ORIGIN}//etc/passwd`]) {
      const f = serve.resolve(ROOT, u);
      assert.ok(f === null || f.startsWith(ROOT + path.sep), `escaped root: ${u} -> ${f}`);
    }
    assert.strictEqual(serve.resolve(ROOT, 'not a url'), null);
  });
  await test('parseRange()', () => {
    assert.deepStrictEqual(serve.parseRange('bytes=0-9', 100), { start: 0, end: 9 });
    assert.deepStrictEqual(serve.parseRange('bytes=90-', 100), { start: 90, end: 99 });
    assert.deepStrictEqual(serve.parseRange('bytes=-10', 100), { start: 90, end: 99 });
    assert.deepStrictEqual(serve.parseRange('bytes=0-500', 100), { start: 0, end: 99 });
    assert.strictEqual(serve.parseRange('bytes=200-', 100), 416);
    assert.strictEqual(serve.parseRange('bytes=5-3', 100), 416);
    assert.strictEqual(serve.parseRange(undefined, 100), null);
    assert.strictEqual(serve.parseRange('items=0-1', 100), null);
  });
  const req = (p, init) => new Request(`${ORIGIN}${p}`, init);
  await test('respond(): index.html, modules, HEAD, 404, 405, ranges', async () => {
    let r = await serve.respond(ROOT, req('/index.html'));
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('Content-Type'), /^text\/html/);
    const html = await r.text();
    assert.ok(html.includes('<script type="module"'), 'index.html has the module script');
    assert.strictEqual(Number(r.headers.get('Content-Length')), Buffer.byteLength(html));
    r = await serve.respond(ROOT, req('/'));
    assert.strictEqual(r.status, 200);
    r = await serve.respond(ROOT, req('/js/main.js'));
    assert.strictEqual(r.status, 200);
    assert.match(r.headers.get('Content-Type'), /^text\/javascript/);
    r = await serve.respond(ROOT, req('/js/main.js', { method: 'HEAD' }));
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.body, null);
    assert.ok(Number(r.headers.get('Content-Length')) > 0);
    r = await serve.respond(ROOT, req('/nope/missing.js'));
    assert.strictEqual(r.status, 404);
    r = await serve.respond(ROOT, req('/js/'));          // a directory without index.html
    assert.strictEqual(r.status, 404);
    r = await serve.respond(ROOT, req('/index.html', { method: 'POST', body: 'x' }));
    assert.strictEqual(r.status, 405);
    r = await serve.respond(ROOT, req('/index.html', { headers: { Range: 'bytes=0-9' } }));
    assert.strictEqual(r.status, 206);
    assert.strictEqual(r.headers.get('Content-Length'), '10');
    assert.match(r.headers.get('Content-Range'), /^bytes 0-9\/\d+$/);
    assert.strictEqual((await r.text()).length, 10);
    r = await serve.respond(ROOT, req('/index.html', { headers: { Range: 'bytes=99999999-' } }));
    assert.strictEqual(r.status, 416);
  });
  await test('index.html loads with no network: import map, stylesheets and scripts resolve under the root', async () => {
    const html = read('index.html');
    const im = /<script type="importmap">([\s\S]*?)<\/script>/.exec(html);
    assert.ok(im, 'index.html has an import map');
    const imports = JSON.parse(im[1]).imports;
    const urls = [];
    for (const [name, target] of Object.entries(imports)) {
      assert.ok(target.startsWith('./') || target.startsWith('/'), `import map entry "${name}" -> ${target} is not local (offline build needs vendored files)`);
      urls.push(target.replace(/^\./, ''));
    }
    for (const m of html.matchAll(/<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"/g)) urls.push('/' + m[1]);
    for (const m of html.matchAll(/<script[^>]+src="([^"]+)"/g)) urls.push('/' + m[1]);
    assert.ok(urls.length >= 4, `found only ${urls.length} local references`);
    for (const u of urls) {
      if (u.endsWith('/')) { assert.ok(fs.statSync(path.join(ROOT, u)).isDirectory(), `${u} is not a directory`); continue; }
      const r = await serve.respond(ROOT, req(u, { method: 'HEAD' }));
      assert.strictEqual(r.status, 200, `${u} -> ${r.status}`);
    }
    const css = read('css/fonts.css');
    for (const m of css.matchAll(/url\(["']?([^)"']+)["']?\)/g)) {
      const rel = m[1].startsWith('/') ? m[1].slice(1) : path.posix.join('css', m[1]);
      assert.ok(exists(rel.split(/[?#]/)[0]), `css/fonts.css references missing ${m[1]}`);
    }
  });
  await test('every shipped file has a real MIME type (no octet-stream surprises)', () => {
    const unknown = new Set();
    // Extensionless files (LICENSE, README) ride along in vendor/ but are never fetched; .bin/.drc are real binary payloads.
    const walk = (dir) => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { const p = path.join(dir, e.name); if (e.isDirectory()) walk(p); else if (path.extname(p) && serve.mimeFor(p) === 'application/octet-stream' && !/\.(bin|drc)$/i.test(p)) unknown.add(path.extname(p)); } };
    for (const d of ['js', 'css', 'assets', 'vendor']) if (exists(d)) walk(path.join(ROOT, d));
    assert.deepStrictEqual([...unknown], [], `extensions without a MIME mapping: ${[...unknown].join(' ')}`);
  });

  section('steam.js (Steamworks bridge, no Steam needed)');
  const quiet = () => {};
  await test('readAppId(): env > steam_appid.txt > 480', () => {
    const saved = process.env.SteamAppId; delete process.env.SteamAppId;
    try {
      const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tb-appid-'));
      const f = path.join(tmp, 'steam_appid.txt');
      fs.writeFileSync(f, '  12345\n');
      assert.strictEqual(steam.readAppId(f), 12345);
      fs.writeFileSync(f, 'nonsense');
      assert.strictEqual(steam.readAppId(f), steam.DEFAULT_APP_ID);
      assert.strictEqual(steam.readAppId(path.join(tmp, 'missing.txt')), steam.DEFAULT_APP_ID);
      process.env.SteamAppId = '777';
      assert.strictEqual(steam.readAppId(f), 777);
      const shipped = steam.readAppId();
      assert.ok(Number.isInteger(shipped) && shipped > 0, 'desktop/steam_appid.txt holds an integer');
      fs.rmSync(tmp, { recursive: true, force: true });
    } finally { if (saved === undefined) delete process.env.SteamAppId; else process.env.SteamAppId = saved; }
  });
  await test('achievement API names are validated', () => {
    for (const good of ['FIRST_NIGHT', 'ach.night-1', 'A']) assert.ok(steam.ID_RE.test(good), good);
    for (const bad of ['', 'has space', 'x'.repeat(129), 'quote"', 'semi;colon']) assert.ok(!steam.ID_RE.test(bad), JSON.stringify(bad));
  });
  await test('no-op bridge when disabled, when the module is missing, and when init throws; logs once', async () => {
    for (const opts of [{ disabled: true }, { module: null }, { module: { init() { throw new Error('Steam is not running'); } } }]) {
      const lines = [];
      const b = steam.create({ ...opts, appId: 480, log: (...a) => lines.push(a.join(' ')) });
      assert.strictEqual(b.isSteam, false);
      assert.strictEqual(b.restart, false);
      assert.strictEqual(b.playerName, null);
      assert.strictEqual(b.appId, 480);
      assert.strictEqual(b.achieve('X'), false);
      assert.strictEqual(b.clearAchievement('X'), false);
      assert.strictEqual(b.isAchieved('X'), false);
      assert.strictEqual(lines.filter((l) => /no-ops/.test(l)).length, 1, `logged once: ${JSON.stringify(lines)}`);
    }
  });
  const fakeSteam = (rec, { restartTrue = false, name = 'Tester', activateOk = true } = {}) => ({
    init(appId) { rec.init = appId; return {
      localplayer: { getName: () => name },
      achievement: { activate: (id) => { rec.activated.push(id); return activateOk; }, clear: (id) => { rec.cleared.push(id); return true; }, isActivated: (id) => rec.activated.includes(id) },
      stats: { store: () => { rec.stored++; return true; } },
    }; },
    restartAppIfNecessary(appId) { rec.restartAsked = appId; return restartTrue; },
    electronEnableSteamOverlay() { rec.overlay++; },
  });
  const record = () => ({ init: null, activated: [], cleared: [], stored: 0, overlay: 0, restartAsked: null });
  await test('live bridge: init with the app id, overlay on, activate + store, validation, clear, isAchieved', () => {
    const rec = record();
    const b = steam.create({ module: fakeSteam(rec), appId: 480, log: quiet });
    assert.strictEqual(b.isSteam, true);
    assert.strictEqual(rec.init, 480);
    assert.strictEqual(rec.overlay, 1);
    assert.strictEqual(b.playerName, 'Tester');
    assert.strictEqual(b.achieve('FIRST_NIGHT'), true);
    assert.deepStrictEqual(rec.activated, ['FIRST_NIGHT']);
    assert.strictEqual(rec.stored, 1, 'stats.store() after a successful activate');
    assert.strictEqual(b.achieve('bad id!'), false);
    assert.deepStrictEqual(rec.activated, ['FIRST_NIGHT'], 'invalid names never reach Steam');
    assert.strictEqual(b.isAchieved('FIRST_NIGHT'), true);
    assert.strictEqual(b.isAchieved('OTHER'), false);
    assert.strictEqual(b.clearAchievement('FIRST_NIGHT'), true);
    assert.deepStrictEqual(rec.cleared, ['FIRST_NIGHT']);
    assert.strictEqual(rec.stored, 2);
    const rec2 = record();
    const b2 = steam.create({ module: fakeSteam(rec2, { activateOk: false }), appId: 480, overlay: false, log: quiet });
    assert.strictEqual(b2.achieve('X'), false);
    assert.strictEqual(rec2.stored, 0, 'no store() when activate fails');
    assert.strictEqual(rec2.overlay, 0, 'overlay: false skips electronEnableSteamOverlay');
  });
  await test('restartAppIfNecessary only for packaged builds with a real app id, not when Steam launched us', () => {
    const saved = process.env.SteamAppId; delete process.env.SteamAppId;
    try {
      let rec = record();
      let b = steam.create({ module: fakeSteam(rec, { restartTrue: true }), appId: 123456, restart: true, log: quiet });
      assert.strictEqual(b.restart, true, 'caller must quit: Steam is relaunching the game');
      assert.strictEqual(b.isSteam, false);
      assert.strictEqual(rec.restartAsked, 123456);
      assert.strictEqual(rec.init, null, 'no init when relaunching');
      rec = record();
      b = steam.create({ module: fakeSteam(rec, { restartTrue: true }), appId: 480, restart: true, log: quiet });
      assert.strictEqual(b.restart, false, 'Spacewar never relaunches');
      assert.strictEqual(rec.restartAsked, null);
      assert.strictEqual(b.isSteam, true);
      rec = record();
      b = steam.create({ module: fakeSteam(rec, { restartTrue: true }), appId: 123456, restart: false, log: quiet });
      assert.strictEqual(b.restart, false, 'dev runs (restart: false) never relaunch');
      assert.strictEqual(rec.restartAsked, null);
      process.env.SteamAppId = '123456';
      rec = record();
      b = steam.create({ module: fakeSteam(rec, { restartTrue: true }), appId: 123456, restart: true, log: quiet });
      assert.strictEqual(b.restart, false, 'launched by Steam: never relaunch');
      assert.strictEqual(rec.restartAsked, null);
    } finally { if (saved === undefined) delete process.env.SteamAppId; else process.env.SteamAppId = saved; }
  });

  section('package.json (electron-builder config)');
  const pkg = JSON.parse(read('package.json'));
  await test('entry point, pinned versions, scripts', () => {
    assert.strictEqual(pkg.main, 'desktop/main.js');
    assert.ok(exists(pkg.main));
    assert.ok(exists('desktop/preload.js'));
    for (const dep of ['electron', 'electron-builder']) assert.match(pkg.devDependencies[dep], /^\d+\.\d+\.\d+$/, `${dep} pinned exactly`);
    assert.match(pkg.optionalDependencies['steamworks.js'], /^\d+\.\d+\.\d+$/, 'steamworks.js pinned exactly');
    for (const s of ['start', 'smoke', 'check', 'dist', 'dist:win', 'dist:mac', 'dist:linux']) assert.ok(pkg.scripts[s], `script ${s}`);
    assert.strictEqual(pkg.productName, 'Top Bunk');
  });
  await test('"build": product, appId, files whitelist, targets', () => {
    const b = pkg.build;
    assert.strictEqual(b.appId, 'com.topbunk.game');
    assert.strictEqual(b.productName, 'Top Bunk');
    for (const f of ['index.html', 'js/**/*', 'css/**/*', 'assets/**/*', 'vendor/**/*', 'desktop/**/*']) assert.ok(b.files.includes(f), `files includes ${f}`);
    assert.ok(b.files.some((f) => f === '!desktop/check.js'), 'check.js is not shipped');
    assert.ok(b.files.some((f) => f === '!desktop/smoke.js'), 'smoke.js is not shipped');
    assert.ok(!b.files.some((f) => /^tools|^node_modules$/.test(f)), 'no stray folders');
    assert.ok(b.asarUnpack.some((p) => p.includes('steamworks.js')), 'native module is unpacked from the asar');
    const targets = (os_) => b[os_].target.map((t) => t.target);
    const archs = (os_, target) => b[os_].target.find((t) => t.target === target).arch;
    assert.deepStrictEqual(targets('win').sort(), ['dir', 'zip']);
    assert.deepStrictEqual(archs('win', 'dir'), ['x64']);
    assert.deepStrictEqual(targets('mac').sort(), ['dir', 'zip']);
    assert.deepStrictEqual(archs('mac', 'dir').sort(), ['arm64', 'x64']);
    assert.deepStrictEqual(targets('linux').sort(), ['dir', 'tar.gz']);
    assert.strictEqual(b.linux.executableName, 'top-bunk');
    assert.strictEqual(b.mac.identity, null, 'no signing identity (builds without certificates)');
    assert.strictEqual(b.directories.output, 'dist');
  });

  section('steam/*.vdf (SteamPipe scripts)');
  const S = path.join(ROOT, 'steam');
  const EXPECTED_ROOTS = { windows: 'dist/win-unpacked', mac: 'dist/mac', linux: 'dist/linux-unpacked' };
  let appBuild, depots;
  await test('app_build.vdf parses and has the required keys', () => {
    const kv = parseVdf(read('steam/app_build.vdf'));
    assert.strictEqual(kv.length, 1, 'one root block');
    assert.strictEqual(kv[0][0], 'AppBuild');
    appBuild = kv[0][1];
    for (const k of ['AppID', 'Desc', 'BuildOutput', 'ContentRoot', 'Depots']) assert.ok(get(appBuild, k) !== undefined, `has ${k}`);
    assert.ok(idOk(get(appBuild, 'AppID')), `AppID is numeric or a YOUR_* placeholder: ${get(appBuild, 'AppID')}`);
    assert.ok(/^[01]$/.test(get(appBuild, 'Preview') || '0'), 'Preview is 0/1');
    depots = get(appBuild, 'Depots');
    assert.ok(Array.isArray(depots) && depots.length === 3, 'three depots (Windows, macOS, Linux)');
    for (const [id, file] of depots) {
      assert.ok(idOk(id), `depot id ${id}`);
      assert.ok(fs.existsSync(path.join(S, file)), `depot script ${file} exists`);
    }
    const files = depots.map(([, f]) => f).sort();
    assert.deepStrictEqual(files, ['depot_build_linux.vdf', 'depot_build_mac.vdf', 'depot_build_windows.vdf']);
    assert.ok(fs.existsSync(path.resolve(S, get(appBuild, 'ContentRoot'))) || get(appBuild, 'ContentRoot').startsWith('../dist'), 'ContentRoot points at dist/');
  });
  await test('depot_build_*.vdf parse, match app_build.vdf and point at the electron-builder dir outputs', () => {
    assert.ok(depots, 'app_build.vdf parsed');
    for (const [id, file] of depots) {
      const kv = parseVdf(fs.readFileSync(path.join(S, file), 'utf8'));
      assert.strictEqual(kv.length, 1, `${file}: one root block`);
      assert.strictEqual(kv[0][0], 'DepotBuild', `${file}: root is DepotBuild`);
      const d = kv[0][1];
      assert.strictEqual(get(d, 'DepotID'), id, `${file}: DepotID matches the key in app_build.vdf`);
      const osName = /depot_build_(\w+)\.vdf/.exec(file)[1];
      const root = get(d, 'ContentRoot');
      assert.ok(root, `${file}: ContentRoot`);
      assert.strictEqual(path.relative(ROOT, path.resolve(S, root)).split(path.sep).join('/'), EXPECTED_ROOTS[osName], `${file}: ContentRoot is the ${osName} dir output`);
      const fm = get(d, 'FileMapping');
      assert.ok(Array.isArray(fm), `${file}: FileMapping block`);
      assert.strictEqual(get(fm, 'LocalPath'), '*');
      assert.strictEqual(get(fm, 'DepotPath'), '.');
      assert.strictEqual(get(fm, 'Recursive'), '1');
      const excl = all(d, 'FileExclusion');
      assert.ok(excl.length >= 2, `${file}: has exclusions`);
      const others = { windows: ['osx', 'linux64'], mac: ['win64', 'linux64'], linux: ['win64', 'osx'] }[osName];
      for (const o of others) assert.ok(excl.some((e) => e.includes(`steamworks.js/dist/${o}/`)), `${file}: excludes the ${o} Steamworks binaries`);
    }
  });
  await test('App IDs agree: steam/app_build.vdf, desktop/steam_appid.txt (placeholders allowed before launch)', () => {
    const vdfId = get(appBuild, 'AppID');
    const fileId = read('desktop/steam_appid.txt').trim();
    assert.match(fileId, /^[1-9]\d*$/, 'desktop/steam_appid.txt is a positive integer');
    if (PLACEHOLDER.test(vdfId)) { assert.strictEqual(fileId, String(steam.DEFAULT_APP_ID), 'before the App ID exists, steam_appid.txt stays on Spacewar (480)'); return; }
    assert.strictEqual(fileId, vdfId, 'steam_appid.txt matches the App ID in app_build.vdf');
    const ids = depots.map(([id]) => Number(id));
    for (const id of ids) assert.ok(id > Number(vdfId), `depot ${id} belongs to app ${vdfId}`);
  });
  await test('upload scripts exist, upload.sh is executable and mentions run_app_build', () => {
    for (const f of ['steam/upload.sh', 'steam/upload.ps1', 'steam/README.md']) assert.ok(exists(f), f);
    assert.ok(read('steam/upload.sh').includes('+run_app_build') && read('steam/upload.ps1').includes('+run_app_build'));
    if (process.platform !== 'win32') assert.ok(fs.statSync(path.join(ROOT, 'steam/upload.sh')).mode & 0o111, 'upload.sh has the executable bit');
  });

  section('.github/workflows/desktop.yml');
  await test('YAML parses and has the dispatch + tag triggers, a 3-OS matrix on Node 22 and the optional Steam job', () => {
    let yaml;
    try { yaml = require('js-yaml'); } catch (e) { return 'skip'; }   // hoisted from electron-builder's tree; absent = skip
    const wf = yaml.load(read('.github/workflows/desktop.yml'));
    const on = wf.on || wf[true];   // YAML 1.1 parsers read the key "on" as boolean true
    assert.ok(on && 'workflow_dispatch' in on, 'workflow_dispatch');
    assert.ok(on.push && on.push.tags.includes('v*'), 'push tags v*');
    const build = wf.jobs.build;
    const oses = build.strategy.matrix.include.map((m) => m.os).sort();
    assert.deepStrictEqual(oses, ['macos-latest', 'ubuntu-latest', 'windows-latest']);
    for (const m of build.strategy.matrix.include) assert.ok(pkg.scripts[`dist:${m.target}`], `dist:${m.target} script exists`);
    const steps = build.steps;
    const node = steps.find((s) => s.uses && s.uses.startsWith('actions/setup-node'));
    assert.strictEqual(String(node.with['node-version']), '22');
    assert.ok(steps.some((s) => s.run === 'npm ci'), 'npm ci');
    assert.ok(steps.some((s) => s.run && s.run.includes('npm run dist:')), 'npm run dist:<os>');
    assert.ok(steps.some((s) => s.uses && s.uses.startsWith('actions/upload-artifact')), 'upload-artifact');
    const st = wf.jobs.steam;
    assert.ok(st && st.if, 'steam job is conditional');
    assert.ok(st.needs.includes('build'));
    const deploy = st.steps.find((s) => s.uses && s.uses.startsWith('game-ci/steam-deploy@v3'));
    assert.ok(deploy, 'uses game-ci/steam-deploy@v3');
    for (const k of ['depot1Path', 'depot2Path', 'depot3Path', 'username', 'configVdf', 'appId']) assert.ok(deploy.with[k] !== undefined, `steam-deploy with.${k}`);
    assert.ok(exists('.github/workflows/static.yml'), 'the Pages workflow is still there');
  });

  console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
