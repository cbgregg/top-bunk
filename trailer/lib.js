// Shared helpers for the trailer cuts: camera maths, deterministic noise, the DOM overlays (cards, captions, camcorder, black, flash) and the
// game-state helpers that put the house, the family and the thing where a shot needs them. Everything goes through window.__game; js/ is never edited.
import * as THREE from 'three';

export const V3 = THREE.Vector3;
export const EYE_KID = 1.2;              // a child's eye height (the game's own is 1.32)
export const BATH_I = 95;                // the hall reveal spotlight, same as main.js
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const ease = {
  lin: (k) => k, inOut: (k) => k * k * (3 - 2 * k), out: (k) => 1 - (1 - k) * (1 - k), in: (k) => k * k,
  outCubic: (k) => 1 - Math.pow(1 - k, 3), inCubic: (k) => k * k * k,
};
export const mix3 = (a, b, k, out = new V3()) => out.set(lerp(a[0], b[0], k), lerp(a[1], b[1], k), lerp(a[2], b[2], k));
// a point as [x, y, z], whether it came as an array or a Vector3
export const xyz = (p) => (p.isVector3 ? [p.x, p.y, p.z] : p);
// game yaw/pitch for a camera at `from` looking at `to` (the game: forward = (-sin yaw, -cos yaw), pitch up is positive)
export function aim(from, to) {
  from = xyz(from); to = xyz(to);
  const dx = to[0] - from[0], dy = to[1] - from[1], dz = to[2] - from[2];
  return { yaw: Math.atan2(-dx, -dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)) };
}
export const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
export const lerpAngle = (a, b, k) => a + angDiff(a, b) * k;
// a smooth, deterministic wobble in -1..1 (sums of incommensurate sines; `s` picks a different curve)
export function wobble(t, s = 0) {
  const o = s * 1.7;
  return (Math.sin(t * 1.31 + o) * 0.5 + Math.sin(t * 2.73 + o * 2.1 + 0.7) * 0.3 + Math.sin(t * 0.47 + o * 0.6 + 2.2) * 0.2);
}
// a seeded random (mulberry32)
export function rng(seed) { let s = seed >>> 0; return () => { s = (s + 0x6D2B79F5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// a catmull-rom path through points [[x,y,z],...]; at(k) -> V3, tangent(k) -> V3
export function path(pts) {
  const curve = new THREE.CatmullRomCurve3(pts.map((p) => new V3(...p)), false, 'centripetal');
  return { at: (k, out = new V3()) => curve.getPointAt(clamp(k, 0, 1), out), tangent: (k) => curve.getTangentAt(clamp(k, 0, 1)) };
}

// ---------- DOM overlays ----------
const CSS = `
#hud, #card, #flash, #loading, #title, #pause, #death, #end, #touch { display: none !important; }
#blanket, #pod, #fade, #vignette { transition: none !important; }
#grain { animation: none !important; }
#fade { opacity: 0 !important; }
.tr { position: fixed; inset: 0; pointer-events: none; }
#tr-black { z-index: 58; background: #000; opacity: 0; }
#tr-flash { z-index: 59; background: #fff; opacity: 0; }
#tr-lb { z-index: 56; display: none; }
#tr-lb i { position: absolute; left: 0; right: 0; background: #000; }
#tr-cards { z-index: 60; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 0 6vw; opacity: 0; }
#tr-cards .big { font-family: 'Special Elite', 'Courier Prime', monospace; font-weight: 400; color: #e9e2d0; letter-spacing: 0.12em; text-shadow: 0 0 40px rgba(0,0,0,1), 0 0 2px #000; line-height: 1.1; }
#tr-cards .small { font-family: 'Courier Prime', ui-monospace, monospace; color: #a59d8b; letter-spacing: 0.3em; text-transform: uppercase; margin-top: 1.2vh; }
#tr-cards .line { font-family: 'Special Elite', 'Courier Prime', monospace; color: #e9e2d0; letter-spacing: 0.06em; line-height: 1.35; }
#tr-cap { z-index: 60; display: flex; align-items: flex-end; justify-content: center; opacity: 0; }
#tr-cap div { font-family: 'Special Elite', 'Courier Prime', monospace; color: #f3eee2; text-align: center; text-shadow: 0 2px 6px #000, 0 0 2px #000, 0 0 18px rgba(0,0,0,0.9); line-height: 1.3; max-width: 84%; background: rgba(0,0,0,0.28); padding: 0.35em 0.6em; border-radius: 0.12em; }
#tr-cam { z-index: 57; display: none; }
#tr-cam .osd { position: absolute; left: 8%; font-family: 'Courier Prime', ui-monospace, monospace; font-weight: 700; color: #f1f1e6; letter-spacing: 0; line-height: 1.2; white-space: pre;
  text-shadow: 0.07em 0 rgba(255,48,40,0.5), -0.07em 0 rgba(60,200,255,0.45), 0 0 0.18em rgba(0,0,0,0.9); }
#tr-cam .rec { display: flex; align-items: center; gap: 0.45em; }
#tr-cam .rec i { display: inline-block; width: 0.62em; height: 0.62em; border-radius: 50%; background: #e2261b; box-shadow: 0 0 0.3em rgba(255,58,42,0.8); }
/* the portrait cut: the camcorder's own text sits under the grain like the picture; captions and the end card stay crisp on top */
.tr-portrait #grain { z-index: 58 !important; }
.tr-portrait #tr-black { z-index: 5; }
.tr-portrait #tr-cap div { position: absolute; left: 8%; width: 70%; top: 58%; transform: translateY(-50%); max-width: none; box-sizing: border-box; padding: 0; background: none; border-radius: 0;
  font-family: 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif; font-weight: 700; color: #fff; line-height: 1.2; white-space: pre-line; text-wrap: balance; letter-spacing: 0;
  -webkit-text-stroke: 0.1em #000; paint-order: stroke fill; text-shadow: 0 0.05em 0.25em rgba(0,0,0,0.75); }
.tr-portrait #tr-cards .line { font-family: 'Helvetica Neue', Arial, 'Liberation Sans', sans-serif; font-weight: 700; color: #fff; letter-spacing: 0; line-height: 1.25; margin-top: 2.2vh;
  -webkit-text-stroke: 0.08em #000; paint-order: stroke fill; }
`;
export function makeOverlays(portrait) {
  if (document.getElementById('tr-black')) return overlayApi(portrait);
  const st = document.createElement('style'); st.id = 'tr-style'; st.textContent = CSS; document.head.appendChild(st);
  const mk = (id, html = '') => { const d = document.createElement('div'); d.id = id; d.className = 'tr'; d.innerHTML = html; document.body.appendChild(d); return d; };
  mk('tr-lb', '<i style="top:0"></i><i style="bottom:0"></i>');
  mk('tr-cam', '<div class="osd rec"><i></i><span>REC</span><span class="ctr"></span></div><div class="osd zoom"></div><div class="osd stamp"></div>');
  if (portrait) document.body.classList.add('tr-portrait');
  mk('tr-black'); mk('tr-flash');
  mk('tr-cards', '<div class="big"></div><div class="small"></div><div class="line"></div>');
  mk('tr-cap', '<div></div>');
  return overlayApi(portrait);
}
function overlayApi(portrait) {
  const $ = (id) => document.getElementById(id), W = () => innerWidth, H = () => innerHeight;
  const black = $('tr-black'), flash = $('tr-flash'), cards = $('tr-cards'), cap = $('tr-cap'), cam = $('tr-cam'), lb = $('tr-lb'), grain = $('grain');
  const big = cards.querySelector('.big'), small = cards.querySelector('.small'), line = cards.querySelector('.line'), capText = cap.firstElementChild;
  const rec = cam.querySelector('.rec'), ctr = cam.querySelector('.ctr'), zoom = cam.querySelector('.zoom'), stamp = cam.querySelector('.stamp');
  // sizes in px from the viewport (so a 360-wide preview and a 1080-wide render look the same)
  const px = (f) => Math.round((portrait ? W() : H()) * f) + 'px';
  big.style.fontSize = px(portrait ? 0.13 : 0.19); big.style.letterSpacing = px(0.012); small.style.fontSize = px(portrait ? 0.028 : 0.032); line.style.fontSize = px(portrait ? 0.058 : 0.07);
  capText.style.fontSize = px(portrait ? 0.064 : 0.047); if (!portrait) cap.style.paddingBottom = Math.round(H() * 0.12) + 'px';
  // (kept clear of the platform's own buttons and text: nothing above 11% or below 75% of the height, nothing right of 80% of the width)
  for (const e of [rec, zoom, stamp]) { e.style.fontSize = px(0.036); e.style.filter = `blur(${(W() / 900).toFixed(2)}px)`; }
  rec.style.top = '11.5%'; zoom.style.top = '15.5%'; stamp.style.top = '68.5%';
  const api = {
    black: (o) => { black.style.opacity = clamp(o, 0, 1); },
    flash: (o) => { flash.style.opacity = clamp(o, 0, 1); },
    // a centred title card: {big, small, line, alpha}
    card: (o) => {
      if (!o) { cards.style.opacity = 0; return; }
      big.textContent = o.big || ''; small.textContent = o.small || ''; line.innerHTML = o.line || '';
      big.style.display = o.big ? '' : 'none'; small.style.display = o.small ? '' : 'none'; line.style.display = o.line ? '' : 'none';
      cards.style.opacity = clamp(o.alpha ?? 1, 0, 1);
    },
    caption: (text, alpha = 1) => { if (!text) { cap.style.opacity = 0; return; } capText.textContent = text; cap.style.opacity = clamp(alpha, 0, 1); },
    // the camcorder's on-screen text: {blink, counter: '0:31:12', stamp: 'OCT 20 2004\n3:12:40 AM', zoom: 'x2.0'}
    camcorder: (o) => {
      if (!o) { cam.style.display = 'none'; return; }
      cam.style.display = 'block'; rec.firstElementChild.style.opacity = o.blink === false ? 0.12 : 1;
      ctr.textContent = o.counter ? '  ' + o.counter : ''; stamp.textContent = o.stamp || ''; zoom.textContent = o.zoom || '';
    },
    letterbox: (on) => { lb.style.display = on ? 'block' : 'none'; const h = Math.round(H() * (1 - (W() / H()) / 2.39) / 2); for (const i of lb.children) i.style.height = h + 'px'; },
    grain: (x, y, alpha = 0.55) => { if (grain) { grain.style.transform = `translate(${x}%, ${y}%)`; grain.style.opacity = alpha; } },
    hideFade: () => { const f = $('fade'); if (f) { f.style.transition = 'none'; f.style.opacity = '0'; } },
  };
  return api;
}

// ---------- the game: what a shot can ask for ----------
export function gameHelpers(game) {
  const { F, P, W, E, UI, camera, scene, mom, dad, WF, nights } = game;
  const flash = camera.children.find((c) => c.isSpotLight) || null;
  let vigilOn = false;
  const H = {
    // every shot starts from the same quiet house, so the order of shots never changes what a shot shows
    reset() {
      F.cutscene = true; P.mode = 'cine'; F.dead = false; F.chase = false; F.flicker = false; F.fear = 0; F.breathCheck = false; F.scare = false;
      if (vigilOn) H.vigil(false);
      F.blackout = false;
      E.visible = false; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0; E.smileScale = 1; E.speed = 1; E.lookTarget = camera.position; E.root.scale.setScalar(1);
      UI.blanket(false); UI.pod(null); W.tvFx.set(false); W.tvFx.figure = 0; W.mirrorFx.hide(); W.phone.setRinging(false);
      if (W.hallFrame) W.hallFrame.reset();
      WF.t = -1; WF.root.visible = false; W.faceLight.intensity = 0;
      H.flashlight(false); W.bathSpot.intensity = 0;
      W.setDoor('kid', true, true); W.setDoor('bath', true, true); W.setDoor('parents', false, true); W.setDoor('room2', false, true);
      W.moveTeddy(6.83, 0.55, 3.0); if (W.teddy) W.teddy.visible = true;
      mom.busy = dad.busy = true; mom.lookAt = dad.lookAt = null; mom.pose = dad.pose = null;
    },
    // lighting phases (setPhase recompiles shaders when the set of lights changes, so only call it on a change)
    phase(p) {
      if (F.phase !== p) game.setPhase(p, true);
      if (p === 'night') game.nlMult(1, false);
    },
    dusk() {   // the title lighting, warmed into a real dusk: a porch light on a blue evening
      H.phase('title');
      scene.fog = new THREE.FogExp2(0x0b1226, 0.02); scene.background = new THREE.Color(0x0b1226);
      W.hemi.intensity = 0.55; W.hemi.color.set(0x5c74b8); W.sun.intensity = 1.1; W.sun.color.set(0x7d8fd6); W.sun.position.set(-40, 30, 50);
      W.porchLight.intensity = 9; W.porchBulb.material.emissiveIntensity = 5;
      game.renderer.toneMappingExposure = 0.95;
    },
    night(o = {}) {
      H.phase('night');
      if (o.lights !== undefined) game.nlMult(o.lights, false);
      W.bathSpot.intensity = o.spot || 0; F.flicker = !!o.flicker;
    },
    flashlight(on) { if (flash) flash.intensity = on ? 26 : 0; F.flashOn = !!on; },
    blackout(on) {   // the power is out: every light in the house (the same look as the vigil's)
      F.blackout = on; game.nlMult(on ? 0 : 1, false);
      if (on) { W.hemi.intensity = 0.02; W.sun.intensity = 0; W.porchLight.intensity = 0; W.porchBulb.material.emissiveIntensity = 0; scene.fog = new THREE.FogExp2(0x010206, 0.09); }
      else game.setPhase('night', true);
    },
    // the thing: {x, z, face:[x, z] | yaw, mode, speed, tilt, lean, reach, smile}
    thing(o) {
      E.visible = true; E.mode = o.mode || 'idle'; E.speed = o.speed ?? 1;
      if (o.x !== undefined) E.root.position.set(o.x, o.y || 0, o.z);
      if (o.face) E.faceTowards(o.face[0], o.face[1], 1); else if (o.yaw !== undefined) E.root.rotation.y = o.yaw;
      E.tilt = o.tilt ?? 0.3; E.lean = o.lean ?? 0; E.reach = o.reach ?? 0; E.smileScale = o.smile ?? 1;
      E.lookTarget = o.look === false ? null : camera.position;
    },
    // the family
    person(who, { x, z, yaw = 0, visible = true, busy = true, look = null } = {}) {
      const p = who === 'mom' ? mom : dad;
      p.sleeping = false; p.group.rotation.order = 'XYZ'; p.group.rotation.set(0, yaw, 0); if (x !== undefined) p.group.position.set(x, 0, z);
      p.group.visible = visible; p.busy = busy; p.lookAt = look; p.pose = null; if (p.rig) p.rig.play('idle', { fade: 0.2, speed: 1 });
    },
    // the vigil (vigil.js is only reachable through the night type runner: with token 0 and F.live on, its wait never ends; nights.dawn() stops it cleanly)
    vigil(on) {
      if (on && !vigilOn) { vigilOn = true; F.live = true; F.dead = false; nights.TYPE_RUN.vigil({ type: 'vigil' }, 0); }
      else if (!on && vigilOn) { vigilOn = false; nights.dawn(0); F.script = false; F.live = false; F.blackout = false; }
    },
    windowFace(k = 0.2) { WF.face(); WF.t = k; },
    fear(v) { F.fear = Math.max(F.fear, v); },
    shake(v) { nights.D.shake(v); },
    door: (name, open) => W.setDoor(name, open, true),
    EYE: game.EYE || 1.32,
  };
  return H;
}
