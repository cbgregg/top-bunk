// TOP BUNK: the game loop, the player and the story script.
import * as THREE from 'three';
import { buildWorld, roomAt } from './world.js';
import { Entity } from './entity.js';
import { Sound } from './audio.js';
import { makePerson } from './people.js';
import { Gfx, PHONE, contactShadow } from './gfx.js';
import { WindowFace } from './windowface.js';
import { Dust } from './dust.js';
import * as UI from './ui.js';
import { input, label as L, initInput, controlsTable } from './input.js';
import { createNights } from './nights.js';
import { newSeed } from './rng.js';
import { createCar } from './cars.js';
import { createTraffic } from './traffic.js';
import { createWeather } from './weather.js';
import { weatherFor, nightTypes } from './director.js';
import { createVigil } from './vigil.js';
import { settings, flicker } from './settings.js';
import { menu } from './menu.js';
import { achievements } from './achievements.js';
import { store } from './store.js';
import { createHands } from './hands.js';
import { createJournal } from './journal.js';
import { createFirstNight } from './firstnight.js';
import { createLights } from './lights.js';

const V3 = THREE.Vector3;
const $ = (id) => document.getElementById(id);
const HASHTOK = location.hash.slice(1).split('&');
const DEBUG = HASHTOK.find((t) => t && !t.includes('=')) || '';   // a debug jump (#night2, #breakfast ...)
const HPARAM = Object.fromEntries(HASHTOK.filter((t) => t.includes('=')).map((t) => t.split('=')));   // #seed=ABCD-1234&night=5
// the run: one seed decides what every night is; progress is kept between visits
function loadRun() {
  let r = store.get('topbunk.run');
  if (HPARAM.seed) r = { seed: HPARAM.seed.toUpperCase(), night: +(HPARAM.night || 1), deaths: 0 };
  if (!r || !r.seed) r = { seed: newSeed(), night: 1, deaths: 0 };
  if (!r.objDone) r.objDone = {};
  return r;
}
const RUN = loadRun();
function saveRun() { store.set('topbunk.run', RUN); }
const hasRun = () => RUN.night >= 2 || !!RUN.dayDone;   // moving day is kept once it is over: Continue starts night one

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG === 'shot' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PHONE ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;   // the soft filter is eight taps a pixel; a phone takes the plain one
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('game').appendChild(renderer.domElement);
const canvas = renderer.domElement;
// each phase's exposure (setPhase), times the brightness setting's 2 ** brightness, which only the 3D picture sees
const EXPOSURE = { day: 0.8, night: 1, morning: 0.85 };
let exposure = EXPOSURE.night;
function setExposure(e = exposure) { exposure = e; renderer.toneMappingExposure = e * 2 ** settings.get('brightness'); }
settings.on('brightness', () => setExposure());

// ---------- loading: the screen in index.html, its bar driven by what is really left to do ----------
// a yield is a timeout, not an animation frame: the trailer's renderer holds the frames back until it starts, and the boot must not wait on it
const tick = () => new Promise((res) => setTimeout(res, 0));
// ?perf in the address: the load and the start of a game log how long each step took (window.__perf keeps them)
const PERF = new URLSearchParams(location.search).has('perf');
const perfT0 = performance.now(), perfLog = (window.__perf = []);
const mark = (what) => { const t = Math.round(performance.now() - perfT0); perfLog.push([what, t]); if (PERF) console.log(`[perf] ${what} ${t} ms`); };
const LOAD = (() => {
  const el = $('loading'), bar = el && el.querySelector('.ld-bar i'), step = el && el.querySelector('.ld-step');
  let at = 0.04, files = { done: 0, total: 0, settled: 0 };
  const set = (k, text) => { at = Math.max(at, Math.min(1, k)); if (bar) bar.style.transform = `scaleX(${at.toFixed(3)})`; if (text && step && step.textContent !== text) step.textContent = text; };
  // every model, texture and sky the loaders fetch goes through three's default manager: its counts are the first part of the bar
  THREE.DefaultLoadingManager.onProgress = (url, done, total) => { files = { done, total, settled: performance.now() }; set(0.12 + 0.48 * (done / Math.max(1, total)), 'Unpacking the boxes'); };
  THREE.DefaultLoadingManager.onLoad = () => { files.settled = performance.now(); };
  const reset = (k, text) => { at = 0; set(k, text); };
  return { set, reset, files: () => files, get at() { return at; } };
})();
LOAD.set(0.08, 'Building the house');
await tick();

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.08, 400);   // a near plane this far out keeps depth precise at room distances (door frames and walls stop fighting)
camera.rotation.order = 'YXZ';
scene.add(camera);

const W = buildWorld(scene);
const FN = createFirstNight({ W, scene, camera }); FN.renderer = renderer;   // moving day's and night one's own props and effects
const hands = createHands();   // the kid's hands, drawn over the frame (see the end of loop())
LOAD.set(0.12, 'Unpacking the boxes');
await tick();
const E = new Entity(scene);
const car = createCar(scene);
const sfx = new Sound();
for (const b of ['master', 'music', 'sfx', 'voice']) { sfx.setVolume(b, settings.get(b)); settings.on(b, (v) => sfx.setVolume(b, v)); }
const WF = new WindowFace(scene, W.faceLight, W.carLight);
const traffic = createTraffic(scene, sfx);
const weather = createWeather(scene, camera, W, sfx);
const mom = makePerson({ model: 'mom', height: 1.66, shirt: '#7b8f6c', pants: '#3a3f52', hair: '#5b3a22', longHair: true });
const dad = makePerson({ model: 'dad', height: 1.84, shirt: '#7a4636', pants: '#2c3646', hair: '#2a221c', cap: '#2d4a2a' });
dad.rubsNeck = true;   // listening, he rubs the back of his neck now and then
mom.group.position.set(1.77, 0, 2.43); dad.group.position.set(4.3, 0, -13.4);   // where the day starts them
scene.add(mom.group, dad.group);
for (const p of [mom, dad]) { p.blob = contactShadow(0.36); p.group.add(p.blob); }   // a soft dark patch on the floor where they stand

const gfx = new Gfx(renderer, scene, camera);
const dust = new Dust(scene, camera);
settings.delegate('quality', { get: () => gfx.mode, set: (v) => (v === 'custom' ? gfx.toCustom() : gfx.setMode(v)), def: 'auto' });   // the options menu's Graphics row
// the Graphics page: one setting each, handed to gfx (a change to any of the preset ones turns the preset into Custom; the personal ones
// - frame cap, counter, contrast, gamma - go back to their defaults with Restore defaults)
for (const k of ['scale', 'aa', 'shadows', 'ao', 'bloom', 'grain', 'ca', 'vignette', 'mblur', 'tex', 'grass', 'draw', 'weather']) settings.delegate('g_' + k, { get: () => gfx.opt(k), set: (v) => gfx.setOpt(k, v) });
for (const [k, d] of [['cap', 0], ['counter', false], ['contrast', 1], ['gamma', 1], ['cine', !PHONE]]) settings.delegate('g_' + k, { get: () => gfx.opt(k), set: (v) => gfx.setOpt(k, typeof d === 'number' ? +v : v === 'false' ? false : !!v), def: d });
if (window.desktop && window.desktop.toggleFullscreen) {   // the desktop build: fullscreen or a window
  let full = true; window.desktop.isFullscreen().then((v) => { full = !!v; menu.refresh(); });
  settings.delegate('g_display', { get: () => (full ? 'full' : 'window'), set: (v) => { if ((v === 'full') !== full) window.desktop.toggleFullscreen().then((now) => { full = !!now; menu.refresh(); }); } });
}
const BATH_I = 95;
// the flashlight: a spot light carried on the camera (see toggleLight)
const flash = new THREE.SpotLight(0xfff1d2, 0, 15, 0.5, 0.55, 1.2);
// the disposable camera: a flash bulb at the lens (always in the scene, dark, so taking a photo never changes the lights and recompiles the
// shaders), and a grab of the frame it lit, cropped to a print and given a cheap camera's look
const bulb = new THREE.PointLight(0xfff4e2, 0, 7, 2); scene.add(bulb);
function grabPrint() {
  const src = renderer.domElement, w = 288, h = 216, c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d'), sw = src.width, sh = src.height, k = Math.min(sw / w, sh / h) * 0.8, cw = w * k, ch = h * k;
  x.filter = 'sepia(0.22) saturate(0.85) contrast(1.08)'; x.drawImage(src, (sw - cw) / 2, (sh - ch) / 2, cw, ch, 0, 0, w, h); x.filter = 'none';
  const v = x.createRadialGradient(w / 2, h / 2, h * 0.3, w / 2, h / 2, h * 0.85); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(10,6,0,0.55)');
  x.fillStyle = v; x.fillRect(0, 0, w, h);
  return c.toDataURL('image/jpeg', 0.62);
}
function takePhoto() {
  bulb.position.copy(camera.position); camera.getWorldDirection(tmp); bulb.position.addScaledVector(tmp, -0.25); bulb.intensity = 3.2;   // a cheap flash: bright up close, gone by the far wall
  let url = null;
  // F.flashFx (night one): something is put into the print before it is taken, and into the room for the flash after it
  if (F.flashFx) F.flashFx('print');
  try { camera.updateMatrixWorld(); gfx.render(0); url = grabPrint(); } catch (e) { url = null; }   // the frame the flash lit, read before the browser shows it (the hands are drawn after it, so they are not in the print)
  const held = F.flashFx ? F.flashFx('after') : 0;   // how long the flash shows it (ms)
  hands.snap();
  UI.flash(settings.get('reduceFlashing') ? 'rgba(255,250,240,0.45)' : held ? 'rgba(255,250,240,0.6)' : 'rgba(255,250,240,0.95)', held ? 0.35 : 0.5); sfx.shutter(); sfx.winder();
  setTimeout(() => { bulb.intensity = 0; }, held || 120);
  return url;
}
// the journal (js/journal.js): it writes itself from what happens; J, the right stick pressed in, the pause menu or the notebook on a touch screen
const journal = createJournal({ RUN, save: () => saveRun(), sfx: { pageTurn: () => sfx.pageTurn() },
  proof: { tell: (k) => nights && nights.proof.tell(k), cap: (k) => nights && nights.proof.defs[k] && nights.proof.defs[k].cap } });
journal.watch($('hint'));
$('jbtn').addEventListener('click', (e) => { e.stopPropagation(); openJournal(); });
function openJournal() {
  if (uiMode === 'playing' && !F.dead && !F.cutscene) setPause(true);
  if (uiMode === 'pause') setTimeout(() => { if (uiMode === 'pause') menu.open('journal'); }, 0);
}
// the photo board: from play it pauses and opens over the pause menu (Tab, the controller's Select, the camera on a touch screen)
function openPhotos() {
  if (uiMode === 'playing' && !F.dead && !F.cutscene) setPause(true);
  if (uiMode === 'pause') setTimeout(() => { if (uiMode === 'pause') menu.open('photos'); }, 0);   // after the pause menu has opened under it
}
flash.position.set(0.12, -0.14, 0); camera.add(flash); camera.add(flash.target); flash.target.position.set(0, 0, -3);
function toggleLight() {
  if (uiMode !== 'playing' || F.phase !== 'night' || F.dead || F.noFlash) return;
  if (!(P.mode === 'walk' || P.mode === 'bunk')) return;
  F.flashOn = !F.flashOn; flash.intensity = F.flashOn ? 26 : 0; sfx.click();
}
addEventListener('keydown', (e) => { if (e.code === 'KeyF' && !e.repeat) toggleLight(); });

// ---------- constants ----------
const EYE = 1.32, R = 0.28;
const BUNK_SEAT = new V3(8.28, 2.24, 4.0);
const BUNK_LIE = new V3(8.38, 1.9, 4.0);
const LADDER_MID = new V3(9.09, 1.55, 3.02);   // the ladder hangs on the room side of the bunk at its foot (its rails at x 8.89 and 9.29, its face at z 3.26)
const LADDER_FLOOR = new V3(9.09, 0, 2.78);
const HIDE_YAW = 0;                         // lying on the top bunk you face the room (toward the front of the house, -z)
const LADDER_YAW = Math.PI;                 // on the ladder you face the bunk (the back wall, +z)

// ---------- helpers ----------
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const lerpAngle = (a, b, k) => a + angDiff(a, b) * k;
const ease = { inOut: (k) => k * k * (3 - 2 * k), out: (k) => 1 - (1 - k) * (1 - k), in: (k) => k * k, lin: (k) => k };
const tmp = new V3(), tmp2 = new V3(), tmp3 = new V3(), fwd = new V3();

let gameTime = 0, waiters = [], tweens = [];
const waitFor = (check) => new Promise((res) => waiters.push({ check, res }));
const wait = (s) => { const t = gameTime + s; return waitFor(() => gameTime >= t); };
const later = (s, fn) => wait(s).then(fn);
function tween(dur, fn, e = ease.inOut) { return new Promise((res) => { fn(0); tweens.push({ t0: gameTime, dur, fn, e, res }); }); }
function killAll() { waiters = []; tweens = []; }
function runTimers() {
  const ws = waiters; waiters = [];
  for (const w of ws) { if (w.check()) w.res(); else waiters.push(w); }
  const ts = tweens; tweens = [];
  for (const tw of ts) { const k = Math.min(1, (gameTime - tw.t0) / tw.dur); tw.fn(tw.e(k)); if (k >= 1) tw.res(); else tweens.push(tw); }
}

function panFor(pos) {
  camera.updateMatrixWorld();
  const at = { x: pos.x, y: pos.y, z: pos.z };   // pos may be tmp2 itself
  tmp2.copy(pos).applyMatrix4(camera.matrixWorldInverse);
  return sfx.place(clamp(tmp2.x / Math.max(0.6, Math.hypot(tmp2.x, tmp2.z)), -1, 1) * 0.9, at);
}

// ---------- where sounds are heard from ----------
// what stands between you and a sound: 0 nothing, 1 an open door or a corner, 2 a wall or a shut door, 3 another floor
function crosses(c, ax, az, bx, bz) {   // does the segment a-b pass through the box (on the ground plan)?
  let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
  for (const [p, d, lo, hi] of [[ax, dx, c.minX, c.maxX], [az, dz, c.minZ, c.maxZ]]) {
    if (Math.abs(d) < 1e-6) { if (p < lo || p > hi) return false; continue; }
    let u = (lo - p) / d, v = (hi - p) / d; if (u > v) [u, v] = [v, u];
    t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false;
  }
  return true;
}
sfx.occluder = (x, y, z) => {
  const ex = camera.position.x, ey = camera.position.y, ez = camera.position.z;
  if (Math.abs(y - ey) > 2.2 && (y < 0.5 || ey < 0.5) && Math.min(y, ey) < -0.5) return 3;
  const a = roomAt(ex, ez, ey - 1.5), b = roomAt(x, z, y - 1.2);
  if (a === b) return 0;
  for (const c of W.colliders) {
    if (!(c.wall || c.door) || (c.door && !c.on)) continue;
    if (c.minY !== undefined && (ey < c.minY || ey > c.maxY)) continue;
    if (crosses(c, ex, ez, x, z)) return 2;
  }
  return 1;
};
const windowSpots = W.windows.filter((w) => w.pane).map((w) => w.pane.getWorldPosition(new V3()));
let roomT = 0;
function hearRoom(dt) {   // the room you are in sets the reverb and the beds; outside, how near the road is; inside, how near a window
  roomT -= dt;
  const room = roomAt(P.pos.x, P.pos.z, P.pos.y);
  if (room === sfx.room && roomT > 0) return;
  roomT = 0.5;
  if (room === 'out') sfx.setRoom(room, { road: Math.abs(camera.position.z + 30.5) });
  else { let d = 99; for (const w of windowSpots) d = Math.min(d, Math.hypot(w.x - camera.position.x, w.z - camera.position.z)); sfx.setRoom(room, { window: d }); }
}

// ---------- state ----------
const P = {
  pos: new V3(3.1, 0, -9.0), vel: new V3(), yaw: Math.PI, pitch: 0, roll: 0, mode: 'walk',
  cam: new V3(), stamina: 1, exhausted: false, carrying: null, stepAcc: 0, bob: 0, speed: 0,
  breath: 1, breathT: 0, inhale: true, pod: null, podYaw: 0,
};
const F = { stage: 'day', night: 0, phase: 'title', boxes: 0, momReady: false, talkedMom: false, splashed: false, chase: false, echo: false, dead: false, cutscene: false, morningReady: false, flashOn: false, breathCheck: false, breathUI: false, grace: 0, birds: false, flicker: false, fear: 0, live: false, script: false, clock: 0, blackout: false, clockGlitch: 0, drawingLevel: 0, over: false };
// the ceiling lights and their switches (lights.js): a fixed pool of lights lent to the nearest lit fixtures, so switching never recompiles
const lights = createLights({ W, scene, camera, sfx, PHONE, F, E, renderer });
lights.movers = [mom.group, dad.group];   // their shadows under the ceiling lights are drawn again as they move
let shake = 0, uiMode = 'title', paused = false, started = false, pressE = false;
// the breath key pulls the covers up only once held a moment, and not right after you sit down
let bunkSince = -9, coverHold = 0;
const canBunkCover = () => P.mode === 'bunk' && !F.cutscene && !F.dead && gameTime - bunkSince > 0.8;
const keys = {};
const echoes = [];

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'KeyE') pressE = true;
  if (e.code === 'Tab') { e.preventDefault(); openPhotos(); }
  if (e.code === 'KeyJ') openJournal();
  if (e.code === 'KeyC' && uiMode === 'playing' && P.mode === 'walk' && !F.cutscene && hasCamera()) hands.toggleCamera();   // the disposable camera up to the eye, or back down
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && uiMode === 'playing') setPause(true); });
// look sensitivity and invert-Y (options menu) scale the mouse, the right stick and the touch look pad alike
const look = { s: settings.get('sensitivity'), y: settings.get('invertY') ? -1 : 1 };
settings.on('sensitivity', (v) => { look.s = v; }); settings.on('invertY', (v) => { look.y = v ? -1 : 1; });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || paused || F.cutscene) return;
  if (!(P.mode === 'walk' || P.mode === 'bunk' || P.mode === 'hide' || P.mode === 'car' || P.mode === 'seat')) return;
  P.yaw -= e.movementX * 0.0022 * look.s; P.pitch = clamp(P.pitch - e.movementY * 0.0022 * look.s * look.y, -1.45, 1.45);
});
// the pause menu says where you are and the run's seed, so it can be shared or played again
function pauseInfo() {
  const s = F.stage, n = s.slice(1);
  $('pauseinfo').textContent = `${s === 'day' ? 'Moving day' : s[0] === 'b' ? `Morning ${n}` : `Night ${n} of 10`}  ·  seed ${RUN.seed}`;
}
// pause / resume without the mouse (controller Start, the touch pause button)
function setPause(on) {
  if (on && uiMode === 'playing') { uiMode = 'pause'; paused = true; pauseInfo(); UI.show('pause'); sfx.suspend(); for (const k in keys) keys[k] = false; if (document.pointerLockElement) unlock(); }
  else if (!on && uiMode === 'pause') { uiMode = 'playing'; paused = false; UI.hide('pause'); sfx.resume(); if (input.scheme === 'kb') lock(); }
}
// the A button on a menu screen is a click on its button
function confirmPress() {
  if (uiMode === 'title' && !started) startGame(); else if (uiMode === 'pause') setPause(false); else if (uiMode === 'death') retry(); else if (uiMode === 'end') location.reload();
}
const canLook = () => !paused && !F.cutscene && !F.dead && (P.mode === 'walk' || P.mode === 'bunk' || P.mode === 'hide' || P.mode === 'car' || P.mode === 'seat');
function lookBy(dyaw, dpitch) { if (!canLook()) return; P.yaw += dyaw * look.s; P.pitch = clamp(P.pitch + dpitch * look.s * look.y, -1.45, 1.45); }
initInput({ interact: () => { if (uiMode === 'playing') pressE = true; }, pause: () => setPause(uiMode === 'playing'), confirm: confirmPress, lookBy, light: () => toggleLight(), cover: () => { if (canBunkCover()) hideUnderCovers(); }, photos: () => openPhotos(), journal: () => openJournal() });
// the controls table and the "begin" line follow whichever device you last used
function renderControls() {
  $('controls').innerHTML = controlsTable().map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  $('begin').textContent = input.scheme === 'touch' ? 'Tap to begin' : input.scheme === 'pad' ? 'Press A to begin' : 'Click to begin';
  $('resume').textContent = input.scheme === 'touch' ? 'Tap to resume' : input.scheme === 'pad' ? 'Press A to resume' : 'Click to resume';
}
input.onScheme = renderControls; renderControls();
// phones have no pointer lock: document.exitPointerLock is missing there, and calling it threw before the death screen could show
function unlock() { try { if (document.exitPointerLock) document.exitPointerLock(); } catch (err) { /* ignore */ } }
function lock() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* ignore */ } }
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked && uiMode === 'pause') { uiMode = 'playing'; paused = false; UI.hide('pause'); sfx.resume(); }
  else if (!locked && uiMode === 'playing') { uiMode = 'pause'; paused = true; pauseInfo(); UI.show('pause'); sfx.suspend(); for (const k in keys) keys[k] = false; }
});
$('pause').addEventListener('click', () => { lock(); setTimeout(() => { if (uiMode === 'pause' && document.pointerLockElement !== canvas) setPause(false); }, 200); });
// a resume the browser refused to lock: click to take the mouse back
canvas.addEventListener('click', () => { if (uiMode === 'playing' && input.scheme === 'kb' && document.pointerLockElement !== canvas) lock(); });
$('title').addEventListener('click', startGame);
$('start').addEventListener('click', (e) => { e.stopPropagation(); startGame(); });
$('retry').addEventListener('click', retry);
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); gfx.resize(); });

