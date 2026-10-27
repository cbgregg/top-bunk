// TOP BUNK — game loop, player, and the story script.
import * as THREE from 'three';
import { buildWorld, roomAt } from './world.js';
import { Entity } from './entity.js';
import { Sound } from './audio.js';
import { makePerson } from './people.js';
import { Gfx } from './gfx.js';
import { WindowFace } from './windowface.js';
import { Dust } from './dust.js';
import * as UI from './ui.js';
import { input, label as L, initInput, controlsTable } from './input.js';

const V3 = THREE.Vector3;
const $ = (id) => document.getElementById(id);
const DEBUG = location.hash.slice(1);

// ---------- renderer ----------
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: DEBUG === 'shot' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('game').appendChild(renderer.domElement);
const canvas = renderer.domElement;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.03, 700);
camera.rotation.order = 'YXZ';
scene.add(camera);

const W = buildWorld(scene);
const E = new Entity(scene);
const sfx = new Sound();
const WF = new WindowFace(scene, W.faceLight, W.carLight);
const mom = makePerson({ model: 'mom', height: 1.66, shirt: '#7b8f6c', pants: '#3a3f52', hair: '#5b3a22', longHair: true });
const dad = makePerson({ model: 'dad', height: 1.84, shirt: '#7a4636', pants: '#2c3646', hair: '#2a221c', cap: '#2d4a2a' });
mom.group.position.set(0.6, 0, 1.6); dad.group.position.set(4.3, 0, -13.4);   // where the day starts them
scene.add(mom.group, dad.group);

const gfx = new Gfx(renderer, scene, camera);
const dust = new Dust(scene, camera);
{   // graphics setting on the title screen
  const sel = $('quality');
  if (sel) {
    sel.value = gfx.auto ? 'auto' : gfx.quality;
    sel.addEventListener('change', () => {
      if (sel.value === 'auto') { try { localStorage.removeItem('topbunk.quality'); } catch (e) { /* ignore */ } gfx.auto = true; gfx.setQuality('high', { save: false }); }
      else gfx.setQuality(sel.value);
    });
    sel.addEventListener('click', (e) => e.stopPropagation()); sel.addEventListener('mousedown', (e) => e.stopPropagation());
  }
}
const BATH_I = 95;

// ---------- constants ----------
const EYE = 1.32, R = 0.28;
const BUNK_SEAT = new V3(6.03, 2.24, 3.02);
const BUNK_LIE = new V3(6.13, 1.9, 3.02);
const LADDER_MID = new V3(7.48, 1.55, 3.02);
const LADDER_FLOOR = new V3(7.68, 0, 3.02);
const BUNK_SIDE = new V3(6.03, 0, 2.12);
const HIDE_YAW = 0;                         // lying on the top bunk you face the room (toward the front of the house, -z)
const LADDER_YAW = Math.PI / 2;             // on the ladder you face the bunk (west)
const HALL_DOOR = new V3(7.05, 0, -0.9);    // the hall in front of your door
const HALL_MOUTH = new V3(1.6, 0, -0.9);    // just inside the living room, where the hall opens into it

// ---------- helpers ----------
const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const lerpAngle = (a, b, k) => a + angDiff(a, b) * k;
const ease = { inOut: (k) => k * k * (3 - 2 * k), out: (k) => 1 - (1 - k) * (1 - k), in: (k) => k * k, lin: (k) => k };
const tmp = new V3(), tmp2 = new V3(), fwd = new V3();

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
  tmp2.copy(pos).applyMatrix4(camera.matrixWorldInverse);
  return clamp(tmp2.x / Math.max(0.6, Math.hypot(tmp2.x, tmp2.z)), -1, 1) * 0.9;
}

// ---------- state ----------
const P = {
  pos: new V3(2.2, 0, -9.0), vel: new V3(), yaw: Math.PI, pitch: 0, roll: 0, mode: 'walk',
  cam: new V3(), stamina: 1, exhausted: false, carrying: null, stepAcc: 0, bob: 0, speed: 0,
  breath: 1, breathT: 0, inhale: true,
};
const F = { stage: 'day', night: 0, scare: false, coverPrompt: false, finalMorning: false, phase: 'title', boxes: 0, momReady: false, talkedMom: false, splashed: false, chase: false, echo: false, dead: false, cutscene: false, morningReady: false, pushStart: false, flashOn: false, breathCheck: false, breathUI: false, grace: 0, birds: false, flicker: false };
let chase = null, shake = 0, uiMode = 'title', paused = false, started = false, pressE = false;
const keys = {};
const echoes = [];

// ---------- input ----------
addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
  keys[e.code] = true;
  if (e.repeat) return;
  if (e.code === 'KeyE') pressE = true;
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });
document.addEventListener('visibilitychange', () => { if (document.hidden && uiMode === 'playing') setPause(true); });
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || paused || F.cutscene) return;
  if (!(P.mode === 'walk' || P.mode === 'bunk' || P.mode === 'hide')) return;
  P.yaw -= e.movementX * 0.0022; P.pitch = clamp(P.pitch - e.movementY * 0.0022, -1.45, 1.45);
});
// pause / resume without the mouse (controller Start, the touch pause button)
function setPause(on) {
  if (on && uiMode === 'playing') { uiMode = 'pause'; paused = true; UI.show('pause'); sfx.suspend(); for (const k in keys) keys[k] = false; if (document.pointerLockElement) document.exitPointerLock(); }
  else if (!on && uiMode === 'pause') { uiMode = 'playing'; paused = false; UI.hide('pause'); sfx.resume(); if (input.scheme === 'kb') lock(); }
}
// the A button on a menu screen is a click on its button
function confirmPress() {
  if (uiMode === 'title' && !started) startGame(); else if (uiMode === 'pause') setPause(false); else if (uiMode === 'death') retry(); else if (uiMode === 'end') location.reload();
}
const canLook = () => !paused && !F.cutscene && !F.dead && (P.mode === 'walk' || P.mode === 'bunk' || P.mode === 'hide');
function lookBy(dyaw, dpitch) { if (!canLook()) return; P.yaw += dyaw; P.pitch = clamp(P.pitch + dpitch, -1.45, 1.45); }
initInput({ interact: () => { if (uiMode === 'playing') pressE = true; }, pause: () => setPause(uiMode === 'playing'), confirm: confirmPress, lookBy });
// the controls table and the "begin" line follow whichever device you last used
function renderControls() {
  $('controls').innerHTML = controlsTable().map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join('');
  $('begin').textContent = input.scheme === 'touch' ? 'Tap to begin' : input.scheme === 'pad' ? 'Press A to begin' : 'Click to begin';
  $('resume').textContent = input.scheme === 'touch' ? 'Tap to resume' : input.scheme === 'pad' ? 'Press A to resume' : 'Click to resume';
}
input.onScheme = renderControls; renderControls();
function lock() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* noop */ } }
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked && uiMode === 'pause') { uiMode = 'playing'; paused = false; UI.hide('pause'); sfx.resume(); }
  else if (!locked && uiMode === 'playing') { uiMode = 'pause'; paused = true; UI.show('pause'); sfx.suspend(); for (const k in keys) keys[k] = false; }
});
$('pause').addEventListener('click', () => { lock(); setTimeout(() => { if (uiMode === 'pause' && document.pointerLockElement !== canvas) setPause(false); }, 200); });
$('title').addEventListener('click', startGame);
$('retry').addEventListener('click', retry);
$('again').addEventListener('click', () => location.reload());
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); gfx.resize(); });

// a car goes by outside (its light slides through the windows), and a while later something huge and pale drifts past them
function carPass() { WF.carPass(); sfx.moving('sfx/car_pass', { gain: 0.9, from: 0.9, to: -0.9 }); UI.subtitle('<i>Headlights slide across the ceiling.</i>', 3); }
function faceAtWindow() {
  WF.face(); sfx.moving('sfx/face_wail', { gain: 0.8, from: 0.6, to: -0.8, dur: 13 });
  later(1.6, () => UI.subtitle('<i>Something huge and pale is going past the windows.</i>', 4));
}

