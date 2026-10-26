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
const BUNK_SEAT = new V3(2.7, 2.24, 4.42);
const BUNK_LIE = new V3(2.7, 1.9, 4.55);
const LADDER_MID = new V3(4.1, 1.55, 4.42);
const LADDER_FLOOR = new V3(4.3, 0, 4.42);
const BUNK_SIDE = new V3(2.75, 0, 3.02);
const HALL_DOOR = new V3(0, 0, 3.3);       // the hall in front of your door
const HALL_MOUTH = new V3(0, 0, -1.3);     // where the hall opens into the living room

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
  pos: new V3(-2.7, 0, -10.2), vel: new V3(), yaw: Math.PI, pitch: 0, roll: 0, mode: 'walk',
  cam: new V3(), stamina: 1, exhausted: false, carrying: null, stepAcc: 0, bob: 0, speed: 0,
  breath: 1, breathT: 0, inhale: true,
};
const F = { phase: 'title', boxes: 0, momReady: false, talkedMom: false, splashed: false, chase: false, echo: false, dead: false, cutscene: false, morningReady: false, pushStart: false, flashOn: false, breathCheck: false, breathUI: false, grace: 0, birds: false, flicker: false };
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
document.addEventListener('mousemove', (e) => {
  if (document.pointerLockElement !== canvas || paused || F.cutscene) return;
  if (!(P.mode === 'walk' || P.mode === 'bunk' || P.mode === 'hide')) return;
  P.yaw -= e.movementX * 0.0022; P.pitch = clamp(P.pitch - e.movementY * 0.0022, -1.45, 1.45);
});
function lock() { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* noop */ } }
document.addEventListener('pointerlockchange', () => {
  const locked = document.pointerLockElement === canvas;
  if (locked && uiMode === 'pause') { uiMode = 'playing'; paused = false; UI.hide('pause'); sfx.resume(); }
  else if (!locked && uiMode === 'playing') { uiMode = 'pause'; paused = true; UI.show('pause'); sfx.suspend(); for (const k in keys) keys[k] = false; }
});
$('pause').addEventListener('click', lock);
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
function setPhase(p) {
  F.phase = p;
  const day = p === 'day', night = p === 'night' || p === 'title', morn = p === 'morning';
  gfx.setPhase(p);
  scene.fog = day ? new THREE.Fog(0xa9c2d6, 35, 190) : p === 'title' ? new THREE.FogExp2(0x03050a, 0.03) : night ? new THREE.FogExp2(0x060a14, 0.055) : new THREE.Fog(0xe8dcc6, 30, 170);
  W.hemi.color.set(day ? 0xcfe0ff : night ? 0x4f6190 : 0xffe6c4);
  W.hemi.groundColor.set(day ? 0x5a4a35 : night ? 0x0a0a10 : 0x6a5238);
  W.hemi.intensity = day ? 0.8 : p === 'title' ? 0.35 : night ? 0.38 : 1.1;
  W.sun.color.set(day ? 0xfff1dc : night ? 0x8ea6ff : 0xffd2a0);
  W.sun.intensity = day ? 3.2 : p === 'title' ? 0.6 : night ? 0.5 : 2.6;
  if (day) W.sun.position.set(40, 45, -30); else if (night) W.sun.position.set(-60, 50, 40); else W.sun.position.set(55, 18, 5);
  W.stars.visible = W.moon.visible = night;
  W.winMat.map = day ? W.T.winDay : night ? W.T.winNight : W.T.winMorning;
  W.winMat.color.set(night ? 0x8899bb : 0xffffff); W.winMat.needsUpdate = true;
  for (const k in W.bulbs) { const b = W.bulbs[k]; const on = day; b.light.visible = on || k === 'bath'; b.light.intensity = on ? b.base * 0.7 : 0; b.dome.material.emissiveIntensity = on ? 2 : 0; }
  W.fills.forEach((f, i) => {
    f.visible = !night;
    if (day) { f.color.set(0xdde8ff); f.intensity = 0.9; }
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
  renderer.toneMappingExposure = day ? 1.0 : night ? 1.4 : 1.05;
  mom.group.visible = dad.group.visible = day;
  if (sfx.ctx) {
    sfx.wind(day ? 0.035 : night ? 0.06 : 0.025, 2);
    sfx.drone(p === 'night' ? 0.05 : p === 'title' ? 0.03 : 0, 3);
    sfx.hum(p === 'night' ? 0.012 : 0, 2);
    sfx.tension(0, 1);
    sfx.bed('music/moving_day', day ? 0.5 : 0, 3);
    sfx.bed('music/night', night ? 0.4 : 0, 3);
    sfx.bed('music/morning', morn ? 0.45 : 0, 3);
    sfx.bed('music/chase', 0, 1);
    sfx.bed('sfx/music_box', night ? 0.7 : 0, 4);
  }
}

// ---------- interactables ----------
const interacts = [];
const addI = (o) => interacts.push(o);
W.pickups.forEach((b) => addI({ obj: b, r: 2.2, label: 'Pick up the box', when: () => F.phase === 'day' && !P.carrying && b.parent === W.yard, act: () => pickUp(b) }));
addI({ obj: W.drawingMesh, r: 2.3, label: 'Look at the drawing', when: () => F.phase !== 'morning', act: lookDrawing });
addI({ obj: mom.head, r: 2.6, label: 'Talk to Mom', when: () => F.phase === 'day' && mom.group.visible, act: talkMom });
addI({ obj: dad.head, r: 2.6, label: 'Talk to Dad', when: () => F.phase === 'day' && dad.group.visible, act: talkDad });
addI({ p: new V3(3.9, 1.0, 4.42), r: 1.6, label: 'Climb into the top bunk', when: () => F.phase === 'day' || F.phase === 'night', act: climbUp });
addI({ p: W.bathSink, r: 1.9, label: 'Splash water on your face', when: () => F.phase === 'night' && !F.splashed, act: splash });

function updateInteract() {
  let label = null, act = null;
  if (!F.cutscene && !F.dead) {
    if (P.mode === 'bunk') {
      if (F.phase === 'morning') { if (F.morningReady) { label = 'Climb down'; act = () => { F.pushStart = true; }; } }
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
  UI.prompt(label ? `<b>E</b> ${label}` : null);
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
  camera.remove(b); W.house.add(b); b.position.set(spot.x, 0.22, spot.z); b.rotation.set(0, (Math.random() - 0.5) * 0.6, 0);
  P.carrying = null; F.boxes++; sfx.thump();
  if (F.boxes < 3) UI.objective(`Carry your boxes to your room <span>${F.boxes} / 3</span>`);
  if (F.boxes === 1) UI.subtitle('<i>Top bunk is yours. The bottom one is for boxes.</i>', 4);
}
function lookDrawing() {
  if (F.phase === 'night') UI.subtitle("<i>It's different now. The figure is next to the bed... and the kid is falling.</i>", 5.5);
  else UI.subtitle("<i>The last kid drew this. A tall black shape with huge white eyes and a big smile. \"HE WATCHES.\"</i>", 6);
  sfx.creak(0.12, 0.6, 0.4);
}
// subtitle + recorded voice; returns how long the line is held (the longer of the subtitle time and the audio)
function speak(id, html, dur) { const d = sfx.say(id); (id.startsWith('mom') ? mom : dad).talk(sfx.envelope('vo/' + id)); const t = Math.max(dur, d + 0.4); UI.subtitle(html, t); return t; }
function talkMom() {
  if (!F.momReady) { speak('mom/boxes_first', '<b>Mom:</b> Boxes first, kiddo. Then you can explore.', 3.5); return; }
  if (!F.talkedMom) F.talkedMom = true;
}
const dadLines = [
  ['dad/line_1', '<b>Dad:</b> Three boxes with your name on them. Go on.'],
  ['dad/line_2', "<b>Dad:</b> Landlord says the place has \"character.\" I think that means creaky floors."],
  ['dad/line_3', '<b>Dad:</b> End of the hall, bud. Can\'t miss it.'],
];
let dadIdx = 0;
function talkDad() { const l = F.boxes >= 3 ? ['dad/mom_looking', '<b>Dad:</b> Your mom\'s looking for you.'] : dadLines[dadIdx++ % dadLines.length]; speak(l[0], l[1], 4); }
function splash() { sfx.splash(); UI.subtitle('<i>The water is ice cold.</i>', 3); F.splashed = true; }

// ---------- bunk ----------
async function climbUp() {
  if (F.cutscene) return;
  F.cutscene = true; P.mode = 'cine';
  P.cam.copy(camera.position);
  const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch, hiding = F.chase;
  sfx.creak(0.25, 0);
  await tween(0.32, (k) => { P.cam.lerpVectors(from, LADDER_MID, k); P.yaw = lerpAngle(y0, Math.PI / 2, k); P.pitch = lerp(p0, 0.3, k); });
  sfx.footstep(0.2, 0, 0.1);
  if (hiding) { chase.approach = [new V3(4.25, 0, 3.1), BUNK_SIDE.clone()]; }
  const dest = hiding ? BUNK_LIE : BUNK_SEAT;
  await tween(0.42, (k) => { P.cam.lerpVectors(LADDER_MID, dest, k); P.yaw = lerpAngle(Math.PI / 2, 0, k); P.pitch = lerp(0.3, hiding ? 0.15 : -0.1, k); });
  F.cutscene = false;
  if (hiding || F.chase) {
    P.mode = 'hide'; UI.blanket(true); sfx.whoosh(0); UI.objective('Stay quiet.');
  } else P.mode = 'bunk';
}
async function climbDown() {
  if (F.cutscene) return;
  F.cutscene = true; P.mode = 'cine'; P.cam.copy(camera.position);
  const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch;
  sfx.creak(0.25, 0);
  await tween(0.4, (k) => { P.cam.lerpVectors(from, LADDER_MID, k); P.yaw = lerpAngle(y0, Math.PI / 2, k); P.pitch = lerp(p0, 0.1, k); });
  const end = new V3(LADDER_FLOOR.x, 1.32, LADDER_FLOOR.z);
  await tween(0.35, (k) => { P.cam.lerpVectors(LADDER_MID, end, k); P.yaw = lerpAngle(Math.PI / 2, 0.3, k); P.pitch = lerp(0.1, 0, k); });
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
  const f = (keys.KeyW || keys.ArrowUp ? 1 : 0) - (keys.KeyS || keys.ArrowDown ? 1 : 0);
  const s = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let wx = fx * f + rx * s, wz = fz * f + rz * s; const wl = Math.hypot(wx, wz);
  if (wl > 0) { wx /= wl; wz /= wl; }
  const sprint = (keys.ShiftLeft || keys.ShiftRight) && wl > 0 && f > 0 && !P.carrying && !P.exhausted && P.stamina > 0.01;
  const speed = P.carrying ? 1.9 : sprint ? 4.7 : 2.5;
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
  if (room === 'out') sfx.grassStep(vol); else sfx.footstep(vol, 0, room === 'bath' ? 0.3 : 0.15, room !== 'bath');
  if (F.echo) echoes.push(gameTime + 0.27 + Math.random() * 0.06);
}
function updateCamera(dt) {
  if (P.mode === 'walk') {
    const bobY = Math.sin(P.bob) * 0.035 * Math.min(1, P.speed / 2.5);
    camera.position.set(P.pos.x, EYE + bobY, P.pos.z);
  } else camera.position.copy(P.cam);
  if (P.mode === 'hide') {
    P.yaw = clamp(angDiff(0, P.yaw), -0.55, 0.55); P.pitch = clamp(P.pitch, -0.35, 0.4);
    camera.position.y += Math.sin(gameTime * (keys.Space ? 0.6 : 2.4)) * 0.006;
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
function lookingBack() { camera.getWorldDirection(fwd); return fwd.z < -0.55; }   // toward the living room end of the hall

async function reveal() {
  E.visible = true; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0; E.smileScale = 1;
  E.root.position.copy(HALL_MOUTH); E.root.rotation.y = 0; E.lookTarget = camera.position;
  sfx.stinger(); shake = 0.35;
  F.flicker = true;
  await tween(0.55, (k) => { W.bathSpot.intensity = Math.random() < k ? BATH_I : BATH_I * 0.05; nlMult(Math.random() < k ? 0 : 1, false); }, ease.lin);
  W.bathSpot.intensity = BATH_I; nlMult(0.2, false);
  UI.objective('<b class="red">RUN.</b> Get back to bed');
  sfx.tension(0.03, 0.4);
  await tween(1.0, (k) => { E.tilt = k * 0.55; });
  sfx.giggle(panFor(E.root.position));
}
function startChase() {
  chase = { trail: [], approach: [], last: P.pos.clone(), t0: gameTime, stepAcc: 0, hb: 0, arrived: false };
  const room = roomAt(P.pos.x, P.pos.z);
  // if you're already in your room, it follows through the door
  if (room === 'bed') chase.trail.push(HALL_DOOR.clone(), new V3(1.0, 0, 3.3));
  chase.trail.push(P.pos.clone());
  F.chase = true; E.mode = 'run';
  sfx.drone(0.09, 0.5);
  sfx.bed('music/chase', 0.6, 0.6); sfx.bed('music/night', 0, 1.5); sfx.bed('sfx/music_box', 0, 1);
  UI.hint('Hold <b>Shift</b> to sprint', 3);
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

async function hideScript() {
  UI.hint('Hold <b>SPACE</b> to hold your breath', 7);
  F.breathUI = true;
  await waitFor(() => chase.arrived);
  F.chase = false; E.mode = 'idle';
  F.breathCheck = true; F.grace = 1.3;
  sfx.tension(0.045, 1); sfx.bed('music/chase', 0, 2);
  const y0 = E.root.rotation.y;
  await tween(1.6, (k) => { E.root.rotation.y = lerpAngle(y0, 0, Math.min(1, k * 2)); E.lean = k * 0.35; E.tilt = 0.55 - k * 0.95; });
  sfx.whisper(panFor(E.root.position), 0.16);
  await tween(2.6, (k) => { E.tilt = -0.4 + Math.sin(k * Math.PI) * 0.8; E.smileScale = 1 + k * 0.18; });
  sfx.giggle(0);
  await wait(2.2);
  F.breathCheck = false;
  UI.hint(null);
  await tween(1.2, (k) => { E.lean = 0.35 * (1 - k); E.root.rotation.y = lerpAngle(0, -Math.PI / 2, k); E.smileScale = 1.18 - 0.18 * k; });
  E.mode = 'walk'; E.speed = 0.6;
  const from = E.root.position.clone(), to = HALL_DOOR.clone();
  await tween(3.2, (k) => { E.root.position.lerpVectors(from, to, k); }, ease.lin);
  E.visible = false; E.mode = 'idle';
  sfx.tension(0, 3); sfx.drone(0.035, 4);
  W.bathSpot.intensity = 0; F.flicker = false;
  await wait(2.5);
  UI.subtitle('<i>You stay under the blanket until the window turns grey.</i>', 4.5);
  await wait(2.0);
  UI.fade(1, 3); await wait(3.6);
  F.breathUI = false; UI.blanket(false); UI.breath(1, false);
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

function retry() {
  UI.hide('death'); uiMode = 'playing'; lock();
  F.dead = false; F.cutscene = false; F.chase = false; F.echo = false; F.breathCheck = false; F.breathUI = false; F.flicker = false;
  setPhase('night');
  E.visible = false; E.reach = 0; E.lean = 0; E.smileScale = 1; E.tilt = 0;
  P.mode = 'walk'; P.pos.set(0, 0, -0.2); P.yaw = Math.PI; P.pitch = 0; P.roll = 0; P.vel.set(0, 0, 0);
  P.stamina = 1; P.exhausted = false; P.breath = 1; shake = 0;
  F.splashed = true;
  UI.fade(0, 1.5); UI.objective('Go back to bed');
  chaseScript();
}

// ---------- story ----------
function titleScene() {
  setPhase('title');
  E.visible = true; E.mode = 'idle'; E.root.position.set(1.5, 0, -17); E.lookTarget = camera.position;
  E.faceTowards(-9, -26);
}

async function startGame() {
  if (started) return;
  sfx.init(); started = true; uiMode = 'playing';
  UI.hide('title'); lock();
  E.visible = false; E.lookTarget = null;
  UI.fade(1, 0.01);
  if (DEBUG === 'night' || DEBUG === 'chase') { await nightScript(); return; }
  if (DEBUG === 'morning') { await morningScript(); await endingScript(); return; }
  await dayScript();
  await nightScript();
}

async function dayScript() {
  setPhase('day');
  P.pos.set(-2.7, 0, -10.2); P.yaw = Math.PI; P.pitch = 0.02; P.mode = 'walk';
  mom.group.position.set(-1.4, 0, -2.9); mom.group.rotation.y = Math.PI / 2;
  dad.group.position.set(-0.9, 0, -13.4); dad.group.rotation.y = -0.5;
  await wait(0.3);
  UI.fade(0, 2.5); UI.card('Saturday', 'Moving day', 3.5);
  F.birds = true;
  await wait(2.6);
  speak('dad/welcome', "<b>Dad:</b> Welcome home, bud! Grab your boxes off the truck behind you. Your room's at the very end of the hall.", 6.5);
  UI.objective('Carry your boxes to your room <span>0 / 3</span>');
  UI.hint('<b>WASD</b> move &nbsp;·&nbsp; <b>Shift</b> sprint &nbsp;·&nbsp; <b>E</b> interact', 8);
  await waitFor(() => F.boxes >= 3);
  await wait(0.8);
  UI.subtitle("<i>That's the last one.</i>", 3);
  UI.objective('Find Mom in the kitchen');
  dad.group.position.set(1.7, 0, -3.9); dad.group.rotation.y = -Math.PI / 2;
  F.momReady = true;
  await waitFor(() => F.talkedMom);
  F.cutscene = true; P.vel.set(0, 0, 0);
  mom.head.getWorldPosition(tmp);
  const y0 = P.yaw, want = Math.atan2(-(tmp.x - P.pos.x), -(tmp.z - P.pos.z));
  tween(0.8, (k) => { P.yaw = lerpAngle(y0, want, k); P.pitch = lerp(P.pitch, 0.18, k); });
  UI.objective(null);
  await wait(speak('mom/helper', "<b>Mom:</b> There's my helper. All unpacked?", 3.5) + 0.3);
  await wait(speak('mom/landlord', '<b>Mom:</b> The landlord said the last family left in a real hurry. Left half their things behind.', 5) + 0.3);
  await wait(speak('dad/cheap', "<b>Dad:</b> Can't imagine why. Cheapest rent in the county.", 3.8) + 0.3);
  await wait(speak('mom/teeth', '<b>Mom:</b> Okay, mister. Teeth, then bed. Big day tomorrow.', 4) + 0.2);
  UI.fade(1, 2.5); await wait(3);
  F.birds = false; F.cutscene = false;
}

async function nightScript() {
  setPhase('night');
  P.mode = 'bunk'; P.cam.copy(BUNK_SEAT); P.yaw = 0.25; P.pitch = -0.18; P.roll = 0;
  UI.card('2:47 AM', 'Night one', 4.5);
  await wait(2.5); UI.fade(0, 3);
  await wait(2.0);
  sfx.creak(0.3, -0.6);
  UI.subtitle('<i>You really, really need to pee.</i>', 4);
  later(3.5, carPass); later(10.5, faceAtWindow);
  await wait(1.2);
  UI.objective('Go to the bathroom at the end of the hall');
  UI.hint('<b>E</b> climb down', 6);
  if (DEBUG === 'chase') { P.mode = 'walk'; P.pos.set(0, 0, -0.2); P.yaw = Math.PI; F.splashed = true; UI.objective('Go back to bed'); await chaseScript(); return; }
  await waitFor(() => P.mode === 'walk' && roomAt(P.pos.x, P.pos.z) === 'hall');
  later(2.5, () => { if (!F.splashed) sfx.knock(panFor(new V3(-0.6, 1.5, 3.0)), 0.25); });
  await waitFor(() => P.pos.z > 0.5 && P.pos.z < 1.9 && Math.abs(P.pos.x) < 0.7);
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
  await chaseScript();
}

async function chaseScript() {
  F.echo = false;
  await waitFor(() => P.mode === 'walk' && roomAt(P.pos.x, P.pos.z) === 'hall');
  F.echo = true; const t0 = gameTime;
  sfx.tension(0.012, 3);
  later(2.4, () => { if (F.echo) UI.subtitle("<i>Those aren't your footsteps.</i>", 3.5); });
  await waitFor(() => P.pos.z > 2.4 || (lookingBack() && gameTime - t0 > 1.1) || gameTime - t0 > 16);
  F.echo = false;
  await reveal();
  startChase();
  await waitFor(() => P.mode === 'hide');
  await hideScript();
  await morningScript();
  await endingScript();
}

async function morningScript() {
  setPhase('morning');
  E.visible = false; E.lean = 0; E.reach = 0; E.smileScale = 1; F.chase = false;
  P.mode = 'bunk'; P.cam.copy(BUNK_SEAT); P.yaw = 0.15; P.pitch = -0.12; P.roll = 0;
  F.birds = true;
  UI.card('6:58 AM', 'Morning', 4);
  await wait(2.4); UI.fade(0, 3); await wait(2.6);
  await wait(speak('mom/breakfast', "<b>Mom:</b> Breakfast's ready! Come on down, sleepyhead!", 4.5) + 0.3);
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
  await tween(1.6, (k) => { P.yaw = lerpAngle(y0, Math.PI, k); P.pitch = lerp(p0, 0.02, k); });
  E.visible = true; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0.35; E.smileScale = 1; E.lookTarget = camera.position;
  E.root.position.set(2.7, -2.6, 5.12); E.root.rotation.y = Math.PI;
  sfx.drone(0.07, 2); sfx.tension(0.025, 2);
  await wait(0.3);
  await tween(2.8, (k) => { E.root.position.y = -2.6 + 2.6 * k; P.pitch = lerp(0.02, 0.1, k); }, ease.out);
  await tween(1.5, (k) => { E.smileScale = 1 + k * 0.35; E.tilt = 0.35 - k * 0.35; });
  sfx.tension(0.06, 0.2);
  await wait(0.6);
  sfx.whoosh(0);
  await tween(0.16, (k) => { E.reach = k; }, ease.lin);
  sfx.shove(); shake = 0.6;
  const start = BUNK_SEAT.clone(), end = new V3(2.7, 0.26, 2.9), pitch0 = P.pitch;
  await tween(0.62, (k) => {
    P.cam.set(start.x, lerp(start.y, end.y, k * k), lerp(start.z, end.z, Math.min(1, k * 1.4)));
    P.pitch = lerp(pitch0, 1.02, k); P.roll = lerp(0, 0.42, k);
    E.lean = 0.62 * k;
  }, ease.lin);
  sfx.thud(); sfx.ring(); shake = 1.4; UI.flash('rgba(120,0,0,0.6)', 1.6); UI.blur(6, 0.05);
  sfx.tension(0, 0.2); sfx.drone(0.03, 2);
  await wait(0.2); UI.blur(1.5, 2.5);
  await tween(2.4, (k) => { E.tilt = Math.sin(k * Math.PI) * 0.5; E.smileScale = 1.35 + k * 0.1; });
  sfx.whoosh(0); E.visible = false;
  await wait(1.2);
  UI.fade(1, 2); await wait(2.6);
  UI.blur(0, 0.1);
}

async function endingScript() {
  await wait(0.8);
  await wait(speak('mom/thump', '<b>Mom:</b> Honey? What was that thump?', 3.5) + 0.5);
  await wait(speak('mom/again', '<b>Mom:</b> Did you fall out of bed <i>again</i>?', 3.5) + 0.7);
  await wait(speak('mom/bottom_bunk', '<b>Mom:</b> Maybe you should sleep on the bottom bunk tonight.', 4) + 1);
  uiMode = 'end'; document.exitPointerLock(); UI.show('end');
}

// ---------- per-frame ----------
let birdT = 1, ambT = 14;
function update(dt) {
  gameTime += dt;
  runTimers();

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
    const holding = !!keys.Space;
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
    ambT -= dt; if (ambT <= 0) { ambT = 12 + Math.random() * 14; if (Math.random() < 0.6) sfx.creak(0.18, (Math.random() - 0.5) * 1.6); else sfx.knock((Math.random() - 0.5), 0.12); }
  }

  // family idle
  if (mom.group.visible) {
    mom.update(gameTime, dt); dad.update(gameTime, dt);
    for (const p of [mom, dad]) {
      const g = p.group.position, near = Math.hypot(P.pos.x - g.x, P.pos.z - g.z) < 4.5;
      p.lookAt = near ? camera.position : null;
      if (near) {
        const want = Math.atan2(P.pos.x - g.x, P.pos.z - g.z);
        p.group.rotation.y = lerpAngle(p.group.rotation.y, want, Math.min(1, dt * 3));
      }
    }
  }
  WF.update(dt); dust.update(dt);
  E.update(dt);
  UI.crosshair(P.mode === 'walk' && !F.cutscene);
}

let last = performance.now(), titleT = 0;
function loop(now) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (started) { if (!paused && !window.__freeze) update(dt); }
  else {
    titleT += dt;
    camera.position.set(-9 + Math.sin(titleT * 0.05) * 3, 2.0 + Math.sin(titleT * 0.3) * 0.05, -25 + Math.cos(titleT * 0.05) * 2);
    camera.lookAt(0, 1.6, -6);
    E.update(dt);
  }
  if (!window.__norender) gfx.render(dt);
}

UI.makeGrain();
titleScene();
if (matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches) $('mobile').classList.add('show');
$('loading').classList.add('done');
requestAnimationFrame(loop);
window.__game = { WF, carPass, faceAtWindow, gfx, sfx, P, F, W, E, camera, scene, renderer, setPhase, nlMult, BATH_I, mom, dad, BUNK_SEAT, BUNK_LIE, UI, cam: () => { updateCamera(0); E.update(0.016); }, start: () => { started = true; uiMode = 'test'; UI.hide('title'); }, get gameTime() { return gameTime; } };