// two of the director's night events (director.js): a car goes by out front and its light slides through the windows, and something huge
// and pale drifts past them
function carPass() { WF.carPass(); traffic.pass(); sfx.moving('sfx/car_pass', { gain: 0.9, from: 0.9, to: -0.9 }); }
function faceAtWindow() {
  WF.face(); sfx.moving('sfx/face_wail', { gain: 0.8, from: 0.6, to: -0.8, dur: 13 });
}

// the green night lights: a steady faint pulse; they stutter and dim when the thing is near
let nlBase = 0;
function nlMult(m, flick = true) {
  if (F.blackout) m = 0;
  for (const n of W.nightLights) {
    let k = n.dead ? 0 : m;
    if (flick && E.visible && m > 0) { const d = Math.hypot(n.pos.x - E.root.position.x, n.pos.z - E.root.position.z), dim = k * (1 - 0.35 * (1 - d / 7)); if (d < 7) k = flicker(n, Math.random() < 0.09 * (1 - d / 7) * 3 ? k * 0.08 : dim, dim); }
    n.light.intensity = n.base * k; n.mat.emissiveIntensity = 2.4 * k;
  }
}

// Mom and Dad sleep in their bed at night (flat on their backs: the standing model laid down); they are awake and upright otherwise.
function sleepers(on) {
  for (const [p, spot] of [[mom, W.parentsBed.mom], [dad, W.parentsBed.dad]]) {
    p.sleeping = on; p.busy = on || p.busy && false; p.pose = null; p.setNight(on);
    // asleep: the rig lies on its back with its head on the pillow, under the quilt (the quilt's ridges follow them), in a sleeping pose
    if (on) { p.group.visible = true; p.group.rotation.order = 'YXZ'; p.group.rotation.set(-Math.PI / 2, spot.yaw ?? Math.PI / 2, 0); p.group.position.set(spot.x, spot.y, spot.z);
      { const toFoot = new V3(0, -1, 0).applyEuler(p.group.rotation); toFoot.y = 0; p.group.position.addScaledVector(toFoot.normalize(), p === dad ? 0.16 : 0.1); p.group.position.y += 0.02; } p.lookAt = null; p.pose = { sleep: p === mom ? 1 : -1 }; if (p.rig) p.rig.play('idle', { fade: 0, speed: 0.05 }); }   // (toward the foot so the head clears the headboard - Dad is taller - and 2 cm up so it rests on the pillow, not in the mattress)
    else if (p.group.rotation.order === 'YXZ') { p.group.rotation.order = 'XYZ'; p.group.rotation.set(0, 0, 0); }
  }
  W.bedSleepers.set(on);
}

// ---------- phases (lighting) ----------
function setPhase(p, silent = false) {
  if (p !== 'night') FN.reset(E);   // the bedside scene belongs to a night: by day, at the title and in the morning none of it is there
  F.phase = p; W.sun.shadow.needsUpdate = true;
  const day = p === 'day', night = p === 'night' || p === 'title', morn = p === 'morning';
  gfx.setPhase(p);
  scene.fog = day ? new THREE.FogExp2(0xbccddc, 0.013) : p === 'title' ? new THREE.FogExp2(0x02040c, 0.03) : night ? new THREE.FogExp2(0x040818, 0.062) : new THREE.FogExp2(0xe8d9c2, 0.016);   // the fog swallows everything past the property lines
  fogObj = scene.fog; fogBase = scene.fog.density; fogK = -1;   // the draw distance setting thickens it (applyDetail)
  W.hemi.color.set(day ? 0xcfe0ff : night ? 0x2d4c9c : 0xffe6c4);
  W.hemi.groundColor.set(day ? 0x5a4a35 : night ? 0x04060f : 0x6a5238);
  W.hemi.intensity = day ? 0.55 : p === 'title' ? 0.28 : night ? 0.3 : 0.8;
  W.sun.color.set(day ? 0xfff1dc : night ? 0x5f7cff : 0xffd2a0);
  W.sun.intensity = day ? 3.0 : p === 'title' ? 0.4 : night ? 0.28 : 2.4;
  if (day) W.sun.position.set(40, 45, -30); else if (night) W.sun.position.set(-60, 50, 40); else W.sun.position.set(55, 18, 5);
  W.stars.visible = W.moon.visible = night;
  lights.phase(p);   // by day the rooms are lit; in the morning and at night every switch is off, and dead bulbs work again
  W.fills.forEach((f, i) => {
    f.visible = !night;
    if (day) { f.color.set(0xdde8ff); f.intensity = 0.65; }
    else if (night) { f.color.set(0x6f86c8); f.intensity = i < 2 ? 0.45 : 0.3; }
    else { f.color.set(0xffd7a0); f.intensity = i < 2 ? 4.5 : 3; }
  });
  nlBase = night ? 1 : 0; nlMult(nlBase, false);
  // which lights exist this phase (changing this recompiles the shaders, so it happens only here, behind the fade)
  for (const n of W.nightLights) n.light.visible = night;
  W.faceLight.visible = W.carLight.visible = night;
  W.porchLight.intensity = p === 'title' ? 7 : 0; W.porchBulb.material.emissiveIntensity = p === 'title' ? 4 : 0;
  W.streetLight.set(night && !F.blackout); W.farLights.visible = night;
  // the weather of the night from the seed; the morning after a wet night the ground is still dark; the title and the day are clear
  const wx = p === 'night' ? weatherFor(RUN.seed, F.night) : morn && weatherFor(RUN.seed, F.night) !== 'clear' ? 'wet' : 'clear';
  weather.set(wx); if (silent || p !== 'night') weather.jump();
  W.bathSpot.intensity = 0;
  W.frontDoor.setOpen(day);
  // the drawing changes in the night: on night one someone draws a new figure into it (F.drawn), from night two it is the one where he pushes
  W.drawingMat.map = !(p === 'night' || morn) ? W.T.drawing0 : (F.night || 0) <= 1 ? (F.drawn ? (W.T.drawing2 || (W.T.drawing2 = FN.drawing())) : W.T.drawing0) : W.T.drawing1; W.drawingMat.needsUpdate = true;
  setExposure(EXPOSURE[day ? 'day' : night ? 'night' : 'morning']);
  if (p === 'night') sleepers(true); else { sleepers(false); mom.group.visible = dad.group.visible = day; }
  if (sfx.ctx && !silent) {
    sfx.wind(day ? 0.035 : night ? 0.06 : 0.025, 2);
    sfx.drone(p === 'night' ? 0.12 : p === 'title' ? 0.05 : 0, 3);
    sfx.hum(p === 'night' ? 0.012 : 0, 2);
    sfx.tension(0, 1);
    if (p !== 'night') { sfx.dread(0, 2); sfx.violins(0, 0.5); }
    sfx.bed('music/moving_day', day ? 0.5 : 0, 3);
    sfx.bed('music/night', night ? 0.4 : 0, 3);
    sfx.bed('music/morning', morn ? 0.45 : 0, 3);
    sfx.bed('music/chase', 0, 1);
  }
}

// ---------- interactables ----------
const interacts = [];
const addI = (o) => interacts.push(o);
W.pickups.forEach((b) => addI({ obj: b, r: 2.2, label: 'Pick up the box', when: () => F.phase === 'day' && !P.carrying && b.parent === W.yard, act: () => pickUp(b) }));
addI({ obj: W.drawingMesh, r: 2.3, label: 'Look at the drawing', when: () => F.phase !== 'morning' && roomAt(P.pos.x, P.pos.z) === 'hall', act: lookDrawing });
addI({ obj: mom.head, r: 2.6, label: 'Talk to Mom', when: () => F.phase === 'day' && mom.group.visible && F.giftTaken !== false, act: talkMom });
addI({ obj: dad.head, r: 2.6, label: 'Talk to Dad', when: () => F.phase === 'day' && dad.group.visible, act: talkDad });
// the light switches: flip one and its room's lights come on or go off (the hall has one at each end)
for (const sw of W.switches) {
  if (!sw.room || !lights.rooms[sw.room]) continue;
  addI({ p: sw.at, r: 1.35, label: () => (lights.isOn(sw.room) ? 'Turn off the light' : 'Turn on the light'), when: () => F.phase !== 'title' && !F.cutscene && !F.script, act: () => lights.toggle(sw.room, { by: 'player', sw }) });
}
addI({ p: new V3(9.09, 1.3, 3.1), r: 1.6, label: 'Climb into the top bunk', when: () => F.phase === 'day' || F.phase === 'night', act: climbUp });
for (const d of Object.values(W.doors)) {   // the interior doors
  // Mom and Dad's barn door is kept locked, day and night; only the story slides it open (and once it is open you may shut it again)
  addI({ p: d.mid, r: 1.55, label: () => (d.name === 'parents' && !d.target ? 'Try the handle' : d.target ? 'Close the door' : 'Open the door'), when: () => F.phase !== 'title' && !(F.phase === 'night' && F.night === 0), act: () => (d.name === 'parents' && !d.target ? lockedDoor(d) : toggleDoor(d)) });
}
W.setDoorHook((name, open) => { const d = W.doors[name]; const pan = panFor(tmp.set(d.mid.x, 1.2, d.mid.z)); if (open) sfx.doorOpen(pan, 0.35); else sfx.doorClose(pan, 0.5); });
let lockedAt = -9;
function lockedDoor(d) {   // the handle will not turn; something on the other side is awake and does not answer
  const pan = panFor(tmp.set(d.mid.x, 1.2, d.mid.z));
  sfx.knock(pan, 0.12); for (let i = 0; i < 3; i++) sfx.noiseHit({ dur: 0.05, type: 'bandpass', f: 2400 + i * 300, gain: 0.12, pan, wet: 0.08, delay: 0.05 + i * 0.07 });   // the latch rattles in the keeper
  if (gameTime - lockedAt > 6) UI.subtitle("<i>It's locked.</i>", 1.8);
  if (gameTime - lockedAt > 6) { lockedAt = gameTime; later(1.1, () => { if (F.phase === 'night') say(Math.random() < 0.5 ? 'dad/mutter_a' : 'mom/mutter_a', { muffle: true }); }); }
}
function toggleDoor(d) {
  if (d.target && E.visible && Math.hypot(E.root.position.x - d.mid.x, E.root.position.z - d.mid.z) < 1.2) { sfx.creak(0.2, 0); return; }
  if (d.target && Math.hypot(P.pos.x - d.mid.x, P.pos.z - d.mid.z) < 0.55) return;   // not on top of yourself
  W.setDoor(d.name, !d.target);
}
addI({ p: W.bathSink, r: 1.9, label: 'Splash water on your face', when: () => F.phase === 'night' && !F.splashed, act: splash });

const REACH = 0.7;   // interact range as a share of each thing's radius: you have to be right up close
// a wall (or a shut door) between you and the thing; the thing's own wall or door is not counted
function sightBlocked(x, z, tx, tz) {
  const dx = tx - x, dz = tz - z, d = Math.hypot(dx, dz);
  if (d < 1e-3) return false;
  return wallAhead(x, z, dx / d, dz / d, d, tx, tz) < d - 0.05;
}
function updateInteract() {
  let label = null, act = null, extra = '', at = null;
  if (!F.cutscene && !F.dead) {
    if (P.mode === 'car') {
      if (F.carPrompt) { label = F.carPrompt.label; act = F.carPrompt.act; }
    } else if (P.mode === 'hide') {
      if (F.live && nights && nights.canComeOut() && !F.breathCheck) { label = P.pod ? 'Come out' : 'Come out from under the covers'; act = () => nights.exitHide(); }
    } else if (P.mode === 'seat') {
      if (seat && !seat.tween) { label = 'Stand up'; act = standUp; }
    } else if (P.mode === 'bunk') {
      if (F.phase === 'morning') { if (F.morningReady) { label = 'Climb down'; act = climbDown; } }
      else { label = 'Climb down'; act = climbDown; if (F.live) extra = ` &nbsp;·&nbsp; <b>${L('breath')}</b> Hide under the covers`; }
    } else if (P.mode === 'walk') {
      if (P.carrying && roomAt(P.pos.x, P.pos.z) === 'bed') { label = 'Put the box down'; act = dropBox; }
      else {
        camera.getWorldDirection(fwd);
        let best = -1;
        for (const it of interacts) {
          if (!it.when()) continue;
          if (it.obj) it.obj.getWorldPosition(tmp); else tmp.copy(it.p);
          const tx = tmp.x, tz = tmp.z;
          tmp.sub(camera.position); const d = tmp.length(); if (d > it.r * REACH) continue;
          const dot = tmp.divideScalar(d).dot(fwd);
          const score = dot - d * 0.12;   // near things win over far ones in the same direction
          if (dot > (d < 1.1 ? 0.55 : 0.82) && score > best && !sightBlocked(camera.position.x, camera.position.z, tx, tz)) { best = score; label = typeof it.label === 'function' ? it.label() : it.label; act = it.act; at = it; }
        }
      }
    }
  }
  UI.prompt(label ? `<b>${L('interact')}</b> ${label}${extra}` : null); input.setUse(!!label);
  if (pressE && act) { if (at) { if (at.obj) at.obj.getWorldPosition(reachW); else reachW.copy(at.p); if (!hands.raised) hands.reach(reachW, camera); } act(); }
  else if (pressE && hands.raised && hasCamera() && P.mode === 'walk' && !F.cutscene) takePhoto();   // a shot of nothing in particular: the flash, the shutter, the winder
  pressE = false;
}
const reachW = new V3();