// the green night lights: a steady faint pulse; they stutter and dim when the thing is near
let nlBase = 0;
function nlMult(m, flick = true) {
  for (const n of W.nightLights) {
    let k = m;
    if (flick && E.visible && m > 0) { const d = Math.hypot(n.pos.x - E.root.position.x, n.pos.z - E.root.position.z); if (d < 7) k *= Math.random() < 0.09 * (1 - d / 7) * 3 ? 0.08 : 1 - 0.35 * (1 - d / 7); }
    n.light.intensity = n.base * k; n.mat.emissiveIntensity = 2.4 * k;
  }
}

// ---------- phases (lighting) ----------
function setPhase(p, silent = false) {
  F.phase = p; W.sun.shadow.needsUpdate = true;
  const day = p === 'day', night = p === 'night' || p === 'title', morn = p === 'morning';
  gfx.setPhase(p);
  scene.fog = day ? new THREE.Fog(0xa9c2d6, 35, 190) : p === 'title' ? new THREE.FogExp2(0x02040c, 0.03) : night ? new THREE.FogExp2(0x040818, 0.062) : new THREE.Fog(0xe8dcc6, 30, 170);
  W.hemi.color.set(day ? 0xcfe0ff : night ? 0x2d4c9c : 0xffe6c4);
  W.hemi.groundColor.set(day ? 0x5a4a35 : night ? 0x04060f : 0x6a5238);
  W.hemi.intensity = day ? 0.55 : p === 'title' ? 0.28 : night ? 0.3 : 0.8;
  W.sun.color.set(day ? 0xfff1dc : night ? 0x5f7cff : 0xffd2a0);
  W.sun.intensity = day ? 3.0 : p === 'title' ? 0.4 : night ? 0.28 : 2.4;
  if (day) W.sun.position.set(40, 45, -30); else if (night) W.sun.position.set(-60, 50, 40); else W.sun.position.set(55, 18, 5);
  W.stars.visible = W.moon.visible = night;
  W.winMat.map = day ? W.T.winDay : night ? W.T.winNight : W.T.winMorning;
  W.winMat.color.set(night ? 0x8899bb : 0xffffff); W.winMat.needsUpdate = true;
  for (const k in W.bulbs) { const b = W.bulbs[k]; const on = day; b.light.visible = on || k === 'bath'; b.light.intensity = on ? b.base * 0.55 : 0; b.dome.material.emissiveIntensity = on ? 2 : 0; }
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
  W.bathSpot.intensity = 0;
  W.frontDoor.setOpen(day);
  W.drawingMat.map = (p === 'night' || morn) ? W.T.drawing1 : W.T.drawing0; W.drawingMat.needsUpdate = true;
  renderer.toneMappingExposure = day ? 0.8 : night ? 1.0 : 0.85;
  mom.group.visible = dad.group.visible = day;
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
addI({ obj: W.drawingMesh, r: 2.3, label: 'Look at the drawing', when: () => F.phase !== 'morning', act: lookDrawing });
addI({ obj: mom.head, r: 2.6, label: 'Talk to Mom', when: () => F.phase === 'day' && mom.group.visible, act: talkMom });
addI({ obj: dad.head, r: 2.6, label: 'Talk to Dad', when: () => F.phase === 'day' && dad.group.visible, act: talkDad });
addI({ p: new V3(7.33, 1.3, 3.02), r: 1.6, label: 'Climb into the top bunk', when: () => F.phase === 'day' || F.phase === 'night', act: climbUp });
addI({ p: W.bathSink, r: 1.9, label: 'Splash water on your face', when: () => F.phase === 'night' && !F.splashed, act: splash });

function updateInteract() {
  let label = null, act = null;
  if (!F.cutscene && !F.dead) {
    if (P.mode === 'bunk') {
      if (F.phase === 'morning') { if (F.morningReady) { label = 'Climb down'; act = F.finalMorning ? () => { F.pushStart = true; } : climbDown; } }
      else if (F.coverPrompt) { label = 'Pull the covers over your head'; act = hideUnderCovers; }
      else { label = 'Climb down'; act = climbDown; }
    } else if (P.mode === 'walk') {
      if (P.carrying && roomAt(P.pos.x, P.pos.z) === 'bed') { label = 'Put the box down'; act = dropBox; }
      else {
        camera.getWorldDirection(fwd);
        let best = -1;
        for (const it of interacts) {
          if (!it.when()) continue;
          if (it.obj) it.obj.getWorldPosition(tmp); else tmp.copy(it.p);
          tmp.sub(camera.position); const d = tmp.length(); if (d > it.r) continue;
          const dot = tmp.divideScalar(d).dot(fwd);
          if (dot > (d < 1.1 ? 0.55 : 0.82) && dot > best) { best = dot; label = it.label; act = it.act; }
        }
      }
    }
  }
  UI.prompt(label ? `<b>${L('interact')}</b> ${label}` : null); input.setUse(!!label);
  if (pressE && act) act();
  pressE = false;
}

// The held box is pulled back and down as a wall gets close, so it never pokes through (the player's circle is smaller than the box's reach).
const BOX_HALF = 0.23, BOX_Z = 0.62;
function wallAhead(ox, oz, dx, dz, max) {
  let best = max;
  for (const c of W.colliders) {
    if (!c.on) continue;
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
function dropBox() {
  const b = P.carrying, spot = W.dropSpots[Math.min(F.boxes, W.dropSpots.length - 1)];
  camera.remove(b); W.house.add(b); b.position.set(spot.x, spot.y + 0.22, spot.z); b.rotation.set(0, (Math.random() - 0.5) * 0.6, 0);
  P.carrying = null; F.boxes++; sfx.thump();
  if (F.boxes < 3) UI.objective(`Carry your boxes to your room <span>${F.boxes} / 3</span>`);
  if (F.boxes === 1) UI.subtitle('<i>Top bunk is yours. The bottom one is for boxes.</i>', 4);
}
function lookDrawing() {
  if (F.phase === 'night') UI.subtitle("<i>It's different now. The figure is next to the bed... and the kid is falling.</i>", 5.5);
  else UI.subtitle("<i>The last kid drew this. A tall black shape with huge white eyes and a big smile. \"HE WATCHES.\"</i>", 6);
  sfx.creak(0.12, 0.6, 0.4);
}
// ---------- dialogue: assets/audio/lines.json holds each line's subtitle and the text the voice reads (tools/gen_voice.py makes the audio) ----------
let LINES = {};
try { LINES = await (await fetch('assets/audio/lines.json')).json(); } catch (e) { /* no dialogue file: lines show as plain ids */ }
// subtitle + recorded voice (what the kid says is subtitle-only); returns how long the line is held
function speak(id, { muffle = false, hold = 0.45 } = {}) {
  const l = LINES[id] || { html: id, voice: null };
  let d = 0;
  if (l.voice) { d = sfx.say(id, { muffle }); (l.voice === 'mom' ? mom : dad).talk(muffle ? null : sfx.envelope('vo/' + id)); }
  const t = Math.max(d + hold, 2.4 + l.html.replace(/<[^>]+>/g, '').length / 24);
  UI.subtitle(l.html, t); return t;
}
const say = async (id, o) => { await wait(speak(id, o)); };
function talkMom() {
  if (!F.momReady) { speak('mom/boxes_first'); return; }
  if (!F.talkedMom) F.talkedMom = true;
}
const dadLines = ['dad/line_1', 'dad/line_2', 'dad/line_3'];
let dadIdx = 0;
function talkDad() { speak(F.boxes >= 3 ? 'dad/mom_looking' : dadLines[dadIdx++ % dadLines.length]); }
function splash() { sfx.splash(); UI.subtitle('<i>The water is ice cold.</i>', 3); F.splashed = true; }

// ---------- bunk ----------
async function climbUp() {
  if (F.cutscene) return;
  F.cutscene = true; P.mode = 'cine';
  P.cam.copy(camera.position);
  const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch, hiding = F.chase || F.scare;
  sfx.creak(0.25, 0);
  await tween(0.32, (k) => { P.cam.lerpVectors(from, LADDER_MID, k); P.yaw = lerpAngle(y0, LADDER_YAW, k); P.pitch = lerp(p0, 0.3, k); });
  sfx.footstep(0.2, 0, 0.1);
  if (hiding && F.chase && chase) { chase.approach = [new V3(6.6, 0, 1.2), BUNK_SIDE.clone()]; }
  const dest = hiding ? BUNK_LIE : BUNK_SEAT;
  await tween(0.42, (k) => { P.cam.lerpVectors(LADDER_MID, dest, k); P.yaw = lerpAngle(LADDER_YAW, HIDE_YAW, k); P.pitch = lerp(0.3, hiding ? 0.15 : -0.1, k); });
  F.cutscene = false;
  if (hiding || F.chase) {
    P.mode = 'hide'; UI.blanket(true); sfx.whoosh(0); UI.objective('Stay quiet.');
  } else P.mode = 'bunk';
}
// already up on the bunk when it comes: pull the blanket over your head
async function hideUnderCovers() {
  F.coverPrompt = false; F.cutscene = true; P.mode = 'cine'; const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch;
  await tween(0.6, (k) => { P.cam.lerpVectors(from, BUNK_LIE, k); P.yaw = lerpAngle(y0, HIDE_YAW, k); P.pitch = lerp(p0, 0.15, k); });
  F.cutscene = false; P.mode = 'hide'; UI.blanket(true); sfx.whoosh(0); UI.objective('Stay quiet.');
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
  P.mode = 'walk'; F.cutscene = false;
}

// ---------- player ----------
function collide() {
  for (const c of W.colliders) {
    if (!c.on) continue;
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
  let wx = fx * f + rx * s, wz = fz * f + rz * s; const wl = Math.hypot(wx, wz), mag = Math.min(1, wl);   // (a gentle stick push walks slowly)
  if (wl > 0) { wx /= wl; wz /= wl; }
  const sprint = (keys.ShiftLeft || keys.ShiftRight || input.run) && wl > 0 && f > 0 && !P.carrying && !P.exhausted && P.stamina > 0.01;
  const speed = (P.carrying ? 1.9 : sprint ? 4.7 : 2.5) * (0.35 + 0.65 * mag);
  if (sprint) P.stamina -= dt / 5.5; else P.stamina = Math.min(1, P.stamina + dt / 4);
  if (P.stamina <= 0.01 && !P.exhausted) { P.exhausted = true; sfx.gasp(); }
  if (P.exhausted && P.stamina > 0.4) P.exhausted = false;
  const a = Math.min(1, dt * 10);
  P.vel.x += (wx * speed - P.vel.x) * a; P.vel.z += (wz * speed - P.vel.z) * a;
  for (let i = 0; i < 3; i++) { P.pos.x += P.vel.x * dt / 3; P.pos.z += P.vel.z * dt / 3; collide(); }
  P.speed = Math.hypot(P.vel.x, P.vel.z);
  const stride = sprint ? 0.9 : 0.62;
  P.stepAcc += P.speed * dt; P.bob += P.speed * dt * (Math.PI / stride);
  if (P.stepAcc > stride) { P.stepAcc = 0; playerStep(sprint); }
  UI.stamina(P.stamina, P.stamina < 0.99);
}
function playerStep(sprint) {
  const room = roomAt(P.pos.x, P.pos.z), vol = sprint ? 0.42 : 0.26;
  if (room === 'out') sfx.grassStep(vol); else sfx.footstep(vol, 0, room === 'bath' || room === 'kitchen' || room === 'dining' ? 0.3 : 0.15, room === 'bath' || room === 'kitchen' || room === 'dining' || room === 'entry' ? 'tile' : 'carpet');
  if (F.echo) echoes.push(gameTime + 0.27 + Math.random() * 0.06);
}
function updateCamera(dt) {
  if (P.mode === 'walk') {
    const bobY = Math.sin(P.bob) * 0.035 * Math.min(1, P.speed / 2.5);
    camera.position.set(P.pos.x, EYE + bobY, P.pos.z);
  } else camera.position.copy(P.cam);
  if (P.mode === 'hide') {
    P.yaw = HIDE_YAW + clamp(angDiff(HIDE_YAW, P.yaw), F.scare ? -1.5 : -0.55, F.scare ? 0.55 : 0.55); P.pitch = clamp(P.pitch, -0.35, 0.4);
    camera.position.y += Math.sin(gameTime * (keys.Space || input.breath ? 0.6 : 2.4)) * 0.006;
  }
  if (P.mode === 'bunk') P.pitch = clamp(P.pitch, -1.2, 0.9);
  camera.rotation.set(P.pitch, P.yaw, P.roll);
  if (shake > 0) {
    camera.position.x += (Math.random() - 0.5) * shake * 0.07;
    camera.position.y += (Math.random() - 0.5) * shake * 0.07;
    camera.rotation.z += (Math.random() - 0.5) * shake * 0.04;
    shake = Math.max(0, shake - dt * 1.6);
  }
  holdBox(dt);
}

// ---------- the chase ----------
function lookingBack() { camera.getWorldDirection(fwd); return fwd.x < -0.55; }   // toward the living room end of the hall

// The figure appears at the far end of the hall (where it opens into the living room), lit from behind. On the last night it comes for you;
// on the first it only STANDS there while the violins scream.
async function reveal(chasing = true) {
  E.visible = true; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0; E.smileScale = 1;
  E.root.position.copy(HALL_MOUTH); E.root.rotation.y = Math.PI / 2; E.lookTarget = camera.position;
  sfx.stab(); sfx.violins(chasing ? 0.55 : 1, 0.3); shake = 0.35;
  F.flicker = true;
  await tween(0.55, (k) => { W.bathSpot.intensity = Math.random() < k ? BATH_I : BATH_I * 0.05; nlMult(Math.random() < k ? 0 : 1, false); }, ease.lin);
  W.bathSpot.intensity = BATH_I; nlMult(0.2, false);
  UI.objective(chasing ? '<b class="red">RUN.</b> Get back to bed' : 'Get back to bed. <b class="red">Don\'t look at it.</b>');
  sfx.tension(0.03, 0.4);
  await tween(1.0, (k) => { E.tilt = k * 0.55; });
  sfx.giggle(panFor(E.root.position));
}
function startChase() {
  chase = { trail: [], approach: [], last: P.pos.clone(), t0: gameTime, stepAcc: 0, hb: 0, arrived: false };
  const room = roomAt(P.pos.x, P.pos.z);
  // if you're already in your room, it follows through the door
  if (room === 'bed') chase.trail.push(HALL_DOOR.clone(), new V3(7.05, 0, 0.3));
  chase.trail.push(P.pos.clone());
  F.chase = true; E.mode = 'run';
  sfx.drone(0.17, 0.5);
  sfx.bed('music/chase', 0.6, 0.6); sfx.bed('music/night', 0, 1.5);
  UI.hint(`Hold <b>${L('sprint')}</b> to sprint`, 3);
}
function updateChase(dt) {
  if (!F.chase || !chase) return;
  const c = chase, ep = E.root.position;
  if (P.mode === 'walk' && P.pos.distanceTo(c.last) > 0.35) { c.trail.push(P.pos.clone()); c.last.copy(P.pos); }
  const gap = Math.hypot(P.pos.x - ep.x, P.pos.z - ep.z);
  let sp;
  if (P.mode === 'walk' || P.mode === 'cine') {
    const ramp = Math.min(1, 0.35 + (gameTime - c.t0) / 1.2);
    sp = clamp(P.speed * 0.95 + (gap - 2.6) * 1.1, 3.1, 6.6) * ramp;
  } else sp = 1.9;
  let remaining = sp * dt, moved = false;
  for (let guard = 0; remaining > 1e-4 && guard < 8; guard++) {
    let target = c.trail.length ? c.trail[0] : (P.mode === 'walk' ? P.pos : c.approach[0]);
    if (!target) { if (P.mode === 'hide') c.arrived = true; break; }
    const dx = target.x - ep.x, dz = target.z - ep.z, d = Math.hypot(dx, dz);
    if (d > 0.05) E.faceTowards(target.x, target.z, Math.min(1, dt * 10));
    if (d <= remaining) {
      ep.x = target.x; ep.z = target.z; remaining -= d; moved = true;
      if (c.trail.length) c.trail.shift(); else if (target !== P.pos) c.approach.shift(); else break;
    } else { ep.x += (dx / d) * remaining; ep.z += (dz / d) * remaining; remaining = 0; moved = true; }
  }
  E.mode = !moved ? 'idle' : sp > 2.6 ? 'run' : 'walk'; E.speed = sp / 3;
  c.stepAcc += moved ? sp * dt : 0;
  if (c.stepAcc > (E.mode === 'run' ? 1.05 : 0.8)) { c.stepAcc = 0; sfx.heavyStep(clamp(1.2 / (1 + gap * 0.25), 0.1, 0.9), panFor(ep)); }
  c.hb -= dt;
  if (c.hb <= 0) { sfx.heartbeat(0.55); c.hb = clamp(0.3 + gap * 0.05, 0.32, 0.9); }
  if (P.mode === 'walk' && gap < 0.78) caught();
}

// It stands over the bunk while you lie under the blanket holding your breath. level 1..3: how long, and how close it gets.
async function loomOverBed(level, walkIn = true) {
  UI.hint(`Hold <b>${L('breath')}</b> to hold your breath`, 7);
  F.breathUI = true; sfx.violins(1, 0.4);
  if (walkIn) {   // heavy, slow steps from wherever it is to the side of the bunk
    E.mode = 'walk'; E.speed = 0.7; const from = E.root.position.clone(); let st = 0;
    await tween(3.4, (k) => { E.root.position.lerpVectors(from, BUNK_SIDE, k); E.faceTowards(BUNK_SIDE.x, BUNK_SIDE.z, 1); st += 0.03; if (st > 1.1) { st = 0; sfx.heavyStep(0.6, panFor(E.root.position)); } }, ease.lin);
    E.mode = 'idle';
  }
  F.chase = false; E.mode = 'idle';
  F.breathCheck = true; F.grace = 1.3;
  sfx.tension(0.045, 1); sfx.bed('music/chase', 0, 2);
  const y0 = E.root.rotation.y;
  await tween(1.6, (k) => { E.root.rotation.y = lerpAngle(y0, 0, Math.min(1, k * 2)); E.lean = k * 0.35; E.tilt = 0.55 - k * 0.95; });
  sfx.whisper(panFor(E.root.position), 0.16);
  await tween(2.2 + level * 0.3, (k) => { E.tilt = -0.4 + Math.sin(k * Math.PI * (1 + level * 0.5)) * 0.8; E.smileScale = 1 + k * 0.18; });   // (the whole breath-holding stretch stays under 8 s)
  sfx.giggle(0);
  await wait(1.6 + level * 0.4);
  F.breathCheck = false;
  UI.hint(null);
  sfx.violins(0, 0.05);    // the violins stop dead
  sfx.ceilingThump();
  await tween(1.2, (k) => { E.lean = 0.35 * (1 - k); E.root.rotation.y = lerpAngle(0, Math.PI, k); E.smileScale = 1.18 - 0.18 * k; });
  E.mode = 'walk'; E.speed = 0.6;
  const from = E.root.position.clone(), to = HALL_DOOR.clone();
  await tween(3.2, (k) => { E.root.position.lerpVectors(from, to, k); }, ease.lin);
  E.visible = false; E.mode = 'idle';
  sfx.tension(0, 3); sfx.drone(0.085, 4);
  W.bathSpot.intensity = 0; F.flicker = false; F.scare = false;
  await wait(2.5);
  UI.subtitle('<i>You stay under the blanket until the window turns grey.</i>', 4.5);
  await wait(2.0);
  UI.fade(1, 3); await wait(3.6);
  F.breathUI = false; UI.blanket(false); UI.breath(1, false);
}
async function hideScript() {   // after the chase: wait until it has followed you to the bunk
  UI.hint(`Hold <b>${L('breath')}</b> to hold your breath`, 7);
  F.breathUI = true;
  await waitFor(() => chase.arrived);
  await loomOverBed(3, false);
}

async function caught() {
  if (F.dead) return;
  F.dead = true;
  killAll(); F.chase = false; F.breathCheck = false; F.echo = false; F.cutscene = true; F.breathUI = false;
  UI.blanket(false); UI.prompt(null); UI.breath(0, false); UI.objective(null); UI.hint(null); UI.stamina(1, false);
  P.mode = 'cine'; P.cam.copy(camera.position);
  camera.getWorldDirection(fwd); fwd.y = 0; fwd.normalize();
  const cp = P.cam.clone();
  E.visible = true; E.mode = 'idle'; E.reach = 1; E.lean = 0.12; E.smileScale = 1.3; E.tilt = 0.3; E.lookTarget = camera.position;
  const place = (d) => { E.root.position.set(cp.x + fwd.x * d, cp.y - 2.2, cp.z + fwd.z * d); E.faceTowards(cp.x, cp.z); };
  place(1.7);
  sfx.scream(); shake = 1.3; UI.flash('rgba(255,255,255,0.35)', 0.25);
  await tween(0.3, (k) => place(1.7 - k * 1.25), ease.in);
  await wait(0.4);
  UI.fade(1, 0.05);
  E.visible = false; sfx.drone(0, 1); sfx.tension(0, 0.3); sfx.bed('music/chase', 0, 0.3);
  await wait(1.1);
  uiMode = 'death'; document.exitPointerLock(); UI.show('death');
}

function resetNight() {
  F.dead = false; F.cutscene = false; F.chase = false; F.echo = false; F.breathCheck = false; F.breathUI = false; F.flicker = false; F.scare = false; F.coverPrompt = false;
  F.splashed = false; F.pushStart = false; F.morningReady = false; F.finalMorning = false; P.breath = 1; P.stamina = 1; P.exhausted = false; shake = 0;
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

// ---------- story ----------
function titleScene() {
  setPhase('title');
  E.visible = true; E.mode = 'idle'; E.root.position.set(5, 0, -16); E.lookTarget = camera.position;
  E.faceTowards(-9, -26);
}

// compile every shader variant (day, night, morning light setups) while the screen is black, so the phase changes later don't hitch
async function warmShaders() {
  const rt = gfx.composer && gfx.composer.renderTarget1;   // (shaders differ for a render target and for the screen)
  try { for (const p of ['night', 'morning', 'day']) { setPhase(p, true); if (rt) renderer.setRenderTarget(rt); await renderer.compileAsync(scene, camera); renderer.setRenderTarget(null); } } catch (e) { renderer.setRenderTarget(null); /* compiled on first use instead */ }
}
const STAGES = {
  day: () => dayScript(), n1: () => night1(), b1: () => breakfast(1), n2: () => night2(), b2: () => breakfast(2), n3: (resume) => night3(resume),
};
const ORDER = ['day', 'n1', 'b1', 'n2', 'b2', 'n3'];
async function playFrom(stage, resume = false) {
  const list = ORDER.slice(ORDER.indexOf(stage));
  for (let i = 0; i < list.length; i++) await STAGES[list[i]](resume && i === 0);
  await endingScript();
}

async function startGame() {
  if (started) return;
  sfx.init(); started = true; uiMode = 'playing';
  UI.hide('title'); lock();
  if (input.scheme === 'touch') { try { document.documentElement.requestFullscreen && document.documentElement.requestFullscreen().catch(() => {}); screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape').catch(() => {}); } catch (e) { /* not available */ } }
  E.visible = false; E.lookTarget = null;
  UI.fade(1, 0.01);
  await warmShaders();
  if (DEBUG === 'night' || DEBUG === 'night1') { await playFrom('n1'); return; }
  if (DEBUG === 'night2') { await playFrom('n2'); return; }
  if (DEBUG === 'breakfast') { await playFrom('b1'); return; }
  if (DEBUG === 'night3') { await playFrom('n3'); return; }
  if (DEBUG === 'chase') { await playFrom('n3', true); return; }
  if (DEBUG === 'morning') { await finalMorning(); await endingScript(); return; }
  await playFrom('day');
}

// ---------- the family at work: Dad carries boxes in from the truck and unpacks them, Mom unpacks the kitchen ----------
const chore = { run: 0, stop: false, dadHome: false };
const dressing = [];                                    // everything they set down (cleared when the day restarts)
const TRUCK_PICK = new V3(2.3, 0.55, -15.2), RAMP_FOOT = new V3(2.3, 0, -11.3), PORCH = new V3(1.9, 0, -6.5), DOOR_IN = new V3(1.9, 0, -3.7), DOOR_OUT = new V3(1.9, 0, -5.4);
const LIVING_SPOTS = [new V3(0.85, 0, -3.75), new V3(-0.2, 0, -3.85), new V3(0.35, 0, -2.7)];
const KITCHEN_BOX = new V3(1.2, 0, 1.4), DAD_HOME = new V3(0.2, 0, 0.6), ARCH = new V3(1.7, 0, -1.0), ARCH_IN = new V3(1.7, 0, 0.3);
const COUNTER = [[2.8, 0.95, 1.95], [2.8, 0.95, 2.25], [2.8, 0.95, 2.55], [0.0, 0.95, 3.3], [-0.3, 0.95, 3.3], [2.2, 0.95, 3.3]];   // where Mom puts things (the east counter and the back counter)
const rampY = (x, z) => (Math.abs(x - 2.3) < 0.9 ? clamp((-11.4 - z) * 0.18, 0, 0.55) : 0);
const stillOn = (run) => run === chore.run;
function stepSound(g) {   // somebody else's footstep, quieter with distance and panned to where they are
  const d = Math.hypot(P.pos.x - g.x, P.pos.z - g.z); if (d > 14) return;
  const room = roomAt(g.x, g.z), hard = room === 'kitchen' || room === 'dining' || room === 'bath' || room === 'entry';
  if (room === 'out') sfx.grassStep(0.3 / (1 + d * 0.35), panFor(tmp2.set(g.x, 1, g.z))); else sfx.footstep(0.3 / (1 + d * 0.3), panFor(tmp2.set(g.x, 1, g.z)), 0.25, hard ? 'tile' : 'carpet');
}
const idle = (who) => { if (who.rig) who.rig.play('idle', { fade: 0.3, speed: 1 }); };

async function walkTo(who, pts, speed = 1.25) {
  const run = chore.run, g = who.group.position;
  for (const p of pts) {
    if (!stillOn(run)) return false;
    const x0 = g.x, z0 = g.z, d = Math.hypot(p.x - x0, p.z - z0);
    if (d < 0.03) continue;
    const yaw0 = who.group.rotation.y, want = Math.atan2(p.x - x0, p.z - z0), dur = d / speed; let stride = 0;
    if (who.rig) who.rig.play('walk', { fade: 0.25, speed: speed / 1.25 });
    await tween(dur, (k) => {
      if (!stillOn(run)) return;
      g.x = x0 + (p.x - x0) * k; g.z = z0 + (p.z - z0) * k; g.y = rampY(g.x, g.z);
      if ((stride += speed * 0.0167) > 0.72) { stride = 0; stepSound(g); }
      who.group.rotation.y = lerpAngle(yaw0, want, Math.min(1, k * dur / 0.35));
    }, ease.lin);
  }
  if (!stillOn(run)) return false;
  idle(who); return true;
}
function turnToward(who, x, z, dur = 0.45) {
  const y0 = who.group.rotation.y, w = Math.atan2(x - who.group.position.x, z - who.group.position.z);
  return tween(dur, (k) => { who.group.rotation.y = lerpAngle(y0, w, k); });
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
  else { add(new THREE.BoxGeometry(0.16, 0.12, 0.12), mat(0xb98a5a, 0.8), 0, 0.06, 0); }
  return g;
}
const wpos = (o) => o.getWorldPosition(new V3());
function reachTo(who, target) { who.pose = { ...(who.pose || {}), reach: target }; }
const bodyH = (who) => who.group.userData.h || 1.75;

// pick up a box and carry it; when done, the box is in the arms
function holdUp(who, box) {
  const h = bodyH(who); who.group.add(box); box.position.set(0, 0.98 * h / 1.75, 0.42); box.rotation.set(0, 0, 0);
  who.pose = { hold: box };
}
async function setDown(who, box, spot) {
  const run = chore.run, h = bodyH(who), y0 = box.position.y, z0 = box.position.z;
  await tween(0.7, (k) => { if (!stillOn(run)) return; who.pose = { hold: box, lean: 0.75 * k }; box.position.y = y0 + (0.22 - y0) * k - 0.0; box.position.z = z0 + 0.16 * k; });
  if (!stillOn(run)) return false;
  scene.attach(box); box.position.set(spot.x, box.geometry.parameters.height / 2, spot.z); box.rotation.set(0, who.group.rotation.y + 0.15, 0); sfx.thump();
  W.colliders.push({ minX: spot.x - 0.3, maxX: spot.x + 0.3, minZ: spot.z - 0.3, maxZ: spot.z + 0.3, on: true, dressing: true });
  who.pose = { lean: 0.75, reach: wpos(box).add(new V3(0, 0.25, 0)) };
  await tween(0.5, (k) => { if (stillOn(run)) who.pose = { lean: 0.75 * (1 - k) }; });
  who.pose = null; return stillOn(run);
}
// open a box on the floor and take things out of it; each thing ends up beside it
async function unpackFloor(who, box, kinds, stand) {
  const run = chore.run, open = box.userData.open || (box.userData.open = openable(box));
  if (!(await walkTo(who, [stand]))) return false;
  await turnToward(who, box.position.x, box.position.z);
  const top = new V3(box.position.x, box.geometry.parameters.height + 0.02, box.position.z);
  await tween(0.7, (k) => { if (stillOn(run)) who.pose = { lean: 0.8 * k, reach: top }; });
  await tween(0.6, (k) => { if (stillOn(run)) open(k); });
  const side = new V3(Math.cos(who.group.rotation.y), 0, -Math.sin(who.group.rotation.y)), fwdv = new V3(Math.sin(who.group.rotation.y), 0, Math.cos(who.group.rotation.y));
  let i = 0;
  for (const kind of kinds) {
    if (!stillOn(run)) return false;
    const th = makeThing(kind); scene.add(th); dressing.push(th);
    const a = top.clone().add(new V3(0, 0.02, 0)), b = box.position.clone().addScaledVector(side, 0.55 + 0.2 * i).addScaledVector(fwdv, -0.1 * i); b.y = 0.0;
    const c = new V3(), lift = new V3();
    await tween(0.9, (k) => {
      if (!stillOn(run)) return;
      lift.lerpVectors(a, b, k); lift.y = a.y + Math.sin(Math.min(1, k * 1.15) * Math.PI) * 0.35 * (1 - k) + (b.y - a.y) * k + 0.1;
      th.position.copy(lift); c.copy(lift); c.y += 0.08; who.pose = { lean: 0.8, reach: c.clone() }; th.position.y = lift.y - 0.05;
    });
    th.position.copy(b); sfx.thump(0.35);
    i++;
  }
  await tween(0.5, (k) => { if (stillOn(run)) who.pose = { lean: 0.8 * (1 - k) }; });
  who.pose = null; return stillOn(run);
}

async function dadChores() {
  const run = chore.run, g = dad.group.position;
  dad.busy = true;
  const done = new Set();
  for (let i = 0; stillOn(run) && !chore.stop && i < LIVING_SPOTS.length; i++) {
    const spot = LIVING_SPOTS[i], box = W.cardboardBox(0, 0, 0, 0.46, 0.4, 0.46, i % 4, 0, scene); box.visible = false; dressing.push(box);
    // up the ramp, lean into the truck and lift a box out
    if (!(await walkTo(dad, i === 0 ? [RAMP_FOOT, TRUCK_PICK] : [DOOR_IN, DOOR_OUT, PORCH, RAMP_FOOT, TRUCK_PICK]))) return;   // back out through the front door, never through the wall
    await turnToward(dad, g.x, g.z - 1);
    const grab = new V3(g.x, 0.55 + 0.55, g.z - 0.7);
    await tween(0.8, (k) => { if (stillOn(run)) dad.pose = { lean: 0.5 * Math.sin(k * Math.PI / 2), reach: grab }; });
    if (!stillOn(run)) return;
    holdUp(dad, box); box.visible = true; sfx.thump(0.4);
    // down the ramp, along the path and in the front door, to the spot in the living room
    if (!(await walkTo(dad, [new V3(2.3, 0.2, -13.3), RAMP_FOOT, PORCH, DOOR_OUT, DOOR_IN, new V3(spot.x, 0, spot.z + 0.85)], 1.15))) return;
    await turnToward(dad, spot.x, spot.z);
    if (!(await setDown(dad, box, spot))) return;
    if (chore.stop) break;
    // open it and take a few things out
    const kinds = [['books', 'lamp'], ['plates', 'books'], ['lamp', 'mug']][i % 3];
    if (!(await unpackFloor(dad, box, kinds, new V3(spot.x + 0.1, 0, spot.z + 0.66)))) return;
    if (chore.stop) break;
  }
  if (!stillOn(run)) return;
  // nothing left to fetch: walk to the kitchen, where Mom is waiting
  if (!(await walkTo(dad, [new V3(g.x, 0, Math.max(g.z, -3.7)), ARCH, ARCH_IN, DAD_HOME]))) return;
  await turnToward(dad, 0.6, 1.6, 0.6);
  chore.dadHome = true;
}
async function momChores() {
  const run = chore.run, g = mom.group.position;
  mom.busy = true;
  const box = W.cardboardBox(KITCHEN_BOX.x, 0, KITCHEN_BOX.z, 0.55, 0.42, 0.5, 0, 0.3, scene); dressing.push(box);
  W.colliders.push({ minX: KITCHEN_BOX.x - 0.3, maxX: KITCHEN_BOX.x + 0.3, minZ: KITCHEN_BOX.z - 0.3, maxZ: KITCHEN_BOX.z + 0.3, on: true, dressing: true });
  const open = openable(box); box.userData.open = open;
  const things = ['plates', 'mug', 'pot', 'mug', 'plates', 'mug'];
  const stand = new V3(KITCHEN_BOX.x - 0.62, 0, KITCHEN_BOX.z);
  if (!(await walkTo(mom, [stand]))) return;
  await turnToward(mom, box.position.x, box.position.z);
  const top = new V3(box.position.x, 0.44, box.position.z);
  await tween(0.8, (k) => { if (stillOn(run)) mom.pose = { lean: 0.75 * k, reach: top }; });
  await tween(0.6, (k) => { if (stillOn(run)) open(k); });
  for (let i = 0; i < things.length && stillOn(run); i++) {
    const th = makeThing(things[i]); scene.add(th); dressing.push(th);
    const [cx, cy, cz] = COUNTER[i], hold = new V3();
    // lift it out of the box, then stand up with it
    await tween(0.9, (k) => { if (!stillOn(run)) return; th.position.set(top.x, 0.44 + 0.3 * k, top.z); hold.copy(th.position).add(new V3(0, 0.08, 0)); mom.pose = { lean: 0.75 * (1 - 0.5 * k), reach: hold.clone() }; });
    // carry it to its place on the counter
    const east = cx > 2.5, sx = east ? cx - 0.65 : cx, sz = east ? cz : cz - 0.9;
    mom.pose = { reach: null };
    let walking = true;
    const follow = (async () => {   // the thing rides in her hands while she walks
      while (walking && stillOn(run)) {
        const h = bodyH(mom), fx = Math.sin(mom.group.rotation.y), fz = Math.cos(mom.group.rotation.y);
        th.position.set(g.x + fx * 0.35, 0.95 * h / 1.75 - 0.12, g.z + fz * 0.35); mom.pose = { reach: th.position.clone().add(new V3(0, 0.05, 0)) };
        await wait(0.02);
      }
    })();
    const okp = await walkTo(mom, [new V3(sx, 0, sz)], 1.1); walking = false; await follow;
    if (!okp) return;
    await turnToward(mom, cx, cz, 0.4);
    const c0 = th.position.clone(), c1 = new V3(cx, cy, cz);
    await tween(0.7, (k) => { if (!stillOn(run)) return; th.position.lerpVectors(c0, c1, k); mom.pose = { lean: 0.25 * Math.sin(k * Math.PI), reach: th.position.clone().add(new V3(0, 0.05, 0)) }; });
    sfx.thump(0.3); mom.pose = null;
    if (i < things.length - 1) { if (!(await walkTo(mom, [stand]))) return; await turnToward(mom, box.position.x, box.position.z, 0.4); }
  }
  // all out: she wipes the counter until somebody needs her
  while (stillOn(run)) {
    const a = new V3(2.6, 0.97, 2.0), t0 = gameTime;
    if (!(await walkTo(mom, [new V3(2.1, 0, 2.2)]))) return;
    await turnToward(mom, 2.8, 2.2, 0.4);
    while (stillOn(run)) { const t = gameTime - t0; mom.pose = { lean: 0.3, reach: new V3(2.75, 0.97, 2.2 + Math.sin(t * 2.2) * 0.45) }; await wait(0.03); if (t > 30) break; }
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
  P.pos.set(2.2, 0, -9.0); P.yaw = Math.PI; P.pitch = 0.02; P.mode = 'walk';
  mom.group.position.set(0.6, 0, 1.6); mom.group.rotation.y = -Math.PI / 2;
  dad.group.position.set(4.3, 0, -13.4); dad.group.rotation.y = -0.5;
  await wait(0.3);
  UI.fade(0, 2.5); UI.card('Saturday', 'Moving day', 3.5);
  F.birds = true;
  await wait(2.6);
  speak('dad/welcome');
  startChores();
  UI.objective('Carry your boxes to your room <span>0 / 3</span>');
  UI.hint(`<b>${L('move')}</b> move &nbsp;·&nbsp; <b>${L('sprint')}</b> sprint &nbsp;·&nbsp; <b>${L('interact')}</b> interact`, 8);
  await waitFor(() => F.boxes >= 3);
  chore.stop = true;   // Dad finishes the box he is carrying, then walks to the kitchen on his own
  await wait(0.8);
  UI.subtitle("<i>That's the last one.</i>", 3);
  UI.objective('Find Mom in the kitchen');
  F.momReady = true;
  await waitFor(() => F.talkedMom);
  if (!chore.dadHome) UI.hint('Dad is still carrying his box in', 4);
  await waitFor(() => chore.dadHome);
  endChores();
  F.cutscene = true; P.vel.set(0, 0, 0);
  faceParent(mom);
  UI.objective(null);
  await say('mom/helper'); await say('mom/landlord'); await say('dad/cheap'); await say('mom/teeth');
  UI.fade(1, 2.5); await wait(3);
  F.birds = false; F.cutscene = false; endChores();
}
function faceParent(who) {
  who.head.getWorldPosition(tmp);
  const y0 = P.yaw, want = Math.atan2(-(tmp.x - P.pos.x), -(tmp.z - P.pos.z));
  tween(0.8, (k) => { P.yaw = lerpAngle(y0, want, k); P.pitch = lerp(P.pitch, 0.18, k); });
}

// what the night does to the house grows every night
const NIGHT_DREAD = [0, 0.22, 0.5, 0.8];
function beginNight(n, time, title) {
  F.stage = 'n' + n; F.night = n; resetNight(); setPhase('night');
  sfx.dread(NIGHT_DREAD[n], 4);
  P.mode = 'bunk'; P.cam.copy(BUNK_SEAT); P.yaw = HIDE_YAW + 0.25; P.pitch = -0.18; P.roll = 0;
  UI.card(time, title, 4.5);
}

// NIGHT ONE: you get up for the bathroom. At the far end of the hall something tall is standing there. The violins go insane. It never moves.
async function night1() {
  beginNight(1, '2:47 AM', 'Night one');
  await wait(2.5); UI.fade(0, 3);
  await wait(2.0);
  sfx.creak(0.3, -0.6);
  UI.subtitle('<i>You really, really need to pee.</i>', 4);
  later(3.5, carPass); later(10.5, faceAtWindow);
  await wait(1.2);
  UI.objective('Go to the bathroom');
  UI.hint(`<b>${L('interact')}</b> climb down`, 6);
  await waitFor(() => P.mode === 'walk' && roomAt(P.pos.x, P.pos.z) === 'hall');
  await waitFor(() => P.pos.x > 5.0 && P.pos.x < 6.2 && P.pos.z < -0.4);
  sfx.whisper(panFor(W.drawingMesh.getWorldPosition(tmp)), 0.08);
  await waitFor(() => P.mode === 'walk' && P.pos.x < 5.0 && roomAt(P.pos.x, P.pos.z) === 'hall');
  F.scare = true;
  await reveal(false);
  // run back; it does not follow. When the lights stutter it is simply standing in your doorway.
  await waitFor(() => roomAt(P.pos.x, P.pos.z) === 'bed' || P.mode === 'hide');
  if (P.mode !== 'hide') {
    UI.objective('Climb the ladder at the foot of the bunk');
    UI.hint(`Go to the ladder and press <b>${L('interact')}</b> to climb up`, 8);
    await tween(0.5, () => { nlMult(Math.random() < 0.5 ? 0 : 1, false); W.bathSpot.intensity = Math.random() < 0.5 ? BATH_I : 0; }, ease.lin);
    W.bathSpot.intensity = 0; sfx.slamFar(0.5);
    E.root.position.set(7.05, 0, -0.35); E.faceTowards(BUNK_SEAT.x, BUNK_SEAT.z);
  }
  await waitFor(() => P.mode === 'hide');
  E.visible = true; E.root.position.set(7.05, 0, -0.35); E.faceTowards(BUNK_SEAT.x, BUNK_SEAT.z); E.mode = 'idle';
  UI.objective(`Hold your breath: keep <b>${L('breath')}</b> held until the violins stop`);
  UI.hint(`Hold <b>${L('breath')}</b> to hold your breath, and don't let go`, 10);
  F.breathUI = true; sfx.violins(1, 0.3); sfx.tension(0.05, 1);
  await wait(1.6);
  F.breathCheck = true; F.grace = 1.3;
  await tween(6.2, (k) => { E.tilt = 0.2 + Math.sin(k * Math.PI * 2) * 0.35; E.smileScale = 1 + k * 0.35; });
  F.breathCheck = false; UI.hint(null); UI.objective(null);
  sfx.violins(0, 0.04); sfx.ceilingThump();        // the violins stop dead
  E.visible = false; F.flicker = false; F.scare = false; W.bathSpot.intensity = 0; nlMult(1, false);
  sfx.tension(0, 2);
  await wait(3);
  UI.subtitle('<i>You stay under the blanket until the window turns grey.</i>', 4.5);
  await wait(2.0);
  UI.fade(1, 3); await wait(3.6);
  F.breathUI = false; UI.blanket(false); UI.breath(1, false);
}

// NIGHT TWO: your parents argue through the wall, something scratches inside the closet, and then it is standing in your room.
async function night2() {
  beginNight(2, '3:12 AM', 'Night two');
  await wait(2.5); UI.fade(0, 3);
  await wait(3.0);
  await say('dad/n2_a', { muffle: true }); await say('mom/n2_a', { muffle: true }); await say('dad/n2_b', { muffle: true });
  await wait(2.5);
  sfx.scratch(0.5); UI.subtitle('<i>Something is scratching inside the closet.</i>', 4);
  await wait(5.5);
  sfx.ceilingThump(); await wait(2.5);
  F.scare = true; F.coverPrompt = true; F.flicker = true;
  E.visible = true; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0.5; E.smileScale = 1.1; E.lookTarget = camera.position;
  E.root.position.set(6.7, 0, 0.5); E.faceTowards(BUNK_SEAT.x, BUNK_SEAT.z);   // standing beside the closet, looking at you
  sfx.stab(); sfx.violins(1, 0.3); shake = 0.5; sfx.tension(0.05, 1);
  await tween(0.5, () => { nlMult(Math.random() < 0.5 ? 0 : 1, false); }, ease.lin);
  nlMult(0.25, false);
  UI.objective('<b class="red">Hide.</b> Pull the covers over your head');
  await waitFor(() => P.mode === 'hide');
  F.coverPrompt = false;
  await loomOverBed(2, true);
}

// NIGHT THREE: your parents hear it too and still say it is you. The bathroom. The light goes. It comes for you down the hall.
async function night3(resume = false) {
  if (!resume) {
    beginNight(3, '3:33 AM', 'Night three');
    await wait(2.5); UI.fade(0, 3);
    await wait(2.0);
    sfx.creak(0.3, -0.6);
    later(1.5, carPass); later(8.5, faceAtWindow);
    await say('mom/n3_a', { muffle: true }); await say('dad/n3_a', { muffle: true });
    UI.objective('Go to the bathroom at the end of the hall');
    UI.hint(`<b>${L('interact')}</b> climb down`, 6);
    await waitFor(() => P.mode === 'walk' && roomAt(P.pos.x, P.pos.z) === 'hall');
    later(2.5, () => { if (!F.splashed) sfx.knock(panFor(new V3(4.5, 1.5, -1.5)), 0.25); });
    await waitFor(() => P.pos.x > 5.0 && P.pos.x < 6.2 && P.pos.z < -0.4);
    sfx.whisper(panFor(W.drawingMesh.getWorldPosition(tmp)), 0.08);
    await waitFor(() => roomAt(P.pos.x, P.pos.z) === 'bath');
    const bb = W.bulbs.bath; sfx.click();
    await tween(0.4, () => { bb.light.intensity = Math.random() < 0.5 ? bb.base : 0; }, ease.lin);
    bb.light.intensity = bb.base; bb.dome.material.emissiveIntensity = 2;
    await waitFor(() => F.splashed);
    await wait(1.8);
    sfx.pop(); bb.light.intensity = 0; bb.dome.material.emissiveIntensity = 0; UI.flash('rgba(255,240,200,0.3)', 0.3);
    await wait(0.9);
    UI.objective('Go back to bed');
  } else {
    F.stage = 'n3'; F.night = 3; if (F.phase !== 'night') { resetNight(); setPhase('night'); UI.fade(0, 0.5); }
    P.mode = 'walk'; P.pos.set(4.3, 0, -0.9); P.yaw = -Math.PI / 2; F.splashed = true; UI.objective('Go back to bed'); sfx.dread(NIGHT_DREAD[3], 2);
  }
  await chaseScript();
  await finalMorning();
}

async function chaseScript() {
  F.echo = false;
  await waitFor(() => P.mode === 'walk' && roomAt(P.pos.x, P.pos.z) === 'hall');
  F.echo = true; const t0 = gameTime;
  sfx.tension(0.012, 3);
  later(2.4, () => { if (F.echo) UI.subtitle("<i>Those aren't your footsteps.</i>", 3.5); });
  await waitFor(() => P.pos.x > 6.0 || (lookingBack() && gameTime - t0 > 1.1) || gameTime - t0 > 16);
  F.echo = false;
  await reveal(true);
  startChase();
  await waitFor(() => P.mode === 'hide');
  await hideScript();
}

// the morning after: you walk to the kitchen and tell them. They do not believe you.
async function breakfast(n) {
  F.stage = 'b' + n; setPhase('morning'); resetNight();
  E.visible = false; F.chase = false;
  P.mode = 'bunk'; P.cam.copy(BUNK_SEAT); P.yaw = HIDE_YAW + 0.15; P.pitch = -0.12; P.roll = 0;
  mom.group.visible = dad.group.visible = true;
  mom.group.position.set(1.95, 0, 1.33); mom.group.rotation.y = Math.PI / 2;        // at the stove
  dad.group.position.set(-1.45, 0, 1.4); dad.group.rotation.y = Math.PI / 2;   // by the table
  F.birds = true;
  UI.card('6:58 AM', 'Morning', 3.5);
  await wait(2.2); UI.fade(0, 3); await wait(2.4);
  UI.subtitle(n === 1 ? '<i>You hardly slept.</i>' : '<i>You did not sleep at all.</i>', 3.5);
  UI.objective('Go to the kitchen');
  F.morningReady = true;
  await waitFor(() => P.mode === 'walk' && Math.hypot(P.pos.x - mom.group.position.x, P.pos.z - mom.group.position.z) < 3.4);
  UI.objective(null); F.cutscene = true; P.vel.set(0, 0, 0); faceParent(mom);
  await wait(0.8);
  if (n === 1) { await say('you/m1_a'); await say('mom/m1_a'); await say('you/m1_b'); await say('dad/m1_a'); await say('mom/m1_b'); }
  else { await say('you/m2_a'); await say('mom/m2_a'); await say('dad/m2_a'); await say('mom/m2_b'); }
  UI.fade(1, 2.5); await wait(3);
  F.birds = false; F.cutscene = false; F.morningReady = false;
  mom.group.visible = dad.group.visible = false;
}

async function finalMorning() {
  F.stage = 'n3'; setPhase('morning'); resetNight(); F.finalMorning = true;
  E.visible = false; F.chase = false;
  P.mode = 'bunk'; P.cam.copy(BUNK_SEAT); P.yaw = HIDE_YAW + 0.15; P.pitch = -0.12; P.roll = 0;
  F.birds = true;
  UI.card('6:58 AM', 'Morning', 4);
  await wait(2.4); UI.fade(0, 3); await wait(2.6);
  await say('mom/breakfast');
  UI.subtitle('<i>It was just a dream. Right?</i>', 3.5);
  UI.objective('Get up');
  F.morningReady = true;
  await waitFor(() => F.pushStart);
  await pushScene();
}

async function pushScene() {
  F.cutscene = true; P.mode = 'cine'; P.cam.copy(BUNK_SEAT);
  UI.prompt(null); UI.objective(null); F.birds = false;
  sfx.creak(0.35, 0.3);
  UI.subtitle('<i>Something cold brushes the back of your neck.</i>', 3);
  const y0 = P.yaw, p0 = P.pitch;
  await tween(1.6, (k) => { P.yaw = lerpAngle(y0, -Math.PI / 2, k); P.pitch = lerp(p0, 0.02, k); });
  E.visible = true; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0.35; E.smileScale = 1; E.lookTarget = camera.position;
  E.root.position.set(7.83, -2.6, 3.02); E.root.rotation.y = -Math.PI / 2;
  sfx.drone(0.15, 2); sfx.tension(0.025, 2);
  await wait(0.3);
  await tween(2.8, (k) => { E.root.position.y = -2.6 + 2.6 * k; P.pitch = lerp(0.02, 0.1, k); }, ease.out);
  await tween(1.5, (k) => { E.smileScale = 1 + k * 0.35; E.tilt = 0.35 - k * 0.35; });
  sfx.tension(0.06, 0.2);
  await wait(0.6);
  sfx.whoosh(0);
  await tween(0.16, (k) => { E.reach = k; }, ease.lin);
  sfx.shove(); shake = 0.6;
  const start = BUNK_SEAT.clone(), end = new V3(6.03, 0.26, 1.82), pitch0 = P.pitch;
  await tween(0.62, (k) => {
    P.cam.set(start.x, lerp(start.y, end.y, k * k), lerp(start.z, end.z, Math.min(1, k * 1.4)));
    P.pitch = lerp(pitch0, 1.02, k); P.roll = lerp(0, 0.42, k);
    E.lean = 0.62 * k;
  }, ease.lin);
  sfx.thud(); sfx.ring(); shake = 1.4; UI.flash('rgba(120,0,0,0.6)', 1.6); UI.blur(6, 0.05);
  sfx.tension(0, 0.2); sfx.drone(0.07, 2);
  await wait(0.2); UI.blur(1.5, 2.5);
  await tween(2.4, (k) => { E.tilt = Math.sin(k * Math.PI) * 0.5; E.smileScale = 1.35 + k * 0.1; });
  sfx.whoosh(0); E.visible = false;
  await wait(1.2);
  UI.fade(1, 2); await wait(2.6);
  UI.blur(0, 0.1);
}

async function endingScript() {
  await wait(0.8);
  await say('mom/thump'); await wait(0.3);
  await say('mom/again'); await wait(0.5);
  await say('dad/ending'); await wait(0.8);
  await say('mom/bottom_bunk'); await wait(1);
  uiMode = 'end'; document.exitPointerLock(); UI.show('end');
}

// ---------- per-frame ----------
let birdT = 1, ambT = 14;
function update(dt) {
  gameTime += dt;
  runTimers();

  if (input.lookX || input.lookY) lookBy(-input.lookX * 2.7 * dt, -input.lookY * 2.0 * dt);
  input.setBreathVisible(F.breathUI && !F.dead);
  if (shake > 0.25) input.rumble(shake * 0.55, shake * 0.4, 140);
  if (P.mode === 'walk' && !F.cutscene && !F.dead) movePlayer(dt);
  else { P.vel.set(0, 0, 0); P.speed = 0; UI.stamina(1, false); }
  updateCamera(dt);
  updateInteract();
  updateChase(dt);

  // echo footsteps behind you
  for (let i = echoes.length - 1; i >= 0; i--) {
    if (gameTime >= echoes[i]) { echoes.splice(i, 1); if (F.echo) sfx.footstep(0.2, panFor(tmp.set(P.pos.x + 6, 1, P.pos.z)), 0.6); }
  }

  // breath / hiding
  if (P.mode === 'hide' && !F.dead) {
    const holding = !!keys.Space || input.breath;
    if (holding) P.breath -= dt / 8.5; else P.breath = Math.min(1, P.breath + dt / 3);
    if (F.breathCheck) {
      if (holding) F.grace = Math.max(F.grace, 0.45); else { F.grace -= dt; if (F.grace <= 0) { sfx.gasp(); caught(); } }
      if (P.breath <= 0) { sfx.gasp(); caught(); }
    }
    if (!holding) { P.breathT -= dt; if (P.breathT <= 0) { sfx.breath(P.inhale, E.visible ? 0.14 : 0.08); P.inhale = !P.inhale; P.breathT = 1.25; } }
    if (E.visible && !F.chase) { P.hb = (P.hb ?? 0) - dt; if (P.hb <= 0) { sfx.heartbeat(0.6); P.hb = 0.42; } }
  }
  UI.breath(P.breath, F.breathUI && !F.dead, P.breath < 0.3);

  if (nlBase > 0 && !F.flicker) nlMult(nlBase * (0.93 + 0.07 * Math.sin(gameTime * 0.9)));
  // light flicker
  if (F.flicker) {
    if (W.bathSpot.intensity > 0) W.bathSpot.intensity = BATH_I * (0.82 + Math.sin(gameTime * 23) * 0.08 + (Math.random() < 0.03 ? -0.7 : 0));
    nlMult(Math.random() < 0.15 ? 0 : 0.25, false);
  }

  // ambience
  if (F.birds) { birdT -= dt; if (birdT <= 0) { sfx.chirp((Math.random() - 0.5) * 1.6); birdT = 0.5 + Math.random() * 2.4; } }
  if (F.phase === 'night' && !F.chase && !F.echo && !F.dead && P.mode !== 'hide') {
    ambT -= dt;
    if (ambT <= 0) {   // the house does more every night
      ambT = (12 + Math.random() * 14) / (0.6 + 0.4 * F.night); const r = Math.random(), pan = (Math.random() - 0.5) * 1.6;
      if (r < 0.4) sfx.creak(0.18, pan); else if (r < 0.6) sfx.knock(pan * 0.6, 0.12); else if (F.night >= 2 && r < 0.8) sfx.ceilingThump(); else if (F.night >= 2) sfx.slamFar(pan); else sfx.creak(0.2, pan);
    }
  }

  // family idle
  if (mom.group.visible) {
    mom.update(gameTime, dt); dad.update(gameTime, dt);
    for (const p of [mom, dad]) {
      const g = p.group.position, near = Math.hypot(P.pos.x - g.x, P.pos.z - g.z) < 4.5;
      p.lookAt = near ? camera.position : null;
      if (near && !p.busy) {
        const want = Math.atan2(P.pos.x - g.x, P.pos.z - g.z);
        p.group.rotation.y = lerpAngle(p.group.rotation.y, want, Math.min(1, dt * 3));
      }
    }
  }
  WF.update(dt); dust.update(dt);
  E.update(dt);
  UI.crosshair(P.mode === 'walk' && !F.cutscene);
}

let last = performance.now(), titleT = 0, frameN = 0;
function loop(now) {
  requestAnimationFrame(loop);
  input.poll();
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (started) { if (!paused && !window.__freeze) update(dt); }
  else {
    titleT += dt;
    camera.position.set(-6 + Math.sin(titleT * 0.05) * 3, 2.0 + Math.sin(titleT * 0.3) * 0.05, -22 + Math.cos(titleT * 0.05) * 2);
    camera.lookAt(1, 1.6, -4);
    E.update(dt);
  }
  // the shadow maps are re-rendered only when something can have changed: the sun and moon every third frame (the people move slowly), the
  // bathroom spot only while it is lit, the headlights only while the car passes (see windowface.js)
  frameN++; W.sun.shadow.autoUpdate = false; W.bathSpot.shadow.autoUpdate = false;
  if (frameN % 3 === 0) W.sun.shadow.needsUpdate = true;
  if (W.bathSpot.intensity > 0) W.bathSpot.shadow.needsUpdate = true;
  if (!window.__norender) gfx.render(dt);
}

UI.makeGrain();
titleScene();
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('mobile').classList.add('show');
$('loading').classList.add('done');
requestAnimationFrame(loop);
window.__game = { WF, carPass, faceAtWindow, gfx, sfx, P, F, W, E, camera, scene, renderer, setPhase, nlMult, BATH_I, mom, dad, BUNK_SEAT, BUNK_LIE, UI, cam: () => { updateCamera(0); E.update(0.016); }, start: () => { started = true; uiMode = 'test'; UI.hide('title'); }, get gameTime() { return gameTime; } };