// The held box is pulled back and down as a wall gets close, so it never pokes through (the player's circle is smaller than the box's reach).
const BOX_HALF = 0.23, BOX_Z = 0.62;
function wallAhead(ox, oz, dx, dz, max, skipX, skipZ) {
  let best = max;
  for (const c of W.colliders) {
    if (!c.on || !onFloor(c)) continue;
    if (skipX !== undefined && skipX >= c.minX - 0.12 && skipX <= c.maxX + 0.12 && skipZ >= c.minZ - 0.12 && skipZ <= c.maxZ + 0.12) continue;
    let t0 = 0, t1 = best;
    for (const [o, d, lo, hi] of [[ox, dx, c.minX, c.maxX], [oz, dz, c.minZ, c.maxZ]]) {
      if (Math.abs(d) < 1e-6) { if (o < lo || o > hi) { t1 = -1; break; } continue; }
      let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a];
      t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
    }
    if (t1 >= t0 && t0 > 0 && t0 < best) best = t0;
  }
  return best;
}
function holdBox(dt) {
  const b = P.carrying; if (!b) return;
  camera.getWorldDirection(fwd); fwd.y = 0; const l = Math.hypot(fwd.x, fwd.z);
  let z = BOX_Z, y = -0.4;
  if (l > 1e-3) {
    const dx = fwd.x / l, dz = fwd.z / l, rx = -dz, rz = dx, reach = BOX_Z + BOX_HALF + 0.06;
    let t = reach;
    for (const o of [-0.27, 0, 0.27]) t = Math.min(t, wallAhead(camera.position.x + rx * o, camera.position.z + rz * o, dx, dz, reach));
    z = Math.max(0.08, t - BOX_HALF - 0.04); z = Math.min(z, BOX_Z);
    y = -0.4 - (BOX_Z - z) * 0.45;       // tuck it lower as it comes in
  }
  const k = Math.min(1, dt * 16);
  b.position.z += (-z - b.position.z) * k; b.position.y += (y - b.position.y) * k;
}
function pickUp(b) {
  P.carrying = b; W.yard.remove(b); camera.add(b);
  b.position.set(0.02, -0.4, -0.62); b.rotation.set(0.08, 0.12, 0);
  sfx.thump();
  if (F.boxes === 0) UI.hint('Carrying slows you down', 3);
}
const kidBoxes = [];   // your three, where you put them down (night one finds them unpacked and stacked on the floor)
function dropBox() {
  const b = P.carrying, spot = W.dropSpots[Math.min(F.boxes, W.dropSpots.length - 1)];
  camera.remove(b); W.house.add(b); b.position.set(spot.x, spot.y + 0.22, spot.z); b.rotation.set(0, (Math.random() - 0.5) * 0.6, 0);
  P.carrying = null; F.boxes++; sfx.thump(); kidBoxes.push(b);
  if (F.boxes < 3) UI.objective(`Carry your boxes to your room <span>${F.boxes} / 3</span>`);
  if (F.boxes === 1) UI.subtitle('<i>Top bunk is yours. The bottom one is for boxes.</i>', 4);
}
function lookDrawing() {
  if (F.phase === 'night') { sfx.whisper(0, 0.1); F.fear = Math.max(F.fear, 0.4); }
  else UI.subtitle("<i>The last kid drew this. A tall black shape with huge white eyes and a big smile. \"HE WATCHES.\"</i>", 6);
  sfx.creak(0.12, 0.6, 0.4); achievements.unlock('THE_DRAWING');
}
// ---------- dialogue: assets/audio/lines.json holds each line's subtitle and the text the voice reads (tools/gen_voice.py makes the audio) ----------
let LINES = {};
try { LINES = await (await fetch('assets/audio/lines.json')).json(); } catch (e) { /* no dialogue file: lines show as plain ids */ }
// subtitle + recorded voice (what the kid says is subtitle-only); returns how long the line is held
function speak(id, { muffle = false, hold = 0.45 } = {}) {
  const l = LINES[id] || { html: id, voice: null };
  let d = 0, rec = false;
  const text = l.html.replace(/<[^>]+>/g, ''), len = Math.max(2.2, 1.0 + text.length / 15);
  if (l.voice) {
    d = sfx.say(id, { muffle }); rec = d > 0;   // only a recorded line counts as speech for the subtitles setting: a murmur needs its words shown
    let envl = muffle ? null : sfx.envelope('vo/' + id);
    if (!d) { d = len; envl = sfx.mumble(l.voice, len, { muffle }); if (muffle) envl = null; }   // no recording yet: a murmur with the same rhythm
    (l.voice === 'mom' ? mom : dad).talk(envl, { question: /\?["'”]?\s*$/.test(text.trim()), to: LINE_TO[id] || 'you', mood: MOOD[id] || (/\/ph_mid/.test(id) ? 'uneasy' : /\/ph_high|\/m[6-9]_/.test(id) ? 'scared' : null) });
  }
  const t = Math.max(d + hold, 2.4 + text.length / 24);
  UI.subtitle(l.html, t, rec ? 'speech' : null);
  // who is speaking to whom, for the heads and the camera; nothing for a line heard through a wall
  const by = l.voice || (/^<b>(Mom|Dad):/.exec(l.html) || [])[1]?.toLowerCase();
  if (!muffle && (by === 'mom' || by === 'dad') && /^b\d+$/.test(F.stage || '')) journal.said(+F.stage.slice(1), by === 'mom' ? 'Mom' : 'Dad', l.html);   // the morning, written down
  if (!muffle && (by === 'mom' || by === 'dad')) {
    talkNow.who = by; talkNow.to = LINE_TO[id] || 'you'; talkNow.until = gameTime + t;
    if (F.talkCam) lookAtTalk(by === 'mom' ? mom : dad);
  }
  return t;
}
// lines the parents say to each other rather than to you (the rest are to you)
const LINE_TO = {
  'dad/cheap': 'mom', 'dad/m4_a': 'mom', 'dad/box4': 'mom', 'mom/m5_a': 'dad', 'dad/m5_b': 'mom', 'mom/m5_b': 'dad', 'dad/m6_a': 'mom', 'mom/m6_b': 'dad',
  'mom/m7_a': 'dad', 'dad/m7_b': 'mom', 'dad/m8_a': 'mom', 'mom/m8_b': 'dad',
  'mom/ph_high_a': 'dad', 'dad/ph_high_a': 'mom',
};
// how a line is said: the face and the hands take it from here (questions are found from the text)
const MOOD = {
  'dad/welcome': null, 'dad/line_1': null, 'dad/line_2': null, 'dad/line_3': null, 'dad/mom_looking': null, 'dad/cheap': null, 'dad/leftovers': 'uneasy', 'dad/box4': 'uneasy',
  'mom/boxes_first': 'warm', 'mom/boxes_again': null, 'mom/helper': 'warm', 'mom/landlord': 'uneasy', 'mom/teeth': 'warm', 'mom/gift_a': 'warm', 'mom/gift_b': 'warm', 'dad/gift': null,
  'mom/m1_a': 'uneasy', 'dad/m1_a': 'uneasy', 'mom/m1_b': 'uneasy', 'mom/n1_door_a': 'uneasy', 'mom/n1_door_b': 'scared', 'mom/m2_a': 'uneasy', 'dad/m2_a': null, 'mom/m2_b': 'uneasy', 'mom/m3_a': 'uneasy', 'mom/m4_a': 'uneasy', 'mom/m4_b': 'uneasy',
};
const talkNow = { who: null, to: null, until: 0 };
// every frame: the speaker looks at whoever the line is for, the other parent looks at the speaker and turns a little toward them
function talkGaze() {
  const on = talkNow.who && gameTime < talkNow.until;
  for (const p of [mom, dad]) { p.gazeAt = null; p.turnTo = null; p.turnK = 0; p.listening = false; }
  if (!on) { talkNow.who = null; return; }
  const sp = talkNow.who === 'mom' ? mom : dad, other = sp === mom ? dad : mom;
  if (other.group.visible && !other.sleeping) {
    other.gazeAt = sp.head; other.turnTo = sp.group.position; other.turnK = 0.4; other.listening = true;
    if (talkNow.to !== 'you') { sp.gazeAt = other.head; sp.turnTo = other.group.position; sp.turnK = 0.65; }
  }
}
// the view eases to the speaker (0.5 s); with both parents close together in view it holds a two-shot leaning toward the one talking
let talkCamRun = 0;
function lookAtTalk(sp) {
  const run = ++talkCamRun, other = sp === mom ? dad : mom, a = sp.head.getWorldPosition(new V3()), b = other.head.getWorldPosition(new V3());
  const yawTo = (v) => Math.atan2(-(v.x - P.pos.x), -(v.z - P.pos.z));
  const target = other.group.visible && Math.abs(angDiff(yawTo(a), yawTo(b))) < 0.75 ? b.clone().lerp(a, 0.68) : a;
  const want = yawTo(target), up = clamp(Math.atan2(target.y - EYE, Math.hypot(target.x - P.pos.x, target.z - P.pos.z)), -0.3, 0.4), y0 = P.yaw, p0 = P.pitch;
  if (Math.abs(angDiff(y0, want)) < 0.04 && Math.abs(up - p0) < 0.03) return;
  tween(0.5, (k) => { if (run !== talkCamRun) return; P.yaw = lerpAngle(y0, want, k); P.pitch = lerp(p0, up, k); }, ease.inOut);
}
const say = async (id, o) => { await wait(speak(id, o)); };
function talkMom() {
  if (!F.momReady) { talkTo(mom, F.askedMom ? 'mom/boxes_again' : 'mom/boxes_first'); F.askedMom = true; return; }
  if (!F.talkedMom) F.talkedMom = true;
}
const dadLines = ['dad/line_1', 'dad/line_2', 'dad/line_3'];
let dadIdx = 0;
function talkDad() { talkTo(dad, F.boxes >= 3 ? 'dad/mom_looking' : dadLines[dadIdx++ % dadLines.length]); }
function splash() { sfx.splash(); UI.subtitle('<i>The water is ice cold.</i>', 3); F.splashed = true; }

// ---------- bunk ----------
async function climbUp() {
  if (F.cutscene) return;
  F.cutscene = true; P.mode = 'cine';
  P.cam.copy(camera.position);
  const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch, hiding = F.chase;   // while it is hunting you, you climb straight under the covers
  sfx.creak(0.25, 0);
  await tween(0.32, (k) => { P.cam.lerpVectors(from, LADDER_MID, k); P.yaw = lerpAngle(y0, LADDER_YAW, k); P.pitch = lerp(p0, 0.3, k); });
  sfx.footstep(0.2, 0, 0.1);
  const dest = hiding ? BUNK_LIE : BUNK_SEAT;
  await tween(0.42, (k) => { P.cam.lerpVectors(LADDER_MID, dest, k); P.yaw = lerpAngle(LADDER_YAW, HIDE_YAW, k); P.pitch = lerp(0.3, hiding ? 0.15 : -0.1, k); });
  F.cutscene = false; P.pos.set(BUNK_SEAT.x, 0, BUNK_SEAT.z); P.pod = null; P.podYaw = HIDE_YAW;
  if (hiding || F.chase) {
    P.mode = 'hide'; UI.blanket(true); sfx.whoosh(0); enteredHide(); if (nights) nights.hunter.notifyPod('bunk');
  } else { P.mode = 'bunk'; bunkSince = gameTime; }
}
// already up on the bunk when it comes: pull the blanket over your head
async function hideUnderCovers() {
  F.cutscene = true; P.mode = 'cine'; const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch;
  await tween(0.6, (k) => { P.cam.lerpVectors(from, BUNK_LIE, k); P.yaw = lerpAngle(y0, HIDE_YAW, k); P.pitch = lerp(p0, 0.15, k); });
  F.cutscene = false; P.mode = 'hide'; P.pod = null; P.podYaw = HIDE_YAW; P.pos.set(BUNK_SEAT.x, 0, BUNK_SEAT.z); UI.blanket(true); sfx.whoosh(0); UI.objective(null); enteredHide(); if (nights) nights.hunter.notifyPod('bunk');
}
async function climbDown() {
  if (F.cutscene) return;
  F.cutscene = true; P.mode = 'cine'; P.cam.copy(camera.position);
  const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch;
  sfx.creak(0.25, 0);
  await tween(0.4, (k) => { P.cam.lerpVectors(from, LADDER_MID, k); P.yaw = lerpAngle(y0, LADDER_YAW, k); P.pitch = lerp(p0, 0.1, k); });
  const end = new V3(LADDER_FLOOR.x, 1.32, LADDER_FLOOR.z);
  await tween(0.35, (k) => { P.cam.lerpVectors(LADDER_MID, end, k); P.yaw = lerpAngle(LADDER_YAW, HIDE_YAW, k); P.pitch = lerp(0.1, 0, k); });
  sfx.footstep(0.3);
  P.pos.set(LADDER_FLOOR.x, 0, LADDER_FLOOR.z); P.vel.set(0, 0, 0);
  P.mode = 'walk'; F.cutscene = false; P.pod = null;
}
function toBunk() { bunkSince = gameTime; P.mode = 'bunk'; P.cam.copy(BUNK_SEAT); P.pos.set(BUNK_SEAT.x, 0, BUNK_SEAT.z); P.yaw = HIDE_YAW + 0.25; P.pitch = -0.18; P.roll = 0; P.pod = null; F.cutscene = false; }
function enteredHide() { breathPrev = true; breathLatch = false; if (F.flashOn) { F.flashOn = false; flash.intensity = 0; } }

// ---------- player ----------
// a collider counts only on the floor you are on: the laundry is under Mom and Dad's room, and the outside stairs pass both
const onFloor = (c) => !(P.pos.y + 0.5 < (c.minY ?? -0.3) || P.pos.y > (c.maxY ?? 3));
function collide() {
  for (const c of W.colliders) {
    if (!c.on || !onFloor(c)) continue;
    const cx = clamp(P.pos.x, c.minX, c.maxX), cz = clamp(P.pos.z, c.minZ, c.maxZ);
    const dx = P.pos.x - cx, dz = P.pos.z - cz, d2 = dx * dx + dz * dz;
    if (d2 >= R * R) continue;
    if (d2 > 1e-9) { const d = Math.sqrt(d2); P.pos.x = cx + (dx / d) * R; P.pos.z = cz + (dz / d) * R; }
    else {
      const l = P.pos.x - c.minX, r = c.maxX - P.pos.x, b = P.pos.z - c.minZ, t = c.maxZ - P.pos.z, m = Math.min(l, r, b, t);
      if (m === l) P.pos.x = c.minX - R; else if (m === r) P.pos.x = c.maxX + R; else if (m === b) P.pos.z = c.minZ - R; else P.pos.z = c.maxZ + R;
    }
  }
  for (const p of [mom, dad]) {
    if (!p.group.visible) continue;
    const g = p.group.position, dx = P.pos.x - g.x, dz = P.pos.z - g.z, d = Math.hypot(dx, dz), rr = R + 0.3;
    if (d < rr && d > 1e-6) { P.pos.x = g.x + (dx / d) * rr; P.pos.z = g.z + (dz / d) * rr; }
  }
}
function movePlayer(dt) {
  const fx = -Math.sin(P.yaw), fz = -Math.cos(P.yaw), rx = Math.cos(P.yaw), rz = -Math.sin(P.yaw);
  const f = clamp((keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0) + input.fy, -1, 1);
  const s = clamp((keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0) + input.fx, -1, 1);
  let wx = fx * f + rx * s, wz = fz * f + rz * s; const wl = Math.hypot(wx, wz), mag = Math.min(1, wl);   // a gentle stick push walks slowly
  if (wl > 0) { wx /= wl; wz /= wl; }
  const sprint = (keys.ShiftLeft || keys.ShiftRight || input.run) && wl > 0 && f > 0 && !P.carrying && !P.exhausted && P.stamina > 0.01;
  const speed = (P.carrying ? 1.6 : sprint ? 4.4 : 2.0) * (0.35 + 0.65 * mag);   // m/s: kept slow so the house takes a while to cross
  P.sprinting = sprint;
  if (sprint) P.stamina -= dt / 6; else P.stamina = Math.min(1, P.stamina + dt / 4);
  if (P.stamina <= 0.01 && !P.exhausted) { P.exhausted = true; sfx.gasp(); }
  if (P.exhausted && P.stamina > 0.4) P.exhausted = false;
  const a = Math.min(1, dt * 10);
  P.vel.x += (wx * speed - P.vel.x) * a; P.vel.z += (wz * speed - P.vel.z) * a;
  for (let i = 0; i < 3; i++) { P.pos.x += P.vel.x * dt / 3; P.pos.z += P.vel.z * dt / 3; collide(); }
  P.pos.y += (W.groundAt(P.pos.x, P.pos.z, P.pos.y) - P.pos.y) * Math.min(1, dt * 14);   // the outside stairs: eased, so the steps don't jolt
  P.speed = Math.hypot(P.vel.x, P.vel.z);
  const stride = sprint ? 0.95 : 0.66;
  P.stepAcc += P.speed * dt; P.bob += P.speed * dt * (Math.PI / stride);
  if (P.stepAcc > stride) { P.stepAcc = 0; playerStep(sprint); }
  UI.stamina(P.stamina, P.stamina < 0.99);
}
function playerStep(sprint) {
  const room = roomAt(P.pos.x, P.pos.z, P.pos.y), vol = sprint ? 0.42 : 0.26;
  sfx.footstep(vol, 0, room === 'bath' || room === 'kitchen' || room === 'dining' || room === 'laundry' ? 0.3 : 0.15, surfaceAt(P.pos.x, P.pos.z, P.pos.y, room));
  if (F.echo) echoes.push(gameTime + 0.27 + Math.random() * 0.06);
}
// what a foot lands on: the drive is gravel, the stoop and the stairs outside are wood, the rest of the yard grass
function surfaceAt(x, z, y, room = roomAt(x, z, y)) {
  if (room === 'out') return W.onDrive && W.onDrive(x, z) ? 'gravel' : (y > 0.05 ? 'stairs' : 'grass');
  if (room === 'stoop') return 'wood';
  if (y < -0.3 && room !== 'laundry') return 'stairs';
  return ['bath', 'kitchen', 'dining', 'laundry', 'garage'].includes(room) ? 'tile' : 'carpet';
}
function updateCamera(dt) {
  if (P.mode === 'walk') {
    const bobY = Math.sin(P.bob) * 0.035 * Math.min(1, P.speed / 2.5) * bobK;
    camera.position.set(P.pos.x, P.pos.y + EYE + bobY, P.pos.z);
  } else if (P.mode === 'car') { car.cameraWorld(camera.position); P.yaw = clamp(P.yaw, -2.75, 2.75); P.pitch = clamp(P.pitch, -0.85, 0.65); }
  else camera.position.copy(P.cam);
  if (P.mode === 'hide') {
    const hy = P.pod ? P.podYaw : HIDE_YAW;
    P.yaw = hy + clamp(angDiff(hy, P.yaw), P.pod ? -0.9 : -0.55, P.pod ? 0.9 : 0.55); P.pitch = clamp(P.pitch, -0.35, 0.4);
    camera.position.y += Math.sin(gameTime * (keys.Space || input.breath ? 0.6 : 2.4)) * 0.006;
  }
  if (P.mode === 'bunk') P.pitch = clamp(P.pitch, -1.2, 0.9);
  if (P.mode === 'seat' && seat) { P.yaw = seat.yaw + clamp(angDiff(seat.yaw, P.yaw), -1.75, 1.75); P.pitch = clamp(P.pitch, -0.8, 0.55); }   // turning in a chair, not in a turret
  camera.rotation.set(P.pitch, P.mode === 'car' ? car.baseYaw() + P.yaw : P.yaw, P.roll);
  leanOver(dt);
  handheld(dt);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.07;
    camera.position.y += (Math.random() - 0.5) * shake * 0.07;
    camera.rotation.z += (Math.random() - 0.5) * shake * 0.04;
    shake = Math.max(0, shake - dt * 1.6);
  }
  holdBox(dt);
}

// on the top bunk, looking right down over the room side hangs your head over the edge, and your eyes go to the bottom bunk under you
// (F.leanK 0..1: night one listens for it)
const LOWER_BUNK = new V3(8.42, 0.6, 3.82), leanQ = new THREE.Quaternion(), leanM = new THREE.Matrix4();
function leanOver(dt) {
  const want = P.mode === 'bunk' && !F.cutscene && Math.abs(angDiff(HIDE_YAW, P.yaw)) < 1.25 ? THREE.MathUtils.smoothstep(-P.pitch, 0.62, 1.12) : 0;
  F.leanK = (F.leanK || 0) + (want - (F.leanK || 0)) * Math.min(1, dt * 3.2);
  const k = F.leanK; if (k < 0.002) return;
  const e = k * k * (3 - 2 * k);
  // the head goes out past the rail (the top bunk's edge is at z 3.35) and then hangs down over the side, below the top mattress, so you see
  // under it into the bottom bunk
  camera.position.z -= 0.9 * e; camera.position.y -= 0.86 * e * e; camera.position.x += 0.06 * e;
  leanM.lookAt(camera.position, LOWER_BUNK, camera.up); leanQ.setFromRotationMatrix(leanM);
  camera.quaternion.slerp(leanQ, e * 0.9);
}
// the camera is never perfectly still: breathing, a rolling gait, and a tremor that grows with fear (F.fear, 0..1)
// baseFov and bobK follow the options menu (field of view; head bob scales the walking gait, not the breathing or the fear tremor)
let baseFov = settings.get('fov'), fovNow = baseFov, fovOff = 0, bobK = +settings.get('headBob');   // fovOff: the nightmare swings the lens
settings.on('fov', (v) => { fovNow += v - baseFov; baseFov = v; if (started) { camera.fov = fovNow; camera.updateProjectionMatrix(); } });
settings.on('headBob', (v) => { bobK = +v; });
function handheld(dt) {
  const t = gameTime, fear = F.fear, walk = P.mode === 'walk' ? Math.min(1, P.speed / 2.2) : 0, gait = walk * bobK, k = P.mode === 'cine' ? 0.5 : 1;
  const tr = 1 + fear * 3.2;
  camera.rotation.x += (Math.sin(t * 1.05) * 0.0055 + Math.sin(t * 0.37) * 0.003 + Math.sin(P.bob) * 0.012 * gait + (Math.sin(t * 7.3) * Math.sin(t * 3.1)) * 0.0025 * fear) * k;
  camera.rotation.z += (Math.sin(t * 0.71) * 0.004 + Math.sin(t * 0.29 + 1.3) * 0.003 + Math.sin(P.bob * 0.5) * 0.017 * gait + Math.sin(t * 9.1) * 0.003 * fear) * tr * k * 0.6;
  camera.rotation.y += (Math.sin(t * 0.6) * 0.0022 + Math.sin(t * 0.23 + 2.1) * 0.0026 + Math.sin(P.bob * 0.5) * 0.008 * gait) * tr * k * 0.6;
  F.fear = Math.max(0, F.fear - dt * 0.12);
  const want = baseFov + (P.sprinting && walk > 0.5 ? 6 : 0) - F.fear * 5 + (P.mode === 'hide' ? -6 : 0) + fovOff;
  fovNow += (want - fovNow) * Math.min(1, dt * 4);
  if (Math.abs(camera.fov - fovNow) > 0.05) { camera.fov = fovNow; camera.updateProjectionMatrix(); }
}

// ---------- getting caught, and starting over ----------
async function caught(opts = {}) {   // opts.unseen: you are hurt by something you never see
  if (F.dead) return;
  F.dead = true; F.live = false; F.script = false; RUN.deaths++; if (/^n\d+$/.test(F.stage || '')) journal.note(F.stage, 'It found me. I had to start the night over.'); saveRun(); UI.pod(null); UI.clock(null);
  setTimeout(() => { if (F.dead && uiMode !== 'death') { uiMode = 'death'; unlock(); UI.fade(1, 0.05); UI.show('death'); } }, 6000);   // killAll() or a throw drops the awaits below without settling them, so a finally would not run
  killAll(); F.chase = false; F.breathCheck = false; F.echo = false; F.cutscene = true; F.breathUI = false;
  UI.blanket(false); UI.prompt(null); UI.breath(0, false); UI.objective(null); UI.hint(null); UI.stamina(1, false);
  P.mode = 'cine'; P.cam.copy(camera.position);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const cp = P.cam.clone();
  // it lunges from where it actually is when that is in front of you, so it never jumps backward as it gets you
  let dx = fwd.x, dz = fwd.z, d0 = 1.7;
  if (!opts.unseen && E.visible) { const ex = E.root.position.x - cp.x, ez = E.root.position.z - cp.z, d = Math.hypot(ex, ez); if (d > 0.3 && (ex * fwd.x + ez * fwd.z) / d > 0.25) { dx = ex / d; dz = ez / d; d0 = clamp(d, 0.8, 1.7); } }
  if (!opts.unseen) { E.visible = true; E.mode = 'idle'; E.reach = 1; E.lean = 0.12; E.smileScale = 1.3; E.tilt = 0.3; E.lookTarget = camera.position; }
  const place = (d) => { if (opts.unseen) return; E.root.position.set(cp.x + dx * d, cp.y - 2.2, cp.z + dz * d); E.faceTowards(cp.x, cp.z); };
  place(d0);
  sfx.scream(); sfx.jolt(1); shake = 1.4; UI.flash('rgba(255,255,255,0.5)', 0.25);
  await tween(0.3, (k) => place(d0 - k * (d0 - 0.45)), ease.in);
  await wait(0.4);
  UI.fade(1, 0.05);
  E.visible = false; sfx.drone(0, 1); sfx.tension(0, 0.3); sfx.bed('music/chase', 0, 0.3);
  await wait(1.1);
  uiMode = 'death'; unlock(); UI.show('death');
}

function resetNight() {
  vigil.stop(); WF.stop(); FN.reset(E);
  F.dead = false; F.cutscene = false; F.chase = false; F.echo = false; F.breathCheck = false; F.breathUI = false; F.flicker = false;
  F.splashed = false; F.morningReady = false; P.breath = 1; P.stamina = 1; P.exhausted = false; shake = 0;
  carEnd(); F.live = false; F.script = false; F.blackout = false; F.clockGlitch = 0; F.fear = 0; P.pod = null; P.podYaw = HIDE_YAW; UI.pod(null); UI.clock(null); F.flashOn = false; flash.intensity = 0;
  W.tvFx.set(false); W.phone.setRinging(false); W.mirrorFx.hide(); W.curtainSee(false); W.nightLights.forEach((n) => { n.dead = false; }); if (nights) { nights.hunter.reset(); if (dad.fake) { dad.fake = false; sleepers(true); } }
  UI.blanket(false); UI.breath(1, false); UI.hint(null); UI.objective(null);
  E.visible = false; E.reach = 0; E.lean = 0; E.smileScale = 1; E.tilt = 0; E.mode = 'idle';
  W.bathSpot.intensity = 0; sfx.violins(0, 0.3);
}
function retry() {   // you were caught: that night starts again
  UI.hide('death'); uiMode = 'playing'; lock();
  resetNight(); setPhase('night');
  UI.fade(0, 1.5);
  playFrom(F.stage, true);
}
// the pause menu's Restart: the day, night or morning you are on, from its start, without leaving the page (killAll drops whatever was
// playing, as getting caught does)
const BOX_HOME = W.pickups.map((b) => [b.position.clone(), b.rotation.clone()]);
function restartStage() {
  if (F.over || !started) return;
  setPause(false); killAll(); UI.fade(1, 0.05);
  UI.subtitle(null); UI.prompt(null); UI.stamina(1, false); P.vel.set(0, 0, 0);
  sfx.bed('music/chase', 0, 0.3); sfx.tension(0, 0.3);
  if (F.stage === 'day') {   // the boxes go back on the truck and the family back to where the day starts them
    P.carrying = null;
    W.pickups.forEach((b, i) => { if (b.parent !== W.yard) { if (b.parent) b.parent.remove(b); W.yard.add(b); } b.position.copy(BOX_HOME[i][0]); b.rotation.copy(BOX_HOME[i][1]); });
    F.boxes = 0; F.momReady = false; F.talkedMom = false; dadIdx = 0; endChores();
    for (const p of [mom, dad]) { p.held = false; p.talking = false; p.walking = 0; idle(p); }
  }
  if (/^n\d+$/.test(F.stage) && RUN.evidence) {   // a night starts over with the proof it started with: what you found on it goes back
    const n = +F.stage.slice(1), at = RUN.evidenceAt || {};
    RUN.evidence = RUN.evidence.filter((k) => at[k] !== n); for (const k of Object.keys(at)) if (at[k] === n) delete at[k];
    saveRun();
  }
  resetNight();
  playFrom(F.stage, true);
}

// ---------- story ----------
function titleScene() {
  setPhase('title');
  E.visible = true; E.mode = 'idle'; E.root.position.set(5, 0, -16); E.lookTarget = camera.position;
  E.faceTowards(-9, -26);
}

// compile every shader variant (day, night, morning light setups) while the screen is black, so the phase changes later don't hitch
// the loading screen comes back only if this takes long enough to see (a desktop card has them all in well under a second)
async function warmShaders() {
  if (window.__norender) return;   // nothing is drawn, so nothing to build (the tests)
  const el = $('loading');
  const show = setTimeout(() => { el.classList.add('again'); el.classList.remove('done'); LOAD.reset(0.1, 'Waiting for dark'); }, 300);
  mark('warm start'); warming = true;   // nothing is drawn meanwhile: the screen is black and a frame would only slow the driver down
  try { await compileSlices(['day', 'night', 'morning'], (k) => LOAD.set(0.1 + 0.9 * k)); } catch (e) { /* built on first draw */ }
  gfx.applyTextures();   // the people and props that came in after the setting was applied
  try { gfx.warmCine(); mark('conversation look built'); } catch (e) { /* built on its first use */ }
  warming = false; mark('warm done');
  clearTimeout(show); el.classList.add('done');
}
const STAGES = { day: () => dayScript(), n1: () => { journal.night(1, 'poltergeist'); return nights.freeNight(1); }, b1: () => breakfast(1) };
const ORDER = ['day', 'n1', 'b1'];
for (let n = 2; n <= 10; n++) {   // nights two to ten are seeded, free-roaming nights
  STAGES['n' + n] = () => { journal.night(n, n === 10 ? 'finale' : nightTypes(RUN.seed)[n - 2]); return nights.freeNight(n); }; ORDER.push('n' + n);
  if (n < 10) { STAGES['b' + n] = () => breakfast(n); ORDER.push('b' + n); }
}
let playTok = 0;
async function playFrom(stage, resume = false) {
  const t = ++playTok, list = ORDER.slice(ORDER.indexOf(stage));
  for (let i = 0; i < list.length; i++) {
    await STAGES[list[i]](resume && i === 0);
    if (t !== playTok || F.over) return;   // a restart took over, or a bad ending already ended the game
  }
  await endingScript();
}

async function startGame() {
  if (started) return;
  sfx.init(); started = true; uiMode = 'playing';
  UI.hide('title'); lock();
  if (input.scheme === 'touch') { try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not available */ } }
  E.visible = false; E.lookTarget = null;
  UI.fade(1, 0.01);
  mark('start game');
  await warmShaders();
  mark('stage begins');
  if (DEBUG === 'night' || DEBUG === 'night1') { await playFrom('n1'); return; }
  if (DEBUG === 'breakfast') { await playFrom('b1'); return; }
  if (/^n\d+$/.test(DEBUG) || /^night\d+$/.test(DEBUG)) { await playFrom('n' + DEBUG.replace(/\D/g, '')); return; }
  if (/^b[2-9]$/.test(DEBUG)) { await playFrom(DEBUG); return; }   // a morning after a night (#b3), with whatever the saved run holds
  if (DEBUG === 'morning') { await endingScript(); return; }
  if (!DEBUG && hasRun()) { await playFrom('n' + Math.min(RUN.night, 10)); return; }   // the run continues where you died or stopped
  await playFrom('day');
}

// ---------- the family at work: Dad carries boxes in from the truck and unpacks them, Mom unpacks the kitchen ----------
const chore = { run: 0, stop: false, dadHome: false };
const dressing = [];                                    // everything they set down (cleared when the day restarts)
// Dad stands on the truck bed (W.TRUCK.bed up); the next box sits on top of the stack in front of him
const TBED = W.TRUCK ? W.TRUCK.bed : 0.843;
const TRUCK_PICK = new V3(2.35, TBED, -15.25), TRUCK_BOX = new V3(2.35, TBED + 1.16, -15.8), RAMP_FOOT = new V3(2.3, 0, -10.1), PORCH = new V3(3.1, 0, -6.5), DOOR_IN = new V3(3.1, 0, -3.6), DOOR_OUT = new V3(3.1, 0, -5.4);
const LIVING_SPOTS = [new V3(1.92, 0, -3.66), new V3(0.75, 0, -3.77), new V3(1.36, 0, -2.48)];
const KITCHEN_BOX = new V3(2.32, 0, 2.78), DAD_HOME = new V3(2.35, 0, 1.15),   // clear of the table and its chairs
  EVE_MOM = new V3(3.57, 0, 3.16), ARCH = new V3(2.88, 0, -0.54), ARCH_IN = new V3(2.88, 0, 0.97);
// where Mom puts things (the east counter, then the back counter by the corner) and where she stands for each, COUNTER_OFF back from it
const COUNTER_OFF = 0.48, COUNTER_Y = 0.95;
const COUNTER = [
  ...[2.65, 2.99, 3.32, 3.66].map((z) => ({ at: [4.11, COUNTER_Y, z], stand: [4.11 - COUNTER_OFF, z] })),
  ...[3.38, 3.77].map((x) => ({ at: [x, COUNTER_Y, 4.13], stand: [x, 4.13 - COUNTER_OFF] })),
];
const rampY = (x, z) => (z < -14.5 ? TBED : clamp((-10.2 - z) * (TBED / 4.3), 0, TBED)) * clamp(1 - (Math.abs(x - 2.3) - 0.5) / 0.3, 0, 1);   // the ramp (4.3 m, from the sill at z -14.5 to the gravel), then the bed's floor; fades out at the ramp's sides (no step up or down)
const stillOn = (run) => run === chore.run;
// the box truck's headroom (measured on the model): the rolled-up door hangs to 2.93 m just inside the sill, the roof inside is at 3.11.
// how far a person's head has to come down at their spot, checking a stride either side since the head leads the feet when bent
const TRUCK_ROLL = 2.93 - (W.TRUCK ? W.TRUCK.drop : 0), TRUCK_ROOF = 3.11 - (W.TRUCK ? W.TRUCK.drop : 0);   // the rolled-up door and the roof inside, measured before the truck was set down on its tyres
function truckDuck(who) {
  const T = W.TRUCK, g = who.group.position; if (!T || Math.abs(g.x - T.x) > 1.2 || g.z > T.z + 0.5 || g.z < T.z - 4) return 0;
  const ceil = (z) => (z > T.z + 0.02 ? Infinity : z > T.z - 0.48 ? TRUCK_ROLL : TRUCK_ROOF), top = g.y + bodyH(who) * 1.02;
  let need = 0; for (const dz of [-0.35, 0, 0.35]) need = Math.max(need, top - (ceil(g.z + dz) - 0.08));
  return need;
}
function stepSound(g) {   // somebody else's footstep, quieter with distance and panned to where they are
  const d = Math.hypot(P.pos.x - g.x, P.pos.z - g.z); if (d > 14) return;
  const room = roomAt(g.x, g.z, g.y || 0);
  sfx.footstep(0.3 / (1 + d * 0.3), panFor(tmp3.set(g.x, (g.y || 0) + 0.05, g.z)), 0.25, surfaceAt(g.x, g.z, g.y || 0, room));
}
const idle = (who) => { if (who.rig) who.rig.play('idle', { fade: 0.3, speed: 1 }); };
// a chore tween: like tween, but it stands still while who.held (you are talking to them), and carries on after
function htween(who, dur, fn, e = ease.inOut) {
  return new Promise((res) => {
    let k = 0, last = gameTime, held = false; fn(0);
    waiters.push({ res, check: () => {
      const now = gameTime, dt = now - last; last = now;
      if (who.held) { if (!held) { held = true; idle(who); } return false; }
      if (held) { held = false; if (who.walking && who.rig) who.rig.play('walk', { fade: 0.25, speed: who.walking }); }
      k = Math.min(1, k + dt / dur); fn(e(k)); return k >= 1;
    } });
  });
}

async function walkTo(who, pts, speed = 1.25) {
  const run = chore.run, g = who.group.position;
  for (const p of pts) {
    if (!stillOn(run)) return false;
    const x0 = g.x, z0 = g.z, d = Math.hypot(p.x - x0, p.z - z0);
    if (d < 0.03) continue;
    const yaw0 = who.group.rotation.y, want = Math.atan2(p.x - x0, p.z - z0), dur = d / speed, turnT = Math.min(dur, 0.25 + Math.abs(angDiff(yaw0, want)) * 0.3); let stride = 0;   // a turn takes time in proportion to its angle
    if (who.rig) who.rig.play('walk', { fade: 0.25, speed: speed / 1.25 }); who.walking = speed / 1.25;
    await htween(who, dur, (k) => {
      if (!stillOn(run)) return;
      g.x = x0 + (p.x - x0) * k; g.z = z0 + (p.z - z0) * k; g.y = rampY(g.x, g.z);
      if ((stride += speed * 0.0167) > 0.72) { stride = 0; stepSound(g); }
      who.group.rotation.y = lerpAngle(yaw0, want, ease.inOut(Math.min(1, k * dur / turnT)));
    }, ease.lin);
  }
  who.walking = 0;
  if (!stillOn(run)) return false;
  idle(who); return true;
}
function turnToward(who, x, z, dur = 0.45) {
  const y0 = who.group.rotation.y, w = Math.atan2(x - who.group.position.x, z - who.group.position.z);
  return htween(who, dur, (k) => { who.group.rotation.y = lerpAngle(y0, w, k); });
}
// a box with flaps that open, and a few things to take out of it
function openable(b) {
  const h = b.geometry.parameters.height, w = b.geometry.parameters.width, d = b.geometry.parameters.depth, pivots = [];
  for (const s of [-1, 1]) {
    const pv = new THREE.Object3D(); pv.position.set(0, h / 2, s * d / 2); const f = new THREE.Mesh(new THREE.BoxGeometry(w, 0.008, d / 2), b.material);
    f.position.set(0, 0.004, -s * d / 4); f.castShadow = true; pv.add(f); b.add(pv); pivots.push([pv, s]);
  }
  const inner = new THREE.Mesh(new THREE.PlaneGeometry(w - 0.04, d - 0.04), new THREE.MeshStandardMaterial({ color: 0x2a2018, roughness: 1 }));
  inner.rotation.x = -Math.PI / 2; inner.position.y = h / 2 + 0.004; inner.visible = false; b.add(inner);
  return (k) => { inner.visible = k > 0.15; for (const [pv, s] of pivots) pv.rotation.x = s * 2.0 * k; };
}
const thingMats = {};
const mat = (c, r = 0.6) => (thingMats[c + '_' + r] ||= new THREE.MeshStandardMaterial({ color: c, roughness: r }));
function makeThing(kind) {
  const g = new THREE.Group(), add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  if (kind === 'mug') { add(new THREE.CylinderGeometry(0.042, 0.04, 0.09, 14), mat(0xd8d2c2), 0, 0.045, 0); add(new THREE.TorusGeometry(0.03, 0.008, 6, 12), mat(0xd8d2c2), 0.05, 0.05, 0).rotation.y = 0; }
  else if (kind === 'plates') for (let i = 0; i < 3; i++) add(new THREE.CylinderGeometry(0.11, 0.1, 0.018, 18), mat(i % 2 ? 0xe6e1d2 : 0xc9d2d6), 0, 0.01 + i * 0.02, 0);
  else if (kind === 'books') [[0x8a3a32, 0.24, 0.04], [0x3a5a7a, 0.22, 0.035], [0x6a7a4a, 0.2, 0.03]].forEach(([c, w, hh], i) => add(new THREE.BoxGeometry(w, hh, 0.17), mat(c, 0.8), 0.01 * i, 0.02 + i * 0.037, 0).rotation.y = i * 0.2);
  else if (kind === 'lamp') { add(new THREE.CylinderGeometry(0.06, 0.07, 0.04, 14), mat(0x3a2e24), 0, 0.02, 0); add(new THREE.CylinderGeometry(0.014, 0.014, 0.3, 8), mat(0x3a2e24), 0, 0.19, 0); add(new THREE.CylinderGeometry(0.1, 0.16, 0.16, 16, 1, true), new THREE.MeshStandardMaterial({ color: 0xe8dcb4, roughness: 0.9, side: THREE.DoubleSide }), 0, 0.4, 0); }
  else if (kind === 'pot') { add(new THREE.CylinderGeometry(0.1, 0.09, 0.12, 16), mat(0x56595c, 0.4), 0, 0.06, 0); add(new THREE.CylinderGeometry(0.105, 0.105, 0.012, 16), mat(0x56595c, 0.4), 0, 0.126, 0); }
  else if (kind === 'spoon') { add(new THREE.CylinderGeometry(0.008, 0.01, 0.22, 8), mat(0xb08a56, 0.7), 0, -0.07, 0); add(new THREE.SphereGeometry(0.03, 10, 8), mat(0xb08a56, 0.7), 0, -0.19, 0).scale.set(0.8, 0.35, 1.2); }
  else if (kind === 'camera') {   // a gas-station disposable: yellow card wrap, black lens, the flash window and the winder on top
    add(new THREE.BoxGeometry(0.115, 0.062, 0.036), mat(0xe2b52a, 0.55), 0, 0.031, 0);
    add(new THREE.BoxGeometry(0.117, 0.03, 0.038), mat(0x1c1c1e, 0.5), 0, 0.016, 0);
    add(new THREE.CylinderGeometry(0.015, 0.017, 0.012, 16), mat(0x101012, 0.25), 0.012, 0.034, 0.022).rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.03, 0.016, 0.004), mat(0xf2efe6, 0.2), -0.035, 0.048, 0.019);
    add(new THREE.CylinderGeometry(0.009, 0.009, 0.008, 12), mat(0x2a2a2a, 0.6), 0.04, 0.066, -0.006);
  }
  else { add(new THREE.BoxGeometry(0.16, 0.12, 0.12), mat(0xb98a5a, 0.8), 0, 0.06, 0); }
  return g;
}
const bodyH = (who) => who.group.userData.h || 1.75;
const bscale = (who) => bodyH(who) / 1.75;              // the distances below are written for a 1.75 m body
const palmAt = (who, side) => who.rig ? who.palm(side, new V3()) : who.group.localToWorld(new V3(side === 'L' ? 0.25 : -0.25, 0.9, 0.2));
const facing = (who) => { const y = who.group.rotation.y; return { fwd: new V3(Math.sin(y), 0, Math.cos(y)), left: new V3(Math.cos(y), 0, -Math.sin(y)) }; };
// how a thing sits in a hand that holds it from above: its origin `down` below the palm (its height), and how far the fingers close on it
const HOLD = { mug: { down: 0.09, grip: 0.7 }, plates: { down: 0.065, grip: 0.45 }, books: { down: 0.13, grip: 0.5 }, pot: { down: 0.135, grip: 0.55 }, crate: { down: 0.12, grip: 0.5 } };
const kneeling = { kneel: 1, lean: 1.1 };               // down on one knee over a box on the floor
const bodyMix = (a, b, k) => ({ lean: lerp(a.lean || 0, b.lean || 0, k), kneel: lerp(a.kneel || 0, b.kneel || 0, k), squat: lerp(a.squat || 0, b.squat || 0, k) });
const boxTop = (box) => box.position.y + box.geometry.parameters.height / 2;
// a hand's place on the near rim of a box (s = 1 toward who's left corner, -1 the right); the box stands square to who
function rim(who, box, s) {
  const { fwd, left } = facing(who), p = box.geometry.parameters, r = box.position.clone(); r.y = boxTop(box) + 0.01;
  return r.addScaledVector(fwd, -(p.depth / 2 - 0.03)).addScaledVector(left, s * (p.width / 2 - 0.1));
}
const onRim = (who, box, s) => ({ reach: rim(who, box, s), palm: 'down', grip: 0.5 });
// a box against the chest: its back face just off the shirt (the chest and the vest come about 0.2 m forward at that height), the elbows bent
const carryPos = (who, box) => new V3(0, 1.05 * bscale(who), 0.21 * bscale(who) + (box && box.geometry.parameters ? box.geometry.parameters.depth / 2 : 0.23) + 0.01);

// take the box that sits at `at` (its centre, in the scene) in both hands and bring it to the chest; the hands land on its sides first, then it moves with them
async function liftBox(who, box, at, lean = 0.25) {
  const run = chore.run, hw = box.geometry.parameters.width;
  if (box.parent !== scene) scene.attach(box);
  box.position.copy(at); box.rotation.set(0, who.group.rotation.y, 0); box.visible = true;
  who.pose = { hold: box, holdW: hw, lean };
  await htween(who, 0.5, () => {});
  if (!stillOn(run)) return false;
  who.group.attach(box); const p0 = box.position.clone(), p1 = carryPos(who, box); box.rotation.set(0, 0, 0);
  await htween(who, 0.8, (k) => { if (!stillOn(run)) return; box.position.lerpVectors(p0, p1, k); who.pose = { hold: box, holdW: hw, lean: lean * (1 - k) }; });
  if (!stillOn(run)) return false;
  who.pose = { hold: box, holdW: hw }; sfx.thump(0.4);
  return true;
}
// kneel and set the carried box on the floor at spot (straight ahead), the hands sliding up to its top edges as it goes down; who stays kneeling over it
async function setDown(who, box, spot) {
  const run = chore.run, hw = box.geometry.parameters.width, p0 = box.position.clone(), end = who.group.worldToLocal(spot.clone()); end.y = box.geometry.parameters.height / 2;
  await htween(who, 1.3, (k) => { if (!stillOn(run)) return; who.pose = { hold: box, holdW: hw, holdY: lerp(-0.03, 0.12, k), kneel: k, lean: kneeling.lean * k }; box.position.lerpVectors(p0, end, k); });
  if (!stillOn(run)) return false;
  scene.attach(box); box.position.set(spot.x, end.y, spot.z); box.rotation.set(0, who.group.rotation.y, 0); sfx.thump();
  W.colliders.push({ minX: spot.x - 0.3, maxX: spot.x + 0.3, minZ: spot.z - 0.3, maxZ: spot.z + 0.3, on: true, dressing: true });
  who.pose = { ...kneeling, hold: box, holdW: hw, holdY: 0.12 };
  return true;
}
// up from a kneel or a squat, the hands coming off whatever they were on
async function rise(who, from = kneeling) {
  const run = chore.run;
  await htween(who, 0.8, (k) => { if (stillOn(run)) who.pose = bodyMix(from, {}, k); });
  if (stillOn(run)) who.pose = null;
}
// one hand goes into the open box and comes out holding a new thing of this kind, lifted clear of the rim; `other` is the free hand's spec, `body` the lean/kneel
async function takeOut(who, box, kind, side, other, body) {
  const run = chore.run, hs = HOLD[kind] || HOLD.crate, { fwd } = facing(who), top = boxTop(box);
  const inside = box.position.clone().addScaledVector(fwd, -0.04); inside.y = top - 0.06;
  const over = box.position.clone().addScaledVector(fwd, -0.12); over.y = top + 0.2;
  const hand = (p, grip) => ({ ...body, ...other, [side]: { reach: p, palm: 'down', grip } });
  const from = palmAt(who, side);
  await htween(who, 0.55, (k) => { if (stillOn(run)) who.pose = hand(from.clone().lerp(inside, k), 0.3); });
  if (!stillOn(run)) return null;
  const th = makeThing(kind); scene.add(th); dressing.push(th); who.grab(th, side, { down: hs.down });   // it was in the box; now it is in the hand
  await htween(who, 0.45, (k) => { if (stillOn(run)) who.pose = hand(inside.clone().lerp(over, k), hs.grip); });
  return stillOn(run) ? th : null;
}
// the thing in this hand goes down onto `dest` (a point on a floor or a counter) and is let go there, with a short settle; the body eases from body0 to body1 on the way
async function putDown(who, th, kind, dest, side, other, body0, body1 = body0) {
  const run = chore.run, hs = HOLD[kind] || HOLD.crate, from = palmAt(who, side), landing = dest.clone(); landing.y += hs.down + 0.01;
  const hand = (p, body, grip) => ({ ...body, ...other, [side]: { reach: p, palm: 'down', grip } });
  await htween(who, 0.7, (k) => { if (!stillOn(run)) return; const p = from.clone().lerp(landing, k); p.y += Math.sin(k * Math.PI) * 0.06; who.pose = hand(p, bodyMix(body0, body1, k), hs.grip); });
  if (!stillOn(run)) return false;
  scene.attach(th); const p0 = th.position.clone(), q0 = th.quaternion.clone(), q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, who.group.rotation.y + (Math.random() - 0.5) * 0.6, 0));
  await htween(who, 0.15, (k) => { if (!stillOn(run)) return; th.position.lerpVectors(p0, dest, k); th.quaternion.slerpQuaternions(q0, q1, k); who.pose = hand(landing, body1, hs.grip * (1 - 0.6 * k)); });
  if (!stillOn(run)) return false;
  th.position.copy(dest); th.quaternion.copy(q1); sfx.thump(0.3);
  return true;
}
// kneeling over a box on the floor with both hands on its top edges: open it and take the things out one by one, each set down on the floor beside it
async function unpackFloor(who, box, kinds) {
  const run = chore.run, open = box.userData.open || (box.userData.open = openable(box)), bs = bscale(who);
  await htween(who, 0.7, (k) => { if (stillOn(run)) { open(k); who.pose = { ...kneeling, L: onRim(who, box, 1), R: onRim(who, box, -1) }; } });
  for (let i = 0; i < kinds.length; i++) {
    if (!stillOn(run)) return false;
    const side = i % 2 ? 'L' : 'R', sg = side === 'L' ? 1 : -1, other = { [side === 'L' ? 'R' : 'L']: onRim(who, box, -sg) };
    const dest = who.group.localToWorld(new V3(sg * 0.46 * bs, 0, 0.42 * bs)); dest.y = who.group.position.y;
    const th = await takeOut(who, box, kinds[i], side, other, kneeling);
    if (!th) return false;
    if (!(await putDown(who, th, kinds[i], dest, side, other, kneeling, { kneel: 1, lean: 1.3 }))) return false;
  }
  await rise(who);
  return stillOn(run);
}

async function dadChores() {
  const run = chore.run, g = dad.group.position;
  dad.busy = true;
  for (let i = 0; stillOn(run) && !chore.stop && i < LIVING_SPOTS.length; i++) {
    const spot = LIVING_SPOTS[i], box = W.cardboardBox(0, 0, 0, 0.46, 0.4, 0.46, i % 4, 0, scene); box.visible = false; dressing.push(box);
    if (!(await walkTo(dad, i === 0 ? [RAMP_FOOT, TRUCK_PICK] : [DOOR_IN, DOOR_OUT, PORCH, RAMP_FOOT, TRUCK_PICK]))) return;   // back out through the front door, never through the wall
    await turnToward(dad, g.x, g.z - 1);
    if (!(await liftBox(dad, box, TRUCK_BOX))) return;   // the next box, off the top of the stack
    if (!(await walkTo(dad, [new V3(2.3, 0, -13.3), RAMP_FOOT, PORCH, DOOR_OUT, DOOR_IN, new V3(spot.x, 0, spot.z + 0.8 * bscale(dad))], 1.15))) return;
    await turnToward(dad, spot.x, spot.z);
    if (!(await setDown(dad, box, spot))) return;
    if (chore.stop) { await rise(dad); break; }   // this one stays packed: he is wanted in the kitchen
    const kinds = [['books', 'mug'], ['plates', 'books'], ['crate', 'books']][i % 3];   // nothing taller than the box is 0.4 m deep
    if (!(await unpackFloor(dad, box, kinds))) return;
    if (chore.stop) break;
  }
  if (!stillOn(run)) return;
  if (!(await walkTo(dad, [new V3(g.x, 0, Math.max(g.z, -3.6)), ARCH, ARCH_IN, DAD_HOME]))) return;
  await turnToward(dad, 0.6, 1.6, 0.6);
  chore.dadHome = true;
}
async function momChores() {
  const run = chore.run;
  mom.busy = true;
  const bs = bscale(mom), box = W.cardboardBox(KITCHEN_BOX.x, 0, KITCHEN_BOX.z, 0.55, 0.42, 0.5, 0, Math.PI / 2, scene); dressing.push(box);   // square to her: she comes at it from the west
  W.colliders.push({ minX: KITCHEN_BOX.x - 0.3, maxX: KITCHEN_BOX.x + 0.3, minZ: KITCHEN_BOX.z - 0.3, maxZ: KITCHEN_BOX.z + 0.3, on: true, dressing: true });
  const open = openable(box); box.userData.open = open;
  const things = ['plates', 'mug', 'pot', 'mug', 'plates', 'mug'];
  const stand = new V3(KITCHEN_BOX.x - 0.66 * bs, 0, KITCHEN_BOX.z), carry = new V3(-0.2 * bs, 0.95 * bs, 0.3 * bs);   // where she kneels at the box; where a thing rides in her right hand
  // down on one knee at the box, both hands to its rim
  const kneelAt = async (dur) => {
    await turnToward(mom, box.position.x, box.position.z, 0.4);
    await htween(mom, dur, (k) => { if (stillOn(run)) mom.pose = { ...bodyMix({}, kneeling, k), L: onRim(mom, box, 1), R: onRim(mom, box, -1) }; });
  };
  if (!(await walkTo(mom, [stand]))) return;
  await kneelAt(1.0);
  await htween(mom, 0.6, (k) => { if (stillOn(run)) open(k); });
  for (let i = 0; i < things.length && stillOn(run); i++) {
    const { at: [cx, cy, cz], stand: [sx, sz] } = COUNTER[i], kind = things[i], hs = HOLD[kind];
    const th = await takeOut(mom, box, kind, 'R', { L: onRim(mom, box, 1) }, kneeling);
    if (!th) return;
    // up on her feet with it, then to the counter
    const from = palmAt(mom, 'R');
    await htween(mom, 0.8, (k) => { if (stillOn(run)) mom.pose = { ...bodyMix(kneeling, {}, k), R: { reach: from.clone().lerp(mom.group.localToWorld(carry.clone()), k), palm: 'down', grip: hs.grip } }; });
    if (!stillOn(run)) return;
    mom.pose = { R: { reachLocal: carry, palm: 'down', grip: hs.grip } };
    if (!(await walkTo(mom, [new V3(sx, 0, sz)], 1.1))) return;
    await turnToward(mom, cx, cz, 0.4);
    if (!(await putDown(mom, th, kind, new V3(cx, cy, cz), 'R', {}, {}, { lean: 0.3 }))) return;
    mom.pose = null;
    if (i < things.length - 1) { if (!(await walkTo(mom, [stand]))) return; await kneelAt(0.8); }
  }
  while (stillOn(run)) {   // wipe the counter until the chores are cancelled
    const t0 = gameTime;
    if (!(await walkTo(mom, [EVE_MOM]))) return;
    await turnToward(mom, 2.8, 2.25, 0.4);
    while (stillOn(run)) { const t = gameTime - t0; mom.pose = { lean: 0.3, R: { reach: new V3(4.04, 0.96, 3.16 + Math.sin(t * 2.2) * 0.3), palm: 'down', grip: 0.4 } }; await wait(0.03); if (t > 30) break; }
  }
}
function startChores() {
  chore.run++; chore.stop = false; chore.dadHome = false;
  for (const o of dressing) { if (o.parent) o.parent.remove(o); } dressing.length = 0;
  for (let i = W.colliders.length - 1; i >= 0; i--) if (W.colliders[i].dressing) W.colliders.splice(i, 1);
  for (const p of [mom, dad]) { p.busy = false; p.pose = null; }
  dadChores(); momChores();
}
function endChores() {
  chore.run++;
  for (const p of [mom, dad]) { p.busy = false; p.pose = null; }
}

async function dayScript() {
  F.stage = 'day'; setPhase('day');
  P.pos.set(3.1, 0, -9.0); P.yaw = Math.PI; P.pitch = 0.02; P.mode = 'walk';
  mom.group.position.set(1.77, 0, 2.43); mom.group.rotation.y = -Math.PI / 2;
  dad.group.position.set(4.3, 0, -13.4); dad.group.rotation.y = -0.5;
  await wait(0.3);
  UI.fade(0, 2.5); UI.card('Saturday', 'Moving day', 3.5);
  F.birds = true;
  await wait(2.6);
  speak('dad/welcome');
  startChores();
  UI.objective('Carry your boxes to your room <span>0 / 3</span>');
  UI.hint(`<b>${L('move')}</b> move &nbsp;·&nbsp; <b>${L('sprint')}</b> sprint &nbsp;·&nbsp; <b>${L('interact')}</b> interact`, 8);
  dayStrange();
  await waitFor(() => F.boxes >= 3);
  chore.stop = true;   // Dad finishes the box he is carrying, then walks to the kitchen on his own
  await wait(0.8);
  UI.subtitle(FN.box.mesh.visible ? "<i>That's three. ...There are four.</i>" : "<i>That's the last one.</i>", 3.5);
  UI.objective('Find Mom in the kitchen');
  F.momReady = true;
  await waitFor(() => F.talkedMom);
  if (!chore.dadHome) UI.hint('Dad is still carrying his box in', 4);
  await waitFor(() => chore.dadHome);
  endChores();
  F.cutscene = true; P.vel.set(0, 0, 0);
  faceParent(mom);
  UI.objective(null);
  F.talkCam = true;   // the view follows whoever is talking
  await say('mom/helper');
  if (FN.box.mesh.visible) { await say('you/box4'); await say('dad/box4'); }
  await cameraGift(); await say('mom/landlord'); await say('dad/cheap'); await say('dad/leftovers'); await say('mom/teeth');
  UI.fade(1, 2.5); await wait(3);
  F.talkCam = false; F.birds = false; F.cutscene = false; endChores();
  FN.box.hide(); box4Col.on = false;   // Dad carries it out to the road after dinner
  RUN.dayDone = true; saveRun();
}
// the day's own wrongness, alongside the chores: the dog under your window, a fourth box in your room that nobody carried in, and pencil
// marks on the side of your closet. Nothing here is announced; it is there if you look
const BOX4 = new V3(10.02, 0, 3.05), box4Col = { minX: BOX4.x - 0.27, maxX: BOX4.x + 0.27, minZ: BOX4.z - 0.27, maxZ: BOX4.z + 0.27, on: false, dressing: true };
W.colliders.push(box4Col);
function placeBox4() { FN.box.place(BOX4.x, BOX4.z, Math.PI - 0.35); box4Col.on = true; }
addI({ obj: FN.box.mesh, r: 2.2, label: 'Look in the box', when: () => FN.box.mesh.visible && !F.box4Seen && (F.phase === 'day' || F.phase === 'morning') && P.mode === 'walk', act: async () => {
  F.box4Seen = true; sfx.pick('cloth', { gain: 0.3, wet: 0.05 }) || sfx.thump();
  UI.subtitle('<i>A drawing in crayon. A bunk bed, and something very tall standing beside it.</i>', 4.5);
  await wait(4.6); UI.subtitle('<i>Under the drawing is your school picture. The one Mom keeps in her wallet.</i>', 5);
  journal.note('n1', 'There was a box in my room with my name on it. Not one of ours. My school picture was in it.');
} });
addI({ obj: FN.marks.mesh, r: 1.9, label: 'Look at the pencil marks', when: () => FN.marks.mesh.visible && P.mode === 'walk' && F.phase !== 'title', act: async () => {
  if (F.marksSeen) { UI.subtitle('<i>BEN 5. BEN 6. BEN 7.</i>', 2.5); return; }
  F.marksSeen = true; UI.subtitle('<i>Pencil marks on the side of the closet, the way you measure a kid. BEN 5. BEN 6. BEN 7.</i>', 5);
  await wait(5.1); UI.subtitle('<i>Nothing after seven.</i>', 3); sfx.creak(0.1, 0.4, 0.6);
} });
async function dayStrange() {
  FN.marks.place();
  // the neighbour's dog, right under your window: it goes for the house, then stops dead in the middle of a bark and backs off
  (async () => {
    await waitFor(() => (F.boxes >= 1 && P.carrying && roomAt(P.pos.x, P.pos.z) === 'bed') || F.boxes >= 2 || F.stage !== 'day');
    if (F.stage !== 'day') return;
    const w = W.windows.filter((x) => x.pane).map((x) => ({ x, p: x.pane.getWorldPosition(new V3()) })).find((o) => roomAt(o.p.x, o.p.z) === 'bed' || roomAt(o.p.x - 0.3, o.p.z) === 'bed' || roomAt(o.p.x, o.p.z + 0.3) === 'bed');
    const at = w ? w.p.clone() : new V3(10.8, 0, 3.0), out = w ? (w.x.alongX ? new V3(0, 0, -w.x.inside) : new V3(-w.x.inside, 0, 0)) : new V3(1, 0, 0);
    at.addScaledVector(out, 2.6); at.y = 0.45;
    await wait(0.6);
    let d = sfx.pick('dog_far', { at, gain: 1.1, wet: 0.05, ref: 2.5 }) || 2;
    await wait(d * 0.95);
    d = sfx.pick('dog_far', { at, gain: 1.15, wet: 0.05, ref: 2.5, dur: 1.15 }) || 1;   // cut off
    await wait(d + 2.2);
    at.addScaledVector(out, 12); sfx.pick('dog_far', { at, gain: 0.22, wet: 0.2, dur: 0.5, rate: 1.15 });   // far off, going
  })();
  // the fourth box: put down while you are out of the room, after your second
  await waitFor(() => F.boxes >= 2 || F.stage !== 'day');
  await waitFor(() => F.stage !== 'day' || roomAt(P.pos.x, P.pos.z) !== 'bed');
  if (F.stage === 'day' && F.boxes < 3) placeBox4();
}
// Mom's move-in present: a disposable camera from the gas station. She holds it out until you take it (or after a while
// puts it in your hand anyway); from then on it is yours (RUN.hasCamera)
async function cameraGift() {
  const bm = bscale(mom), cam = makeThing('camera'); scene.add(cam); cam.visible = false;
  const said = say('mom/gift_a');
  await wait(1.3);
  mom.pose = KPOSE.gift(bm);
  await wait(0.7);
  mom.grab(cam, 'R', GRIP.camera); cam.visible = true; cam.scale.setScalar(0.01);
  await tween(0.25, (k) => cam.scale.setScalar(Math.max(0.01, k)), ease.out);
  await said;
  F.giftTaken = false; F.cutscene = false; P.vel.set(0, 0, 0);
  const it = { obj: cam, r: 2.4, label: 'Take the camera', when: () => F.phase === 'day' && !F.giftTaken, act: () => { F.giftTaken = true; } };
  interacts.push(it); UI.objective('Take the camera');
  const t0 = gameTime; await waitFor(() => F.giftTaken || gameTime - t0 > 14);
  interacts.splice(interacts.indexOf(it), 1); UI.objective(null);
  F.giftTaken = true; F.cutscene = true; P.vel.set(0, 0, 0);
  if (cam.parent) cam.parent.remove(cam); mom.pose = null; sfx.click();
  RUN.hasCamera = true; saveRun();
  journal.night(1, 'poltergeist'); journal.note('n1', 'Mom gave me a camera from the gas station. 24 pictures.');
  hands.raiseCamera();
  await say('you/gift');
  later(0.6, () => hands.lowerCamera());
  await say('dad/gift'); await say('mom/gift_b');
}
function faceParent(who) {
  who.head.getWorldPosition(tmp);
  const y0 = P.yaw, want = Math.atan2(-(tmp.x - P.pos.x), -(tmp.z - P.pos.z));
  tween(0.8, (k) => { P.yaw = lerpAngle(y0, want, k); P.pitch = lerp(P.pitch, 0.18, k); });
}

// ---------- the mornings: you wake up, walk to the table and sit down, and they talk to you; you look wherever you like ----------
// (lookAtPerson turns the view for the finale, which still frames its own shots)
function lookAtPerson(who, dur = 0.75) {
  who.head.getWorldPosition(tmp);
  const cx = P.pos.x, cz = P.pos.z, y0 = P.yaw, p0 = P.pitch;
  const want = Math.atan2(-(tmp.x - cx), -(tmp.z - cz)), up = Math.atan2(tmp.y - EYE, Math.hypot(tmp.x - cx, tmp.z - cz));
  const over = angDiff(y0, want) * 0.12;   // overshoots a touch and settles
  return tween(dur, (k) => { P.yaw = y0 + angDiff(y0, want) * k + over * Math.sin(k * Math.PI) * 0.6; P.pitch = lerp(p0, clamp(up, -0.3, 0.45), k); }, ease.inOut);
}
// the morning talk: you are in your chair and look wherever you like; they look at whoever is talking (talkGaze) and at you. Stand up in
// the middle of it and they stop, and Mom asks you to sit back down
async function conversation(lines) {
  for (const step of lines) {
    await seated();
    if (typeof step === 'function') { await step(); continue; }
    const [who, key] = step, id = `${who}/${key}`;
    await say(id); await wait(who === 'you' ? 0.25 : 0.35);
  }
}
let askedToSit = 0;
async function seated() {
  if (P.mode === 'seat') return;
  await wait(1.2);
  if (P.mode !== 'seat' && gameTime - askedToSit > 12) { askedToSit = gameTime; await say('mom/sit'); }
  await waitFor(() => P.mode === 'seat' && seat && !seat.tween);
  await wait(0.6);
}
// a day talk: they stop whatever they are doing and turn to you; the camera stays where you stand and settles on their face
async function talkTo(p, id) {
  if (p.talking) return;
  F.cutscene = true; P.vel.set(0, 0, 0); p.held = true; p.talking = true;
  const y0 = P.yaw, p0 = P.pitch;
  await tween(0.5, (k) => {
    p.head.getWorldPosition(tmp);
    const want = Math.atan2(-(tmp.x - P.pos.x), -(tmp.z - P.pos.z)), up = Math.atan2(tmp.y - EYE, Math.hypot(tmp.x - P.pos.x, tmp.z - P.pos.z));
    P.yaw = lerpAngle(y0, want, k); P.pitch = lerp(p0, clamp(up, -0.35, 0.4), k);
  }, ease.out);
  await say(id);
  p.held = false; p.talking = false; F.cutscene = false;
}
const MORN = {
  1: [['you', 'm1_a'], ['mom', 'm1_a'], ['you', 'm1_b'], ['dad', 'm1_a'], ['mom', 'm1_b']],
  2: [['you', 'm2_a'], ['mom', 'm2_a'], ['dad', 'm2_a'], ['mom', 'm2_b']],
  3: [['you', 'm3_a'], ['mom', 'm3_a'], ['dad', 'm3_a']],
  4: [['mom', 'm4_a'], ['dad', 'm4_a'], ['you', 'm4_a'], ['mom', 'm4_b']],
  5: [['dad', 'm5_a'], ['mom', 'm5_a'], ['dad', 'm5_b'], ['mom', 'm5_b']],
  6: [['mom', 'm6_a'], ['dad', 'm6_a'], ['mom', 'm6_b']],
  7: [['dad', 'm7_a'], ['you', 'm7_a'], ['mom', 'm7_a'], ['dad', 'm7_b']],
  8: [['mom', 'm8_a'], ['dad', 'm8_a'], ['mom', 'm8_b']],
  9: [['mom', 'm9_a'], ['dad', 'm9_a'], ['you', 'm9_a'], ['mom', 'm9_b']],
};
const TYPE_LINE = { thirst: ['mom', 't_thirst'], ring: ['dad', 't_ring'], static: ['dad', 't_static'], mimic: ['mom', 't_mimic'], blackout: ['dad', 't_blackout'], hunted: ['mom', 't_hunted'], paralysis: ['mom', 't_paralysis'], teddy: ['mom', 't_teddy'], parents: ['mom', 't_parents'], quiet: ['dad', 't_quiet'], car: ['mom', 't_car'] };
// the kitchen in the morning: Mom stirs a pan on the stove with a wooden spoon, her other hand on the counter; Dad stands at the
// sink with his coffee and takes a sip now and then. Both stop and turn when the talk starts; the mug stays in Dad's hand.
const kitchen = { run: 0, things: [] };
// where they stand and what their hands do (the contact audit in tests/contacts.js runs these same poses)
const KSPOT = { mom: [3.62, 2.16, Math.PI / 2], dad: [1.98, 3.62, Math.PI] };   // Mom a hand's width from the stove front, the pot on the burner by her right hand
// how each thing sits in a hand (grab's offsets): the spoon's handle against the palm, the mug's side in the hand (not the hand in the
// mug), the camera held out by its end, the fingers round it
const GRIP = { spoon: { down: 0.03, out: 0.02 }, mug: { down: 0.045, out: 0.085 }, camera: { down: 0.03, out: 0.075 } };
const KPOSE = {
  // the spoon goes round the pan, a slow oval at burner height, with a pause and a tap on the rim every few rounds
  // (the spoon's bowl in the brass pot on the right back burner; the other arm down at her side)
  stir: (t) => { const ph = t * 2.4, round = Math.floor(ph / (Math.PI * 2)) % 4 === 3, k = round ? 0.2 : 1;
    return { lean: 0.25, R: { reachLocal: new V3(-0.15 + Math.cos(ph) * 0.045 * k, 1.3 + (round ? 0.04 : 0), 0.67 + Math.sin(ph) * 0.035 * k), palm: 'down', grip: 0.75 } }; },
  sip: (lift, bd) => ({ R: { reachLocal: new V3(lerp(-0.1, -0.05, lift) * bd, lerp(1.08, 1.4, lift) * bd, lerp(0.34, 0.25, lift) * bd), palm: 'in', grip: 0.7 } }),
  mugLow: (bd) => ({ R: { reachLocal: new V3(-0.07 * bd, 1.0 * bd, 0.3 * bd), palm: 'in', grip: 0.7 }, L: { reachLocal: new V3(0.125 * bd, 0.98 * bd, 0.3 * bd), palm: 'in', grip: 0.5 } }),
  gift: (bm) => ({ R: { reachLocal: new V3(0.08 * bm, 1.08 * bm, 0.48 * bm), palm: 'in', grip: 0.5 } }),
};
function kitchenLife() {
  const run = ++kitchen.run, t0 = gameTime, on = () => kitchen.run === run && F.stage.startsWith('b');
  for (const o of kitchen.things) if (o.parent) o.parent.remove(o); kitchen.things.length = 0;
  const spoon = makeThing('spoon'), mug = makeThing('mug'); scene.add(spoon, mug); kitchen.things.push(spoon, mug);
  mom.grab(spoon, 'R', GRIP.spoon); dad.grab(mug, 'R', GRIP.mug);
  mom.busy = dad.busy = true; kitchen.talking = false;
  let sipAt = 3 + Math.random() * 4, sip = 0;
  const loop = async () => {
    while (on()) {
      const t = gameTime - t0, bm = bscale(mom), bd = bscale(dad);
      if (!kitchen.talking) {
        // the spoon goes round the pan, a slow oval at burner height, with a pause and a tap on the rim every few rounds
        mom.pose = KPOSE.stir(t);
        // the mug rests at his chest; a sip lifts it to his mouth for a second
        if (t > sipAt && sip === 0) { sip = 1e-3; sipAt = t + 7 + Math.random() * 6; }
        let lift = 0;
        if (sip > 0) { sip += 0.016; const d = 2.2; lift = sip < 0.5 ? sip / 0.5 : sip < 1.5 ? 1 : Math.max(0, 1 - (sip - 1.5) / 0.6); if (sip > d) sip = 0; lift = lift * lift * (3 - 2 * lift); }
        dad.pose = KPOSE.sip(lift, bd);
      } else {
        // turned to you: the spoon is down on the counter, the mug held low in both hands
        if (spoon.parent !== scene) { scene.attach(spoon); spoon.position.copy(mom.group.localToWorld(new V3(0.1 * bm, 0.95 * bm, 0.5 * bm))); spoon.rotation.set(0, mom.group.rotation.y + 0.4, 0); }
        if (kitchen.seated) {   // at the table: the mug is down past his right hand (clear of where his hands rest and talk) and both have their hands free
          if (mug.parent !== scene) { scene.attach(mug); mug.position.copy(dad.group.localToWorld(new V3(-0.32, 0, 0.56))); mug.position.y = kitchen.tableY; mug.rotation.set(0, dad.group.rotation.y, 0); spoon.visible = false; }
          for (const p of [mom, dad]) if (!p.pose || !p.pose.sit) p.pose = { sit: 1, seat: p.seatAt || 0.46 };   // (seatOn set it, with where the hands rest)
        } else {
          mom.pose = null;
          dad.pose = KPOSE.mugLow(bd);
        }
      }
      await wait(0.03);
    }
    if (kitchen.run === run) { mom.pose = dad.pose = null; for (const o of kitchen.things) if (o.parent) o.parent.remove(o); kitchen.things.length = 0; }
  };
  loop();
}
async function breakfast(n) {
  F.stage = 'b' + n; setPhase('morning'); resetNight();
  E.visible = false; F.chase = false;
  toBunk(); P.yaw = HIDE_YAW + 0.15; P.pitch = -0.12;
  sleepers(false); mom.group.visible = dad.group.visible = true; mom.busy = dad.busy = false;
  W.chairs.forEach((c, i) => W.moveChair(i, c.x, c.z, c.rot));   // the table as it should be, whatever the night did to it
  kitchenLife(); seatThem();   // they are already at the table when you come down
  if (n === 1) placeBox4();   // Dad put it out by the road last night. It is back by your bed
  F.birds = true;
  UI.card('6:58 AM', n === 1 ? 'Morning' : `Morning ${n}`, 3.5);
  await wait(2.2); UI.fade(0, 3); await wait(2.4);
  UI.subtitle(n === 1 ? '<i>You hardly slept.</i>' : n < 6 ? '<i>You did not sleep at all.</i>' : '<i>You are so tired it feels like a fever.</i>', 3.5);
  UI.objective('Breakfast');
  F.morningReady = true; F.breakfastWait = true;
  // Mom's face and arms follow how the run has gone: brushed off, then uneasy, then scared
  { const reg = REG(nights ? nights.proof.count() : 0); mom.mood = reg === 'high' || n >= 6 ? 'scared' : reg === 'mid' || n >= 3 ? 'uneasy' : null; }
  const murmur = kitchenMurmur();
  await waitFor(() => P.mode === 'seat' && seat && !seat.tween);
  murmur.stop(); UI.objective(null);
  await wait(0.9);
  const lines = [...(MORN[n] || MORN[3])];
  const tl = n >= 2 && nights && TYPE_LINE[nights.plan(n).type]; if (tl) lines.push(tl);
  const fresh = nights ? nights.proof.on(n) : []; if (fresh.length) lines.unshift(() => photoBeat(fresh));   // the photos first, then the usual talk
  await conversation(lines);
  await wait(1.2);
  UI.fade(1, 2.5); await wait(3);
  F.birds = false; F.cutscene = false; F.morningReady = false; F.breakfastWait = false;
  if (P.mode === 'seat') { P.mode = 'walk'; seat = null; }
  kitchen.run++; kitchen.seated = false; mom.pose = dad.pose = null; mom.mood = null; mom.sitNow = dad.sitNow = 0; for (const o of kitchen.things) if (o.parent) o.parent.remove(o); kitchen.things.length = 0;
  mom.group.visible = dad.group.visible = false;
}
// your chair: the east one, nearest the hall. Mom sits on your left and Dad on your right
const MY_CHAIR = 1;
let seat = null;   // while you are in your chair: { yaw (facing the table), tween (sitting down) }
function tableMid() { const C = W.chairs || []; return C.reduce((a, c) => a.add(c.holder.getWorldPosition(new V3())), new V3()).multiplyScalar(1 / Math.max(1, C.length)); }
function seatThem() {
  const C = (W.chairs || []).map((c, i) => ({ i, p: c.holder.getWorldPosition(new V3()) }));
  if (C.length < 3) return;
  const mid = tableMid(), mine = C[MY_CHAIR] || C[0];
  const dir = (c) => Math.atan2(c.p.x - mid.x, c.p.z - mid.z), side = (c) => Math.abs(Math.abs(angDiff(dir(mine), dir(c))) - Math.PI / 2);
  const [a, b] = C.filter((c) => c !== mine).sort((x, y) => side(x) - side(y));
  const toward = new V3(mid.x - mine.p.x, 0, mid.z - mine.p.z).normalize(), leftOf = (c) => new V3(c.p.x - mine.p.x, 0, c.p.z - mine.p.z).cross(toward).y > 0;
  const [mc, dc] = leftOf(a) ? [a, b] : [b, a];
  kitchen.talking = true; kitchen.seated = true; kitchen.tableY = topAt(mid.x, mid.z) ?? 0.78; mom.busy = dad.busy = false;
  seatOn(mom, mc.i, mid); seatOn(dad, dc.i, mid);
}
// sitting down: the view lowers into the chair at a kid's seated eye height, facing the table; nothing else moves
addI({ p: new V3(1.99, 0.75, 2.08), r: 2.3, label: 'Sit', when: () => F.breakfastWait && F.phase === 'morning', act: sitInChair });
function sitSpot() {
  const c = W.chairs[MY_CHAIR], p = c.holder.getWorldPosition(new V3()), mid = tableMid(), t = new V3(mid.x - p.x, 0, mid.z - p.z).normalize();
  return { eye: new V3(p.x + t.x * 0.04, seatHeight(c) + 0.62, p.z + t.z * 0.04), yaw: Math.atan2(-t.x, -t.z), back: new V3(p.x - t.x * 0.55, 0, p.z - t.z * 0.55) };
}
async function sitInChair() {
  if (P.mode !== 'walk') return;
  const s0 = sitSpot(), from = camera.position.clone(), y0 = P.yaw, p0 = P.pitch;
  seat = { yaw: s0.yaw, tween: true, back: s0.back }; P.vel.set(0, 0, 0); P.cam.copy(from); P.mode = 'seat';
  sfx.scrape(panFor(tmp.set(s0.eye.x, 0.4, s0.eye.z))); later(0.6, () => sfx.creak(0.12, 0, 0));
  await tween(0.9, (k) => { P.cam.lerpVectors(from, s0.eye, k); P.cam.y = lerp(from.y, s0.eye.y, k) - Math.sin(k * Math.PI) * 0.04; P.yaw = lerpAngle(y0, s0.yaw, k * 0.85); P.pitch = lerp(p0, -0.12, k); }, ease.inOut);
  P.pos.set(s0.eye.x, 0, s0.eye.z); seat.tween = false;
}
function standUp() {
  if (P.mode !== 'seat' || !seat) return;
  P.pos.copy(seat.back); P.mode = 'walk'; seat = null; sfx.scrape(panFor(tmp.set(P.pos.x, 0.4, P.pos.z)));
}
// before you sit down, the two of them talk under their breath at the table, heads together; it stops when you come in
function kitchenMurmur() {
  let on = true;
  (async () => {
    let turn = 0;
    while (on && F.breakfastWait) {
      await wait(2.5 + Math.random() * 3);
      if (!on || !F.breakfastWait) break;
      const near = Math.hypot(P.pos.x - 1.18, P.pos.z - 2.08) < 2.6; if (near) continue;
      const who = turn++ % 2 ? dad : mom, other = who === mom ? dad : mom, d = 1.6 + Math.random() * 1.6;
      const env = sfx.mumble(who === mom ? 'mom' : 'dad', d, { gain: 0.3, pan: panFor(who.head.getWorldPosition(tmp)) });
      who.talk(env, { to: other === mom ? 'mom' : 'dad', mood: 'uneasy' });
      talkNow.who = who === mom ? 'mom' : 'dad'; talkNow.to = other === mom ? 'mom' : 'dad'; talkNow.until = gameTime + d;
    }
  })();
  return { stop() { on = false; talkNow.until = 0; } };
}
// sit who on chair i, facing `toward` (the table's middle): the hips over the back half of the seat, at the seat's own height (found by
// dropping a ray onto the chair), so the thighs lie along it and the knees clear its front edge
const seatRay = new THREE.Raycaster(); seatRay.camera = camera;   // (sprites in the scene need a camera to be tested)
const shown = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
function seatHeight(c) {
  const p = c.holder.getWorldPosition(new V3());
  seatRay.set(new V3(p.x, 0.8, p.z), new V3(0, -1, 0)); seatRay.far = 0.8;
  const hit = seatRay.intersectObject(c.holder, true).find((h) => h.point.y > 0.3 && h.point.y < 0.7);
  return hit ? hit.point.y : 0.46;
}
// the height of a table (or any top a hand can rest on, 0.55..0.9 m) straight down at x, z, or null: solid, visible meshes only (not the
// dust in the air, not a person or what they hold, not the hidden collision boxes)
function topAt(x, z) {
  scene.updateMatrixWorld();   // (things moved this frame, a chair put back, are not where the ray would look yet)
  seatRay.set(new V3(x, 1.2, z), new V3(0, -1, 0)); seatRay.far = 0.7;
  const people = (o) => { for (let n = o; n; n = n.parent) if (n === mom.group || n === dad.group) return true; return false; };
  const hit = seatRay.intersectObjects(scene.children, true).find((h) => h.object.isMesh && !h.object.isSkinnedMesh && !h.object.isInstancedMesh && shown(h.object) && !people(h.object) && h.point.y > 0.55 && h.point.y < 0.9);
  return hit ? hit.point.y : null;
}
function seatOn(who, i, toward) {
  const c = W.chairs[i];
  const p = c.holder.getWorldPosition(new V3()), r = Math.atan2(toward.x - p.x, toward.z - p.z);
  who.group.position.set(p.x - Math.sin(r) * 0.07, 0, p.z - Math.cos(r) * 0.07); who.group.rotation.set(0, r, 0);
  who.seatAt = seatHeight(c);
  // the hands on the table when it is in reach: the first top found straight down in front of them, the hands just past its edge
  let rest = null;
  for (let d = 0.14; d <= 0.62 && !rest; d += 0.03) {
    const y0 = topAt(who.group.position.x + Math.sin(r) * d, who.group.position.z + Math.cos(r) * d);
    if (y0 !== null) { const s = bscale(who), y = y0 + 0.06, f = d + 0.01; rest = { L: new V3(0.12 * s, y, f), R: new V3(-0.12 * s, y, f), edge: d - 0.03 }; }   // (edge: how far in front of them the top begins)
  }
  // leaning in to the table (the more, the further its edge), so the hands reach the top with the elbows bent, not the arms out straight
  who.pose = { sit: 1, seat: who.seatAt, rest, lean: rest ? Math.min(0.26, 0.12 + Math.max(0, rest.L.z - 0.3) * 1.2) : 0 }; who.sitNow = 1;
}
// last night's photos go on the table one at a time; you say what each one is, and one of them answers. How they take it depends on how much
// there has been in the whole run: brushed off, then uneasy, then scared (the same thresholds the ending uses, never shown)
const REG = (c) => (c < 3 ? 'low' : c < 7 ? 'mid' : 'high');
async function photoBeat(ids) {
  ids = ids.slice(-4); const total = nights.proof.count();
  UI.subtitle('<i>You put the photos on the table.</i>', 2.6); await wait(1.4);
  for (const [i, id] of ids.entries()) {
    UI.tablePhoto(nights.proof.photo(id), nights.proof.cap(id), i); sfx.click(); await wait(0.7);
    await say(`<b>You:</b> ${nights.proof.tell(id)}`); await wait(0.25);
    const reg = REG(total - (ids.length - 1 - i)), who = (i + kitchen.run) % 2 ? 'dad' : 'mom', ab = Math.floor(i / 2) % 2 ? 'b' : 'a';
    await say(`${who}/ph_${reg}_${ab}`); await wait(0.35);
    if (i < ids.length - 1) await seated();
  }
  await wait(0.4); UI.tablePhoto(null);
}

// ---------- the car: the road-trip dream, and driving away at the end ----------
function carParents(on) {
  if (on) {
    car.group.add(dad.group, mom.group);
    dad.group.position.set(0.98, -0.45, -0.42); mom.group.position.set(0.98, -0.34, 0.42);
    for (const p of [dad, mom]) { p.group.rotation.order = 'XYZ'; p.group.rotation.set(0, Math.PI / 2, 0); p.group.visible = true; p.busy = true; p.inCar = true; p.sleeping = false; p.lookAt = null; if (p.rig) p.rig.play('idle', { fade: 0, speed: 0.5 }); }
    dad.pose = { reach: new V3() };   // both hands on the wheel (updated every frame)
  } else {
    scene.add(dad.group, mom.group);
    for (const p of [dad, mom]) { p.inCar = false; p.busy = false; p.pose = null; }
  }
}
function carEnd() {
  if (!car.group.visible && !dad.inCar) return;
  car.show(false); car.speed = 0; car.steer = 0; car.openGlove(0); car.brake = false; F.carPrompt = null; carParents(false);
  sfx.engine(0, 0); sfx.radio(0, 0); E.root.scale.setScalar(1); E.reach = 0;
  if (P.mode === 'car') P.mode = 'cine';
}
function carDriveIn(opts) {
  car.road = !!opts.road; car.place(opts.x, opts.z, opts.heading); car.speed = opts.speed || 0; car.brake = false; car.steer = 0; car.openGlove(0);
  car.layoutTraffic(opts.traffic || 'cruise'); car.setSeat('back'); car.drawMirror(false); car.show(true); car.apply();
  carParents(true); P.mode = 'car'; P.yaw = opts.yaw || 0; P.pitch = -0.05; P.roll = 0;
}
// the car dream: a daytime drive in the back seat, then the front seats empty while the car keeps going
async function carDream() {
  F.script = true; F.cutscene = true; UI.hint(null); UI.objective(null); UI.prompt(null); UI.pod(null); UI.blanket(false); flash.intensity = 0; F.flashOn = false; P.pod = null;
  sfx.violins(0, 1); sfx.drone(0, 2); sfx.dread(0, 2); sfx.tension(0, 1);
  UI.flash('rgba(255,255,255,1)', 2.4); await wait(0.9);
  setPhase('day', true); scene.fog = new THREE.FogExp2(0xcdd9e6, 0.017); sfx.bed('music/moving_day', 0.22, 2);
  carDriveIn({ road: true, x: -70, z: -28.8, heading: 0, speed: 11, traffic: 'cruise' });
  sfx.engine(1, 0.7); sfx.radio(1, 0);
  F.cutscene = false; UI.card('Saturday', 'Going to the store', 3.5);
  await wait(4.5); await say('mom/car_a'); await wait(1.4); await say('dad/car_a'); await wait(3.5);
  await say('mom/car_b'); await wait(0.5); await say('dad/car_b'); await wait(2.5);
  await say('you/car_a'); await wait(0.8); await say('mom/car_c'); await wait(1.5);
  // the traffic thickens
  car.trafficMode = 'jam'; car.brake = true; sfx.honk(-0.4);
  await tween(4, (k) => { car.speed = lerp(11, 1.6, k); sfx.engine(1, 0.15 + 0.4 * (1 - k)); });
  await say('dad/car_c'); sfx.honk(0.5); await wait(0.8); sfx.honk(-0.6);
  await tween(3, (k) => { car.speed = lerp(1.6, 0, k); scene.fog.density = lerp(0.017, 0.03, k); W.sun.intensity = lerp(3.0, 1.6, k); });
  await say('mom/car_d'); sfx.radio(0.7, 0.25);
  await wait(4); sfx.radio(0.6, 0.6); sfx.honk(0.2); await wait(2.5);
  // blink: the seats are empty and the car is moving
  UI.fade(1, 0.12); sfx.thump(); await wait(0.5);
  mom.group.visible = dad.group.visible = false;
  car.trafficMode = 'cruise'; car.brake = false; car.speed = 8; sfx.engine(1, 0.55); sfx.radio(0.5, 0.45); W.sun.intensity = 1.1; scene.fog.density = 0.034;
  UI.fade(0, 0.15); sfx.violins(0.5, 4); sfx.drone(0.08, 3); F.fear = 0.8;
  tween(60, (k) => { car.steer = Math.sin(k * 40) * 0.25; }, ease.lin);
  await wait(4);
  sfx.whisper(0.2, 0.2);
  const t0 = gameTime; let opened = false, climbed = false;
  F.carPrompt = { label: 'Climb into the front seat', act: async () => {
    F.carPrompt = null; F.cutscene = true; const from = car.eye.clone(), to = new V3(0.82, 1.02, 0.42);
    sfx.creak(0.3, 0.3); await tween(1.4, (k) => { car.eye.lerpVectors(from, to, k); P.pitch = lerp(P.pitch, -0.35, k * 0.1); }); car.setSeat('front'); F.cutscene = false; climbed = true; sfx.drone(0.14, 2); F.fear = 1;
    F.carPrompt = { label: 'Open the glove box', act: async () => {
      F.carPrompt = null; F.cutscene = true; opened = true; sfx.stab();
      await tween(0.7, (k) => car.openGlove(k * 0.95)); sfx.creak(0.5, 0.3); await wait(0.7);
      // it comes out of there
      E.visible = true; E.mode = 'idle'; E.lookTarget = camera.position; E.smileScale = 1.4; E.tilt = 0.3; E.reach = 1;
      const base = new V3(1.8, 0.72, 0.5).applyMatrix4(car.group.matrixWorld), eye = camera.position.clone();
      sfx.jolt(1.2); shake = 1;
      await tween(0.7, (k) => { E.root.scale.setScalar(0.1 + k * 0.9); E.root.position.lerpVectors(base, new V3(eye.x, 0.1, eye.z).lerp(base, 0.35), k); E.root.position.y = lerp(base.y - 0.2, 0, k); E.faceTowards(eye.x, eye.z, 1); }, ease.in);
      E.root.scale.setScalar(1); caught();
    } };
  } };
  // the glove box knocks on its own, and you can wait it out
  while (!opened && gameTime - t0 < 85) {
    await wait(9 + Math.random() * 5); if (opened || P.mode !== 'car') break;
    if (climbed) { sfx.knock(0.3, 0.4); car.openGlove(0.05); await wait(0.15); car.openGlove(0); F.fear = Math.max(F.fear, 0.7); }
  }
  if (opened || F.dead) return;
  // you did not open it: the car slows in the fog and Mom calls you from outside
  F.carPrompt = null; F.cutscene = true; sfx.radio(0.3, 0.8);
  await tween(6, (k) => { car.speed = lerp(8, 0, k); sfx.engine(1 - k * 0.8, 0.5 * (1 - k)); scene.fog.density = lerp(0.034, 0.06, k); });
  await wait(1.5); sfx.engine(0, 0); sfx.radio(0, 0); sfx.violins(0, 2); await wait(1.5);
  await say('mom/car_e'); UI.flash('rgba(255,255,255,1)', 2.6); await wait(1.2);
  carEnd(); setPhase('night'); toBunk(); UI.fade(0, 0.1); sfx.dread(0.3, 3);
  F.cutscene = false; F.script = false; if (nights) { F.clock = Math.max(F.clock, 352); }
}
// the last morning: they drive you away from the house, and something stands on the porch
async function carLeaving() {
  F.script = true; F.cutscene = true; UI.fade(1, 1.2); await wait(1.4);
  setPhase('morning', true); scene.fog = new THREE.FogExp2(0xe8d9c2, 0.026);
  sleepers(false); E.visible = false; flash.intensity = 0; nlMult(0, false);
  carDriveIn({ road: false, x: 2.3, z: -9, heading: Math.PI / 2, speed: 0, traffic: 'cruise', yaw: 0 });
  car.trafficMode = 'cruise'; for (const t of car.traffic) t.active = false; car.show(true);
  sfx.engine(1, 0.35); sfx.radio(0, 0);
  UI.fade(0, 2); await wait(1.5); F.cutscene = false;
  // from the back seat, looking back through the rear window
  P.yaw = Math.PI * 0.95; P.pitch = 0.02;
  E.visible = true; E.mode = 'idle'; E.root.position.set(3.1, 0, -5.6); E.root.rotation.y = Math.PI; E.lookTarget = camera.position; E.tilt = 0.4; E.smileScale = 1.25;
  await tween(7, (k) => { car.speed = lerp(0, 7, ease.inOut(k)); sfx.engine(1, 0.2 + k * 0.4); });
  await wait(2.5); E.reach = 0.6;
  await wait(5); UI.fade(1, 3); await wait(3.4);
  carEnd(); E.visible = false;
}

// ---------- night ten: the thing stands at the end of the hall, and this time they see it too ----------
// what you found decides the end: under 3 nobody comes, 3 to 6 they come and it takes them, 7 or more they believe you and you leave
const finaleFor = (proof) => (proof < 3 ? 'ENDING_ALONE' : proof < 7 ? 'ENDING_TAKEN' : 'ENDING_BELIEVED');
async function finaleScene() {
  const end = finaleFor(proofCount());
  F.script = true; F.cutscene = true; UI.objective(null); UI.hint(null); UI.prompt(null);
  if (nights) nights.hunter.dismiss();
  UI.pod(null); UI.blanket(false); P.pod = null; flash.intensity = 0; F.flashOn = false; F.breathCheck = false; F.breathUI = false;
  sfx.violins(0.3, 2); sfx.tension(0.05, 2); sfx.hush(4);
  P.mode = 'cine'; const from = camera.position.clone(), y0 = P.yaw, p0 = P.pitch;
  P.cam.copy(from);
  await tween(2.6, (k) => { P.cam.set(lerp(from.x, 8.96, k), lerp(from.y, EYE, k), lerp(from.z, -0.42, k)); P.yaw = lerpAngle(y0, Math.PI / 2, k); P.pitch = lerp(p0, 0.02, k); });
  P.pos.set(8.96, 0, -0.42);
  // at the far end of the hall, lit from behind by the living room, standing very still
  W.setDoor('kid', true, true); W.setDoor('bath', true, true);
  E.visible = true; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0.3; E.smileScale = 1; E.lookTarget = camera.position;
  E.root.position.set(5.48, 0, -0.42); E.root.rotation.y = Math.PI / 2; W.bathSpot.intensity = BATH_I * 0.8; F.flicker = true;
  sfx.stab(); sfx.violins(1, 0.5); shake = 0.5;
  await wait(3.2);
  // it comes down the hall, slowly
  E.mode = 'walk'; E.speed = 0.55; { const x0 = 5.48; let st = 0; await tween(7, (k) => { E.root.position.x = lerp(x0, 7.07, k); st += 0.03; if (st > 1.1) { st = 0; sfx.heavyStep(0.9, panFor(E.root.position)); } shake = Math.max(shake, 0.12 + k * 0.3); }, ease.lin); }
  E.mode = 'idle'; sfx.giggle(panFor(E.root.position)); await wait(1.6);
  await say('you/f_a'); sfx.scream(); UI.flash('rgba(255,255,255,0.55)', 0.4); shake = 1;
  if (end === 'ENDING_ALONE') { await finaleNeverBelieved(); return true; }
  // their door bangs open and they are standing in the mouth of the hall, behind it
  W.setDoor('parents', true); sfx.slamFar(0.5); sleepers(false);
  mom.group.visible = dad.group.visible = true; mom.busy = dad.busy = true; mom.lookAt = dad.lookAt = null;
  dad.group.position.set(3.7, 0, -0.6); dad.group.rotation.y = Math.PI / 2; mom.group.position.set(3.25, 0, -0.2); mom.group.rotation.y = Math.PI / 2;
  await wait(0.4);
  await Promise.all([lookAtPerson(dad, 0.9), say('dad/f_a')]);
  sfx.scream(); await Promise.all([lookAtPerson(mom, 0.5), say('mom/f_a')]);
  if (end === 'ENDING_BELIEVED') return finaleBelieved();
  return finaleGruesome();
}
// how much proof the run has (#proof=N stands in for it, to reach each ending)
const proofCount = () => (HPARAM.proof !== undefined ? +HPARAM.proof : (RUN.evidence || []).length);
// the believed ending: they see it and get you out; the night ends here and endingScript() plays the morning drive
async function finaleBelieved() {
  UI.subtitle('<i>Dad pulls you behind him. Mom has your arm. Nobody lets go.</i>', 4.5); shake = 0.6;
  await tween(2.5, (k) => { E.root.position.x = lerp(5.2, 4.6, k); E.tilt = 0.3 + k * 0.4; }, ease.inOut);
  sfx.violins(0, 2.5); sfx.tension(0, 2); F.flicker = false; await wait(1.5);
  E.visible = false; W.bathSpot.intensity = 0; nlMult(1, false);
  UI.subtitle('<i>Then the hall is empty. Nobody goes back to bed.</i>', 4); await wait(3);
  UI.fade(1, 2.5); await wait(3);
  F.script = false; F.cutscene = false;
  return false;
}

// the last night, the bad ways: it takes them (Dad, then Mom), or nobody ever believes you
const CRACK = () => { sfx.tone({ type: 'square', f: 1800, f2: 600, dur: 0.06, gain: 0.5, wet: 0.1 }); sfx.noiseHit({ dur: 0.08, type: 'highpass', f: 2500, gain: 0.8, wet: 0.1 }); };
const CHEW = () => { sfx.noiseHit({ dur: 0.18, type: 'lowpass', f: 500, gain: 0.7, wet: 0.05 }); sfx.tone({ f: 80, f2: 40, dur: 0.2, gain: 0.5, wet: 0.1 }); };
async function takeThem(p) {
  const x0 = p.group.position.x, z0 = p.group.position.z;
  E.visible = true; E.mode = 'idle'; E.root.position.set(x0 - 0.75, 0, z0); E.faceTowards(x0, z0);
  p.busy = true; p.lookAt = null;
  sfx.scream();
  await tween(0.9, (k) => { p.group.position.y = -0.8 * k; p.group.rotation.x = -0.9 * k; E.reach = k; shake = 0.4 * k; }, ease.in);
  for (let i = 0; i < 4; i++) { sfx.thump(); CRACK(); await wait(0.22); }
  sfx.scream();
  for (let i = 0; i < 4; i++) { CHEW(); await wait(0.3); }
  p.group.visible = false;
}
async function finaleGruesome() {
  E.reach = 1; E.smileScale = 1.45; E.tilt = 0.6; shake = 0.6;
  await takeThem(dad); await wait(0.6); await takeThem(mom);
  UI.flash('rgba(120,0,0,0.9)', 1.2); shake = 1.2; E.visible = false; sfx.drone(0, 1); sfx.tension(0, 1);
  await wait(1.2);
  await endGame('ENDING_TAKEN');
  return true;
}
async function finaleNeverBelieved() {
  UI.subtitle("<i>Their door stays shut. Nobody is coming.</i>", 4); await wait(4);
  E.visible = true; E.mode = 'idle'; E.root.position.set(8.81, 0, 2.43); E.faceTowards(8.28, 4.0);
  E.reach = 0.5; E.smileScale = 1.6; E.tilt = 0.4; sfx.stab(); shake = 1; await wait(2);
  sfx.scream(); UI.flash('rgba(255,255,255,0.6)', 0.4); await wait(1.5);
  await endGame('ENDING_ALONE');
}
// the night ends badly: the picture goes black and the end screen comes up
async function endGame(id) {
  F.over = true; F.cutscene = true; F.script = true; F.live = false; UI.objective(null); UI.hint(null); UI.prompt(null); UI.clock(null);
  UI.fade(1, 2.5); await wait(3);
  endScreen(id);
}

// after the last night they take you away from the house
async function endingScript() {
  F.over = true; UI.fade(1, 2); await wait(2.5);
  await carLeaving();
  UI.card('7:12 AM', 'They believed you', 4.5);
  await wait(5);
  endScreen('ENDING_BELIEVED');
}

// the end screen: each ending's own title and closing line, the seed and the proof found; the run is cleared
const ENDINGS = {
  ENDING_ALONE: ['They never believed you.', 'Their door stayed shut. By morning the top bunk was empty.'],
  ENDING_TAKEN: ['They saw it.', 'Then it had them. The farmhouse is up for rent again.'],
  ENDING_BELIEVED: ['They believed you.', 'Nobody went back for the rest of your things.'],
};
function endScreen(id) {
  const [title, line] = ENDINGS[id];
  $('endtitle').textContent = title; $('endtitle').classList.toggle('red', id !== 'ENDING_BELIEVED'); $('endtag').textContent = line;
  $('endinfo').textContent = `Seed ${RUN.seed}  ·  photos ${proofCount()} / ${nights.proof.total}`;
  uiMode = 'end'; unlock(); UI.show('end'); achievements.ending(id);
  store.remove('topbunk.run');
}

// ---------- per-frame ----------
let birdT = 1, ambT = 14;
function update(dt) {
  gameTime += dt;
  runTimers();

  if (input.lookX || input.lookY) lookBy(-input.lookX * 2.7 * dt, -input.lookY * 2.0 * dt);
  input.setBreathVisible(F.breathUI && !F.dead);
  vigil.update(dt);
  input.setCoverVisible(P.mode === 'bunk' && !F.cutscene && !F.dead && !F.breathUI && F.live);
  if (shake > 0.25) input.rumble(shake * 0.55, shake * 0.4, 140);
  if (P.mode === 'walk' && !F.cutscene && !F.dead) movePlayer(dt);
  else { P.vel.set(0, 0, 0); P.speed = 0; P.sprinting = false; UI.stamina(1, false); }
  updateCamera(dt);
  updateInteract();
  if (F.live && !F.dead && nights) {
    nights.tick(dt);
    // from the bunk, the breath key pulls the covers over your head
    const dn = !!keys.Space || input.breath;
    if (P.mode === 'bunk' && !F.cutscene) {
      coverHold = dn ? coverHold + dt : 0;
      if (dn && coverHold >= 0.3 && canBunkCover()) hideUnderCovers();
    } else coverHold = 0;
  }

  // echo footsteps behind you
  for (let i = echoes.length - 1; i >= 0; i--) {
    if (gameTime >= echoes[i]) { echoes.splice(i, 1); if (F.echo) sfx.footstep(0.2, panFor(tmp.set(P.pos.x + 6, 1, P.pos.z)), 0.6); }
  }

  // breath / hiding
  if (P.mode !== 'hide' || F.dead) { breathLatch = false; breathPrev = false; }
  if (P.mode === 'hide' && !F.dead) {
    // hold the key to hold your breath, or tap it once to keep holding (tap again to let go)
    const down = !!keys.Space || input.breath, now = performance.now();
    if (down && !breathPrev) breathDownAt = now;
    if (!down && breathPrev && now - breathDownAt < 300) breathLatch = !breathLatch;
    breathPrev = down;
    const holding = down || breathLatch;
    // holding only costs breath while it is close enough to hear you, or standing at your hiding place (a full meter outlasts its longest stay)
    const near = F.breathCheck || (nights && nights.hunter.busy && nights.hunter.state === 'search' && nights.hunter.gap() < 5);
    if (holding) P.breath -= dt / (F.breathCheck ? 11 : near ? 8.5 : 30); else P.breath = Math.min(1, P.breath + dt / 2.2);
    if (F.breathCheck) {
      if (holding) F.grace = Math.max(F.grace, 0.45); else F.grace -= dt;
      if (F.grace <= 0 || P.breath <= 0) {
        if (F.breathTeach) {
          // the first night: it hears you. everything stops, something scratches the bed frame, and the hint comes back; you live
          sfx.gasp(); sfx.scratch(0); sfx.creak(0.6, 0); shake = Math.max(shake, 0.6); F.fear = 1;
          UI.hint(`It heard you. Hold <b>${L('breath')}</b>`, 4);
          F.grace = 2.4; P.breath = Math.max(P.breath, 0.6);
        } else { sfx.gasp(); caught(); }
      }
    }
    if (!holding) { P.breathT -= dt; if (P.breathT <= 0) { sfx.breath(P.inhale, E.visible ? 0.14 : 0.08); P.inhale = !P.inhale; P.breathT = 1.25; } }
    if (E.visible && !F.chase) { P.hb = (P.hb ?? 0) - dt; if (P.hb <= 0) { sfx.heartbeat(0.6); P.hb = 0.42; } }
  }
  UI.breath(P.breath, F.breathUI && !F.dead, P.breath < 0.3);

  if (nlBase > 0 && !F.flicker) nlMult(nlBase * (0.93 + 0.07 * Math.sin(gameTime * 0.9)));
  // light flicker
  if (F.flicker) {
    if (W.bathSpot.intensity > 0) W.bathSpot.intensity = flicker('bath', BATH_I * (0.82 + Math.sin(gameTime * 23) * 0.08 + (Math.random() < 0.03 ? -0.7 : 0)), BATH_I * 0.82);
    nlMult(flicker('nl', Math.random() < 0.15 ? 0 : 0.25, 0.25), false);
  }

  // ambience
  if (F.birds) { birdT -= dt; if (birdT <= 0) { sfx.chirp((Math.random() - 0.5) * 1.6); birdT = 0.5 + Math.random() * 2.4; } }
  if (F.phase === 'night' && !F.live && !F.chase && !F.echo && !F.dead && P.mode !== 'hide') {
    ambT -= dt;
    if (ambT <= 0) {   // the house does more every night
      ambT = (12 + Math.random() * 14) / (0.6 + 0.4 * F.night); const r = Math.random(), pan = (Math.random() - 0.5) * 1.6;
      if (r < 0.4) sfx.creak(0.18, pan); else if (r < 0.6) sfx.knock(pan * 0.6, 0.12); else if (F.night >= 2 && r < 0.8) sfx.ceilingThump(); else if (F.night >= 2) sfx.slamFar(pan); else sfx.creak(0.2, pan);
    }
  }

  // family idle
  if (mom.group.visible) {
    mom.duck = truckDuck(mom); dad.duck = truckDuck(dad);
    talkGaze();
    mom.update(gameTime, dt); dad.update(gameTime, dt);
    for (const p of [mom, dad]) {
      if (p.sleeping || p.inCar) continue;
      const g = p.group.position, near = Math.hypot(P.pos.x - g.x, P.pos.z - g.z) < 4.5;
      p.lookAt = p.gaze || (p.gazeAt ? p.gazeAt.getWorldPosition(p._gv || (p._gv = new V3())) : null) || (near ? camera.position : null);
      if (near && (!p.busy || p.talking) && !(p.sitNow > 0.05)) {   // not while sitting: the chair does not turn with them
        let want = Math.atan2(P.pos.x - g.x, P.pos.z - g.z);
        if (p.turnTo) want = lerpAngle(want, Math.atan2(p.turnTo.x - g.x, p.turnTo.z - g.z), p.turnK);   // partly toward whoever they are talking with
        p.group.rotation.y = lerpAngle(p.group.rotation.y, want, Math.min(1, dt * (p.talking ? 5 : 3)));
      }
    }
  }
  cineTick(dt); FN.tick(dt);
  W.tick(dt); W.tvFx.tick(dt); W.phone.tick(gameTime); W.bedSleepers.update(dt); lights.update(dt);
  if (car.group.visible) { car.update(dt); if (dad.inCar && dad.pose) car.wheelG.getWorldPosition(dad.pose.reach); }
  WF.update(dt); dust.update(dt);
  { const room = roomAt(P.pos.x, P.pos.z, P.pos.y); weather.update(dt, room !== 'out' && room !== 'stoop', F.phase === 'night' || F.phase === 'title'); }
  traffic.update(dt, car.group.visible ? 'off' : F.phase); W.streetLight.tick(dt, camera.position, sfx); W.clock.tick(dt, camera, sfx);
  sfx.listen(camera); hearRoom(dt);
  E.update(dt, gfx.quality); applyDetail();
  UI.crosshair(P.mode === 'walk' && !F.cutscene);
  achievements.tick();
  if (nights) nights.proof.hud(F.live && !F.dead && !F.script);   // not over a scripted scene: the vigil, the drive, a scare
}

// the conversations' look (gfx.js): on while the view follows a talk, at breakfast and in the scripted scenes, and aimed at whoever speaks
// (or the nearest parent in front of you); it stays on for a moment after, so the gap between two lines does not drop it
let cineHold = 0;
const cineFocus = new V3(), cineTo = new V3();
function cineTick(dt) {
  const talking = !!talkNow.who && gameTime < talkNow.until;
  const want = !F.dead && (F.talkCam || (F.cutscene && talking) || (P.mode === 'cine' && (F.script || /^b\d/.test(F.stage || ''))));
  cineHold = want ? 0.8 : Math.max(0, cineHold - dt);
  let focus = null;
  if (cineHold > 0) {
    const sp = talking ? (talkNow.who === 'mom' ? mom : dad) : null;
    if (sp && sp.group.visible) focus = sp.head.getWorldPosition(cineFocus);
    else {
      let best = 4; camera.getWorldDirection(cineTo);
      for (const p of [mom, dad]) {
        if (!p.group.visible || p.sleeping) continue;
        const h = p.head.getWorldPosition(tmp), d = h.distanceTo(camera.position);
        if (d < best && h.clone().sub(camera.position).normalize().dot(cineTo) > 0.75) { best = d; focus = cineFocus.copy(h); }
      }
    }
  }
  gfx.setCine(cineHold > 0, focus);
  // the soft shadow on the floor under each of them
  for (const p of [mom, dad]) if (p.blob) p.blob.visible = p.group.visible && !p.sleeping && !p.inCar;
}

// the Graphics page's settings the frame reads: how much grass, how much rain, how far you can see
let fogObj = null, fogBase = 0, fogK = -1, detailN = 0;
const detail = { grass: -1, rain: -1, far: -1 };
function applyDetail() {
  const g = gfx.grass;
  if (g !== detail.grass || detailN++ % 60 === 0) {   // the lawn grows in after load, so its cells are looked at again now and then
    detail.grass = g; W.lawn.share = g;
    W.lawn.group.traverse((o) => { if (o.isInstancedMesh && o.visible !== g > 0) o.visible = g > 0; });
  }
  const rk = gfx.rain; if (rk !== detail.rain) { detail.rain = rk; weather.density(rk); }
  const d = gfx.draw;
  if (d.far !== detail.far) { detail.far = d.far; camera.far = d.far; camera.updateProjectionMatrix(); }
  if (scene.fog && scene.fog === fogObj && d.fog !== fogK) { fogK = d.fog; scene.fog.density = fogBase * d.fog; }
}
// the frame cap and the counter (Graphics page); the display's own refresh rate, measured from the frames the browser hands out
const fps = { el: null, n: 0, t: 0, lastDraw: 0, iv: [], hz: 0 };
function refreshHz() { return fps.hz; }
function fpsCount(now) {
  if (fps.iv.length < 120 && fps.prev) { fps.iv.push(now - fps.prev); if (fps.iv.length === 120) { const m = [...fps.iv].sort((a, b) => a - b)[60]; fps.hz = Math.round(1000 / m); } }
  fps.prev = now;
  const on = !!gfx.personal.counter;
  if (!fps.el && on) { fps.el = document.createElement('div'); fps.el.id = 'fps'; document.body.appendChild(fps.el); }
  if (fps.el) fps.el.hidden = !on;
  if (!on) return;
  fps.n++; if (now - fps.t >= 500) { fps.el.textContent = `${Math.round(fps.n * 1000 / (now - fps.t))} fps`; fps.n = 0; fps.t = now; }
}
let breathLatch = false, breathPrev = false, breathDownAt = 0, nights = null;
let last = performance.now(), titleT = 0, frameN = 0;
function loop(now) {
  requestAnimationFrame(loop);
  // the frame cap: a frame comes only once its share of a second has passed (the browser never gives more than the display's refresh)
  const cap = gfx.personal.cap;
  if (cap > 0 && now - fps.lastDraw < 1000 / cap - 1.5) return;
  fps.lastDraw = now; fpsCount(now);
  input.poll();
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (started) { if (!paused && !window.__freeze) update(dt); }
  else {
    gfx.setCine(false);
    titleT += dt;
    camera.position.set(-6 + Math.sin(titleT * 0.05) * 3, 2.0 + Math.sin(titleT * 0.3) * 0.05, -22 + Math.cos(titleT * 0.05) * 2);
    camera.lookAt(1, 1.6, -4);
    E.update(dt, gfx.quality); applyDetail();
    weather.update(dt, false, true); traffic.update(dt, 'title'); W.streetLight.tick(dt, camera.position, sfx); W.clock.tick(dt, camera, null); lights.update(dt);
  }
  // the shadow maps are re-rendered only when something can have changed: the sun and moon every third frame (the people move slowly), the
  // bathroom spot only while it is lit, the headlights only while the car passes (see windowface.js)
  frameN++; W.sun.shadow.autoUpdate = false; W.bathSpot.shadow.autoUpdate = false;
  if (frameN % 3 === 0) W.sun.shadow.needsUpdate = true;
  if (W.bathSpot.intensity > 0) W.bathSpot.shadow.needsUpdate = true;
  handsTick(dt);
  if (!window.__norender && booted && !warming) {
    gfx.render(dt);
    // the hands over the frame: the depth is cleared first, so a wall right in front of you never cuts through them
    if (hands.visible()) {
      const ac = renderer.autoClear; renderer.autoClear = false; renderer.setRenderTarget(null); renderer.clearDepth();
      // in a conversation the hands stay inside the letterbox, under the bars like the rest of the picture
      const bar = Math.round((gfx.barsNow ? gfx.barsNow() : 0) * innerHeight);
      if (bar > 0) { renderer.setScissor(0, bar, innerWidth, innerHeight - 2 * bar); renderer.setScissorTest(true); }
      renderer.render(hands.scene, camera);
      if (bar > 0) renderer.setScissorTest(false);
      renderer.autoClear = ac;
    }
  }
}
let wasFake = false;
// the disposable camera is the kid's once Mom has given it to him (RUN.hasCamera); older saves, and any night from the second on, have it
function hasCamera() { return RUN.hasCamera !== false || (RUN.night || 1) >= 2; }
function handsTick(dt) {
  if (started && nights && F.live) {
    if (P.mode === 'hide' && P.pod && nights.hunter.busy && nights.hunter.state === 'search') journal.learn('still');
    if (wasFake && !dad.fake) journal.learn('dad'); wasFake = !!dad.fake;
  }
  const holding = P.mode === 'hide' && (!!keys.Space || input.breath || breathLatch);
  const hidden = !started || paused || F.cutscene || F.dead || P.mode === 'cine' || P.mode === 'car' || P.mode === 'seat' || (uiMode !== 'playing' && uiMode !== 'test');
  const walk = P.mode === 'walk' ? Math.min(1, P.speed / 2.2) : 0;
  hands.update(dt, camera, { hasCamera: hasCamera(), cameraNear: !!(nights && nights.proof && nights.proof.near && F.live && nights.proof.near(P.pos)), keepCamera: !!F.photoHold, mode: P.mode, pod: P.pod, flashOn: F.flashOn && flash.intensity > 0, holding, fear: F.fear, walk, bob: P.bob, hidden: hidden && !hands.busy, world: scene, blocked: sightBlocked, outdoors: roomAt(P.pos.x, P.pos.z, P.pos.y) === 'out', night: F.phase === 'night' });
  // the beam comes out of the torch in the hand when it shows, else from beside the eye
  if (F.flashOn && hands.visible()) hands.lens(flash.position); else flash.position.set(0.12, -0.14, 0);
}

// ---------- the boot, behind the loading screen ----------
// nothing is drawn until the files are in, the textures are on the card and every shader is built, a slice at a time, so the first frame
// does not freeze the page for seconds; then the screen fades onto the title, whose own "click to begin" unlocks the sound
let booted = false, warming = false;
// build the programs for the given light setups: one compile of the whole scene per setup, which hands every program to the driver at once
// and resolves when the driver has them all (programs are shared and cached, so a setup only adds the ones it does not have yet).
// shaders differ for the post-processing target and for the screen; the composer's target is what the game draws into
async function compileSlices(phases, progress = () => {}) {
  const rt = gfx.composer && gfx.composer.renderTarget1;
  for (let p = 0; p < phases.length; p++) {
    if (phases[p] === 'title') titleScene(); else setPhase(phases[p], true);
    let done = null;
    try { if (rt) renderer.setRenderTarget(rt); done = renderer.compileAsync(scene, camera); } catch (e) { /* built on first draw */ } finally { renderer.setRenderTarget(null); }
    if (done) await done;
    mark('compiled ' + phases[p] + ' (' + renderer.info.programs.length + ' programs)');
    progress((p + 1) / phases.length); await tick();
  }
  progress(1);
}
async function boot() {
  // 1. the files: done when three's manager has nothing in flight and nothing new has started for a moment (a model's textures come after it)
  // (counted in polls, not by the clock: the trailer's renderer stops the clocks)
  let idle = 0, last = -1;
  for (let poll = 0; poll < 1000; poll++) {   // 1000 polls of 120 ms: a file that never answers must not keep the game shut
    const f = LOAD.files(), quiet = f.total === 0 || f.done >= f.total;
    idle = quiet && f.done === last ? idle + 1 : 0; last = f.done;
    if (idle >= 4) break;
    await new Promise((res) => setTimeout(res, 120));
  }
  LOAD.set(0.6, 'Turning on the lights');
  if (!window.__norender) {
    // 2. the textures onto the card, a few at a time (with the filtering setting on them first, so none goes up twice)
    gfx.applyTextures();
    const texs = new Set();
    scene.traverse((o) => { for (const m of [].concat(o.material || [])) for (const k in m) { const v = m[k]; if (v && v.isTexture && v.image) texs.add(v); } });
    let i = 0;
    for (const t of texs) { try { renderer.initTexture(t); } catch (e) { /* drawn on first use instead */ } if (++i % 4 === 0) { LOAD.set(0.6 + 0.1 * (i / texs.size)); await tick(); } }
    // 3. the shaders the title draws, a mesh at a time (the other light setups are built when the game starts, behind this same screen)
    LOAD.set(0.7, 'Waiting for dark');
    await compileSlices(['title'], (k) => LOAD.set(0.7 + 0.22 * k));
    titleScene();
  }
  // 4. the grass, which grows in slices of its own
  LOAD.set(0.92, 'Mowing the lawn');
  if (W.lawn && W.lawn.ready) await W.lawn.ready;
  LOAD.set(1, 'Ready');
  booted = true; mark('booted');
  await tick();
  $('loading').classList.add('done');
}

// the power is out (the vigil): every light in the house goes, and the fog takes the rest
function powerOut(on) {
  F.blackout = on; nlMult(on ? 0 : 1, false);
  if (on) { W.hemi.intensity = 0.02; W.sun.intensity = 0; W.porchLight.intensity = 0; W.porchBulb.material.emissiveIntensity = 0; W.streetLight.set(false); W.farLights.visible = false; scene.fog = new THREE.FogExp2(0x010206, 0.09); }
  else setPhase('night');
}
const vigil = createVigil({
  scene, P, F, sfx, UI, EYE, tween, wait, say, lerp, angDiff, ease, camera, powerOut, toBunk, addShake: (v) => { shake = Math.max(shake, v); },
  setFovOff: (v) => { fovOff = v; }, initTexture: (t) => renderer.initTexture(t),
});
nights = createNights({
  vigil,
  P, F, W, E, sfx, UI, camera, mom, dad, L, RUN, saveRun, EYE, BUNK_SEAT, HPARAM, finaleScene: () => finaleScene(), carDream: () => carDream(),
  clamp, lerp, lerpAngle, tween, wait, waitFor, later, ease, setFovOff: (v) => { fovOff = v; }, pan: (x, z, y = 1.2) => panFor(tmp.set(x, y, z)),
  time: () => gameTime, say, panFor, nlMult, setPhase, resetNight, caught, roomAt, sleepers, toBunk, enteredHide, carPass, faceAtWindow, lights,
  addI: (o) => { interacts.push(o); return o; }, removeI: (o) => { const i = interacts.indexOf(o); if (i >= 0) interacts.splice(i, 1); },
  holding: () => !!keys.Space || input.breath || breathLatch,
  addShake: (v) => { shake = Math.max(shake, v); },
  scene, photo: takePhoto, openPhotos, hands, FN, kidBoxes, faceTo: (who, x, z) => { who.group.rotation.set(0, Math.atan2(x - who.group.position.x, z - who.group.position.z), 0); },
  clockRate: 1 / 1.1, lightLabel: () => L('light'),
});
UI.makeGrain();
{   // the title screen shows which run you are on
  $('runinfo').textContent = hasRun() ? `Continue: night ${Math.min(RUN.night, 10)} of 10  ·  seed ${RUN.seed}` : `Seed ${RUN.seed}`;
}
// the title, pause, options and end menus (js/menu.js opens them when the #title / #pause / #end screens show)
function newRun(seed) {   // New game: a run from moving day on the seed it was given (or a fresh one); a saved run is lost
  store.remove('topbunk.run');
  Object.assign(RUN, { seed: seed || newSeed(), started: Date.now(), night: 1, deaths: 0, evidence: [], evidenceAt: {}, objDone: {}, briefed: false, skipTold: false, dayDone: false, hasCamera: false }); if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  nights.proof.sync();
  startGame();
}
// the test mode and the debug jumps (#night5, #morning, #proof=4, #type=vigil, #night=6) earn nothing
const jumped = !!DEBUG || ['proof', 'type', 'night'].some((k) => HPARAM[k] !== undefined);
// before menu.init: it adds its panel to the title and pause menus
menu.panel('photos', { title: 'Photos', render: (body) => { if (nights) nights.proof.board(body); } });
menu.panel('journal', { title: 'Journal', render: (body) => journal.render(body) });
menu.add('pause', { id: 'journal', label: 'Journal', panel: 'journal' }, { after: 'resume' });
menu.add('pause', { id: 'photos', label: 'Photos', panel: 'photos', when: () => !!nights && (nights.proof.count() > 0 || nights.proof.kinds().length > 0) }, { after: 'resume' });
achievements.bind({ F, P, W, RUN, sfx, menu, hunter: () => nights && nights.hunter, test: () => uiMode === 'test' || jumped });
menu.init({
  startGame, newGame: newRun, hasSave: hasRun, night: () => Math.min(RUN.night, 10),
  resume: () => setPause(false), pause: () => setPause(true), canPause: () => uiMode === 'playing',
  stage: () => F.stage, canRestart: () => !F.over, restartNight: restartStage,
  quitToTitle: () => location.reload(),   // the run is saved at each dawn and when moving day is over
  nextSeed: () => (hasRun() ? newSeed() : RUN.seed),   // no run yet: the seed the title shows
  refreshHz,
  shade: (v) => gfx.shade(v, EXPOSURE.night * 2 ** settings.get('brightness')),
  // the end screen's Play again: back to the title with the New game panel open (a fresh page, as Main menu gives)
  playAgain: () => { try { sessionStorage.setItem('topbunk.next', 'new'); } catch (e) { /* ignore */ } location.reload(); },
});
try { if (sessionStorage.getItem('topbunk.next') === 'new') { sessionStorage.removeItem('topbunk.next'); menu.newGame(); } } catch (e) { /* ignore */ }
titleScene();
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('mobile').classList.add('show');
requestAnimationFrame(loop);
boot();
window.__game = { vigil, FN, lights, sitInChair, standUp, placeBox4, seatThem, sitSpot, kidBoxes, get seat() { return seat; }, seatOn, seatHeight, kitchen, KSPOT, KPOSE, GRIP, carryPos, makeThing, HOLD, DAD_HOME, EVE_MOM, speak, caught, openPhotos, openJournal, journal, takePhoto, hands, input, settings, menu, achievements, nights, RUN, toggleLight, sleepers, kitchenLife, sightBlocked, startGame, setPause, finaleFor, WF, carPass, faceAtWindow, weather, traffic, gfx, sfx, P, F, W, E, camera, scene, renderer, setPhase, nlMult, BATH_I, mom, dad, BUNK_SEAT, BUNK_LIE, UI, cam: () => { updateCamera(0); E.update(0.016); }, start: () => { started = true; uiMode = 'test'; UI.hide('title'); }, get gameTime() { return gameTime; } };
