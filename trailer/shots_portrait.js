// The portrait cut (9:16, about 28 s) for Shorts / Reels / TikTok: a separate edit, not a crop. It plays as a tape a kid shot on the family
// camcorder over ten nights in the house: one operator (still when hiding, flinching on a scare, stumbling in the run), one lens, a kid's
// eye height, the camcorder's own date and tape counter, and captions that tell the story with the sound off. Hard cuts only.
import { V3, BATH_I, clamp, lerp, ease, aim, xyz, lerpAngle } from './lib.js';

const FOV = 70, EYE = 1.05;   // one lens (vertical fov; tighter framing is the camcorder's digital zoom), a kid holding it at eye height
const T = (list) => { let t = 0; for (const s of list) { s.t = +t.toFixed(3); t += s.dur; } return list; };

// ---------- the operator ----------
// smooth noise in -1..1: a hand drifts and corrects, it does not swing like a pendulum
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const vnoise = (t, s) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return lerp(hash(i + s * 71.3), hash(i + 1 + s * 71.3), u) * 2 - 1; };
const fbm = (t, s) => vnoise(t, s) * 0.62 + vnoise(t * 2.17 + 5.1, s + 13) * 0.28 + vnoise(t * 4.9 + 1.7, s + 29) * 0.1;
// a: aim wander (rad), f: how fast it wanders, roll, pos: how far the hands drift (m), step/bob: footfalls, tremor: fear in the fingers
const HANDS = {
  still: { a: 0.0012, f: 0.3, roll: 0.0008, pos: 0.001 },
  hold: { a: 0.0065, f: 0.85, roll: 0.005, pos: 0.005 },
  hide: { a: 0.0024, f: 0.45, roll: 0.002, pos: 0.002, tremor: 0.0016 },
  walk: { a: 0.006, f: 0.9, roll: 0.006, pos: 0.005, step: 0.58, bob: 0.016 },
  run: { a: 0.013, f: 1.7, roll: 0.024, pos: 0.01, step: 0.31, bob: 0.042 },
};
// footfalls at an uneven pace: seconds since the last one, and which foot
function stepAt(st, period, seed) { let t = 0; for (let k = 0; k < 400; k++) { const d = period * (0.85 + hash(k * 3.7 + seed) * 0.3); if (t + d > st) return { since: st - t, k }; t += d; } return { since: 0, k: 0 }; }
function hand(c, kind, o) {
  const st = c.st, s = c.shot.seed || 1, H = HANDS[kind];
  let yaw = fbm(st * H.f, s) * H.a + Math.sin(st * 0.37 + s) * H.a * 0.8, pitch = fbm(st * H.f * 1.13, s + 3) * H.a * 0.85 + Math.sin(st * 0.29 + s * 2) * H.a * 0.6;
  let roll = fbm(st * H.f * 0.7, s + 7) * H.roll, dx = fbm(st * 0.6, s + 11) * H.pos, dy = fbm(st * 0.7, s + 17) * H.pos;
  if (H.tremor) { yaw += fbm(st * 7.3, s + 23) * H.tremor; pitch += fbm(st * 8.1, s + 31) * H.tremor; }
  if (kind === 'hide' && !o.held) { pitch += Math.sin(st * 1.7) * 0.0025; dy += Math.sin(st * 1.7) * 0.004; }   // breathing under the covers
  if (H.step && o.moving !== false) { const { since, k } = stepAt(st, H.step, s), e = Math.exp(-since * 11); dy -= H.bob * e; pitch -= H.bob * 0.45 * e; roll += (k % 2 ? 1 : -1) * H.roll * 0.5 * (1 - Math.exp(-since * 5)); }
  // a flinch: a hard knock that rings out (jolts: [[seconds into the shot, size]])
  for (const [t0, a] of c.shot.jolts || []) { if (st < t0) continue; const d = st - t0, j = a * Math.exp(-d * 7) * Math.sin(d * 24); pitch += j * 0.028; yaw += j * 0.018 * (hash(t0 + s) > 0.5 ? 1 : -1); roll += j * 0.012; dy -= j * 0.008; }
  return { yaw, pitch, roll, dx, dy };
}
// where the operator holds the camera, what they point it at and how; o.zoom is the digital zoom (it crops the same lens, shake and all)
function shoot(c, pos, look, kind = 'hold', o = {}) {
  const p = xyz(pos), a = aim(p, look), j = hand(c, kind, o), z = o.zoom || 1;
  c.cam.pos = [p[0] + j.dx, p[1] + j.dy, p[2]]; c.cam.look = null; c.cam.sway = 0;
  c.cam.yaw = a.yaw + (o.yaw || 0) + j.yaw; c.cam.pitch = a.pitch + (o.pitch || 0) + j.pitch; c.cam.roll = (o.roll || 0) + j.roll;
  c.cam.fov = 2 * Math.atan(Math.tan(FOV * Math.PI / 360) / z) * 180 / Math.PI; c.zoom = z;
}

// ---------- the house, per frame ----------
const EXPOSURE = { day: 0.8, night: 1.0, morning: 0.85, title: 0.95 };   // setPhase's own values
// night lights (the game re-pulses them every update; set here they hold for the frame), exposure with the camcorder hunting
// (hunt: [how far over it opens at the cut, settle time in s]), a focus miss (blur, px at 360 wide), the dust in the air
function stage(c, o = {}) {
  const g = c.game, st = c.st;
  if (o.nl !== undefined) g.nlMult(o.nl, false);
  const hunt = o.hunt ? 1 + (o.hunt[0] - 1) * Math.exp(-st / o.hunt[1]) : 1;
  g.renderer.toneMappingExposure = (EXPOSURE[c.F.phase] ?? 1) * hunt * (o.expo || 1);
  c.canvas ??= document.querySelector('#game canvas');
  if (c.canvas) c.canvas.style.filter = o.blur > 0.05 ? `blur(${(o.blur * innerWidth / 360).toFixed(2)}px)` : 'none';
  c.dust ??= g.scene.children.find((x) => x.isPoints && x.material.uniforms && x.material.uniforms.alpha) || null;
  if (c.dust) { const a = o.dust ?? 0.08; c.dust.visible = a > 0; c.dust.material.uniforms.alpha.value = a; }
  c.zoom = 1;
}
const torch = (c, i) => { const f = c.camera.children.find((x) => x.isSpotLight); if (f) f.intensity = i; c.F.flashOn = i > 0; };
// hold a door at an exact angle (0 shut, 1 open) for this frame; the game's own door motion is too quick for a door that closes itself
const doorTo = (c, name, a) => { const d = c.W.doors[name]; if (!d) return; d.a = a; d.target = a; d.apply(); };
const cap = (c, text, from = 0, to = 1e9) => { if (c.st >= from && c.st < to) c.ui.caption(text, 1); };

// the camcorder's stamp: the date, the clock and the tape counter run with the shot; each take jumps to its own time on the tape
const pad2 = (n) => String(n).padStart(2, '0');
function osd(date, [h, m, s, pm], tape) {
  return (c) => {
    const e = Math.floor(c.st), sec = s + e, mm = m + Math.floor(sec / 60), tp = tape + e;
    return { blink: Math.floor(c.st * 1.6) % 2 === 0, counter: `${Math.floor(tp / 3600)}:${pad2(Math.floor(tp / 60) % 60)}:${pad2(tp % 60)}`,
      stamp: `${date}\n${h + Math.floor(mm / 60)}:${pad2(mm % 60)}:${pad2(sec % 60)} ${pm ? 'PM' : 'AM'}`, zoom: c.zoom > 1.04 ? `x${c.zoom.toFixed(1)}` : '' };
  };
}

// the TV picture, drawn here (over the game's own snow) so the figure in it can be closer in the second take
function snow(c, fig, scale) {
  const fx = c.W.tvFx, tex = fx.plane.material.map, cv = tex.image, g = cv.getContext('2d'), W = cv.width, H = cv.height;
  fx.figure = 0;
  const img = g.createImageData(W, H), d = img.data, bar = Math.random() * H;
  for (let y = 0; y < H; y++) {
    const scan = y % 2 ? 0.78 : 1, roll = Math.abs(y - bar) < 5 ? 55 : 0;
    for (let x = 0; x < W; x++) { const i = (y * W + x) * 4, v = (60 + Math.random() * 150) * scan + roll; d[i] = v * 0.82; d[i + 1] = v * 0.88; d[i + 2] = v; d[i + 3] = 255; }
  }
  g.putImageData(img, 0, 0);
  if (fig > 0) {
    const hy = 30 - 22 * (scale - 1), rx = 8 * scale, ry = 10 * scale;
    g.save(); g.filter = 'blur(2px)'; g.globalAlpha = 0.7 * fig; g.fillStyle = '#060608';
    g.beginPath(); g.ellipse(W / 2, hy, rx, ry, 0, 0, Math.PI * 2); g.fill(); g.fillRect(W / 2 - 10 * scale, hy + ry - 1, 20 * scale, H); g.restore();
  }
  const r = g.createRadialGradient(W / 2, H / 2, H * 0.35, W / 2, H / 2, W * 0.6); r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, 'rgba(0,0,0,0.8)'); g.fillStyle = r; g.fillRect(0, 0, W, H);
  tex.needsUpdate = true;
}

// the scare's staging, shared with the end card (which holds its last frame)
function scarePose(c, st) {
  const push = ease.in(clamp((st - 0.45) / 0.8, 0, 1));
  c.E.root.position.set(lerp(6.2, 5.98, push), 0, -0.9); c.E.root.rotation.y = -Math.PI / 2;
  c.E.lean = 0.25; c.E.reach = lerp(0.5, 0.8, push); c.E.tilt = 0.28 + Math.sin(st * 2.3) * 0.05; c.E.smileScale = lerp(1.35, 1.55, push);
  c.E.headWorld(c.head); c.E.root.position.y += EYE + 0.04 - c.head.y; c.E.headWorld(c.head);   // it bends down to a kid's eye level, face to face
}

export const PORTRAIT_SHOTS = T([
  // the hook: lying on the top bunk, something rises over the edge of the mattress and tilts its head. Two seconds, then black.
  { id: 'p_hook', dur: 2.1, seed: 3, jolts: [[1.45, 1]], osd: osd('OCT 20 2004', [3, 13, 2], 31 * 60 + 52),
    setup(c) { c.g.night(); c.g.thing({ x: 6.2, y: -1.35, z: 1.5, yaw: 0, tilt: 0, smile: 1.05 }); c.P.pos.set(6.13, 0, 3.02); },
    update(c) {
      const st = c.st, up = ease.outCubic(clamp((st - 0.3) / 1.0, 0, 1));
      c.E.root.position.y = lerp(-1.35, -0.62, up); c.E.lean = 0.1 * up;
      c.E.tilt = lerp(0.04, 0.62, ease.out(clamp((st - 1.45) / 0.09, 0, 1)));
      doorTo(c, 'kid', 1); stage(c, { nl: 1, dust: 0 });
      shoot(c, [6.22, 1.95, 2.92], [6.3, 1.35, 1.4], 'hide');
      cap(c, 'never take\nthe top bunk');
    } },
  { id: 'p_cut1', dur: 0.35, black: true, noRender: true, osd: osd('OCT 20 2004', [3, 13, 4], 31 * 60 + 54), setup() {}, update(c) { c.zoom = 1; } },
  // the story: one caption a take, the house in the order you meet it
  { id: 'p_day', dur: 2.0, seed: 5, osd: osd('OCT 13 2004', [4, 18, 22, true], 2 * 60 + 31),
    setup(c) { c.g.phase('day'); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); c.W.moveTeddy(6.6, 1.79, 3.15); c.P.pos.set(-8, 0, -9); },
    update(c, k) { stage(c, { dust: 0 }); shoot(c, [lerp(7.15, 7.02, k), EYE, lerp(-0.1, 0.22, k)], [6.15, 1.25, 3.1], 'walk'); cap(c, 'the rent\nwas cheap'); } },
  { id: 'p_hall', dur: 2.5, seed: 8, jolts: [[1.5, 0.8]], osd: osd('OCT 14 2004', [2, 51, 7], 7 * 60 + 44),
    setup(c) { c.g.night(); c.g.thing({ x: 1.7, z: -0.92, yaw: Math.PI / 2, tilt: 0, smile: 1.05 }); c.P.pos.set(7.6, 0, -0.9); },
    update(c) {
      const st = c.st;
      if (st > 1.5) c.E.root.position.x = 2.9;   // the lights stutter out, and when they come back it is a metre closer
      c.E.tilt = lerp(0, 0.55, ease.out(clamp((st - 0.5) / 0.12, 0, 1)));
      stage(c, { nl: st > 1.38 && st < 1.5 ? 0 : 1, dust: 0.1 });
      shoot(c, [7.55, EYE, -0.9], [1.7, 1.85, -0.92], 'hold', { zoom: lerp(1, 1.9, ease.inOut(clamp(st / 1.3, 0, 1))) });
      cap(c, 'it waits at the\nend of our hall');
    } },
  { id: 'p_breakfast', dur: 1.4, seed: 11, osd: osd('OCT 14 2004', [7, 42, 18], 9 * 60 + 2),
    setup(c) { c.g.phase('morning'); c.g.person('mom', { x: 2.0, z: 1.33, yaw: Math.PI / 2 }); c.g.person('dad', { visible: false }); c.P.pos.set(-8, 0, -9); },
    update(c) { stage(c, { dust: 0 }); shoot(c, [0.75, 0.98, 0.45], [2.05, 1.3, 1.35], 'still'); cap(c, "mom says i'm\nmaking it up"); } },
  { id: 'p_drawing', dur: 1.9, seed: 13, osd: osd('OCT 15 2004', [3, 6, 41], 11 * 60 + 20),
    setup(c) { c.g.night(); c.W.drawingMat.map = c.W.T.drawing1; c.W.drawingMat.needsUpdate = true; c.P.pos.set(5.6, 0, -1.1); },
    update(c, k) {
      torch(c, 1.2); stage(c, { nl: 1, dust: 0.06, hunt: [2.2, 0.2], blur: Math.max(0, 1.4 - c.st * 4) });
      shoot(c, [5.62, 1.12, lerp(-1.32, -1.15, ease.inOut(k))], [5.6, 0.93, -0.36], 'hold');
      cap(c, 'it was already\non the wall');
    } },
  { id: 'p_tv_a', dur: 1.1, seed: 17, osd: osd('OCT 16 2004', [3, 0, 14], 16 * 60 + 5),
    setup(c) { c.g.night(); c.W.tvFx.set(true); c.P.pos.set(1.4, 0, -3.2); },
    update(c) { stage(c, { nl: 1, dust: 0.08 }); snow(c, 0.6, 1); shoot(c, [1.45, 0.92, -3.18], [2.71, 0.7, -3.27], 'hold'); cap(c, 'the tv turns on\nby itself at 3am'); } },
  { id: 'p_tv_b', dur: 1.3, seed: 19, jolts: [[0.04, 0.4]], osd: osd('OCT 16 2004', [3, 0, 52], 16 * 60 + 43),
    setup(c) { c.g.night(); c.W.tvFx.set(true); c.P.pos.set(1.9, 0, -3.2); },
    update(c) { stage(c, { nl: 1, dust: 0.05, blur: c.st < 0.2 ? 1.6 * (1 - c.st / 0.2) : 0 }); snow(c, 1, 1.35 + c.st * 0.12); shoot(c, [1.98, 0.86, -3.24], [2.71, 0.69, -3.27], 'hold'); cap(c, 'the tv turns on\nby itself at 3am'); } },
  // from the top bunk: the door shuts by itself, and then it opens again
  { id: 'p_door', dur: 2.2, seed: 23, jolts: [[2.02, 0.7]], osd: osd('OCT 18 2004', [2, 47, 30], 23 * 60 + 40),
    setup(c) { c.g.night(); c.P.pos.set(6.3, 0, 2.8); },
    update(c) {
      doorTo(c, 'kid', 1 - ease.in(clamp((c.st - 0.8) / 1.2, 0, 1)));
      stage(c, { nl: 1, dust: 0.08 });
      shoot(c, [6.4, 2.02, 2.7], [7.05, 1.05, -0.3], 'still');
      cap(c, 'my door closes\nby itself');
    } },
  { id: 'p_doorway', dur: 2.0, seed: 29, jolts: [[0.1, 0.5]], osd: osd('OCT 18 2004', [2, 48, 11], 23 * 60 + 58),
    // (stooped, standing back in the hall: it has to duck to see in under the door frame)
    setup(c) { c.g.night(); c.g.thing({ x: 7.15, y: -0.62, z: -1.0, face: [6.4, 2.7], tilt: 0, lean: 0.4, smile: 1.1 }); c.P.pos.set(6.3, 0, 2.8); },
    update(c) {
      doorTo(c, 'kid', ease.inOut(clamp(c.st / 0.9, 0, 1)) * 0.92);
      c.E.tilt = lerp(0, 0.5, ease.inOut(clamp((c.st - 0.9) / 1.0, 0, 1)));
      stage(c, { nl: 1, dust: 0.06 }); c.g.fear(0.6);
      shoot(c, [6.4, 2.02, 2.7], [7.05, 1.25, -0.3], 'hold');
      cap(c, 'then it\nopens again');
    } },
  // the game itself: under the covers on the top bunk, holding your breath while it stands over you. The longest take.
  { id: 'p_bunk', dur: 4.6, seed: 31, jolts: [[2.05, 0.35]], teaser: 1.1, osd: osd('OCT 20 2004', [3, 12, 40], 31 * 60 + 12),
    setup(c) { c.g.night(); c.UI.blanket(true); c.g.thing({ x: 7.0, z: 0.2, mode: 'walk', speed: 0.7, tilt: 0.1, smile: 1.05 }); c.P.pos.set(6.13, 0, 3.02); c.from = [7.0, 0.2]; c.to = [6.1, 1.92]; c.head = new V3(); },
    update(c) {
      const st = c.st, w = clamp(st / 2.0, 0, 1), turn = ease.inOut(clamp((st - 2.0) / 0.6, 0, 1)), lean = ease.inOut(clamp((st - 2.4) / 1.4, 0, 1));
      const wy = Math.atan2(c.to[0] - c.from[0], c.to[1] - c.from[1]);
      c.E.root.position.set(lerp(c.from[0], c.to[0], w), 0, lerp(c.from[1], c.to[1], w));
      c.E.mode = w < 1 ? 'walk' : 'idle'; c.E.root.rotation.y = lerpAngle(wy, 0, turn);
      c.E.lean = 0.18 * lean; c.E.tilt = st < 2.6 ? 0.1 : 0.1 + Math.sin((st - 2.6) * 2.4) * 0.6; c.E.smileScale = 1.05 + 0.2 * lean;
      c.E.headWorld(c.head);
      const f = ease.inOut(clamp((st - 0.25) / 2.1, 0, 1)), h = ease.inOut(clamp((st - 1.6) / 1.0, 0, 1)), p = [lerp(7.0, 6.1, f), lerp(2.15, 2.1, f), lerp(0.2, 2.1, f)];
      stage(c, { nl: 1, dust: 0 }); c.g.fear(0.8);
      shoot(c, [6.13, 1.9, 3.02], [lerp(p[0], c.head.x, h), lerp(p[1], c.head.y - 0.05, h), lerp(p[2], c.head.z, h)], 'hide', { held: st > 2.2 });
      cap(c, "hold your breath.\nit can't see you", 0.3);
    } },
  // the run: down the hall, its shadow on the end wall, the look back
  { id: 'p_chase', dur: 2.7, seed: 37, osd: osd('OCT 23 2004', [3, 31, 9], 38 * 60 + 27),
    setup(c) { c.g.night({ spot: BATH_I }); c.g.thing({ x: 1.4, z: -0.95, mode: 'run', speed: 1.2, tilt: 0.15, smile: 1.1 }); c.head = new V3(); },
    update(c) {
      const st = c.st, run = clamp(st / 1.5, 0, 1), x = lerp(3.4, 7.15, ease.out(run)), back = ease.inOut(clamp((st - 1.2) / 0.38, 0, 1)), lunge = ease.in(clamp((st - 1.6) / 1.0, 0, 1));
      const gap = st < 1.6 ? lerp(2.6, 1.7, clamp(st / 1.6, 0, 1)) : lerp(1.75, 1.35, lunge);
      // it runs bent over, and comes down at you: its face never towers straight above the lens, where the smile stops reading as a face
      c.E.root.position.set(x - gap, -0.55 * back, -0.93); c.E.faceTowards(x, -0.9, 1); c.E.mode = lunge < 0.6 ? 'run' : 'idle'; c.E.reach = 0.4 * back; c.E.lean = 0.3 + 0.25 * back; c.E.smileScale = 1.1 + 0.35 * lunge;
      c.E.headWorld(c.head);
      stage(c, { nl: back > 0.5 ? 2.2 : 0.45, dust: 0.06 }); c.g.fear(1);   // (the night lights low while it runs, so the hall light throws its shadow up the end wall)
      const ahead = [x + 3, 1.2, -0.9], behind = [c.head.x, c.head.y - 0.45, c.head.z], a1 = aim([x, EYE, -0.9], ahead), a2 = aim([x, EYE, -0.9], behind);
      const over = back < 1 ? 0 : Math.exp(-(st - 1.58) * 6) * Math.sin((st - 1.58) * 14) * 0.12;   // the turn overshoots and comes back
      shoot(c, [x, EYE, -0.9], ahead, run < 1 ? 'run' : 'hold', { yaw: lerpAngle(0, a2.yaw - a1.yaw, back) + over, pitch: (a2.pitch - a1.pitch) * back });
      if (st > 2.3) c.g.shake(0.6);
      cap(c, "it's faster\nthan you", 0.1, 1.25);
    } },
  { id: 'p_cut2', dur: 0.6, black: true, noRender: true, osd: osd('OCT 23 2004', [3, 31, 12], 38 * 60 + 30), setup() {}, update(c) { c.zoom = 1; } },
  // the scare: face to face, the biggest it ever is. One blown-out frame, the flinch, then it comes the last bit of the way.
  { id: 'p_scare', dur: 1.3, seed: 41, jolts: [[0.08, 1.6]], osd: osd('OCT 23 2004', [3, 31, 13], 38 * 60 + 31),
    setup(c) { c.g.night(); c.g.thing({ x: 6.2, z: -0.9, yaw: -Math.PI / 2, tilt: 0.28, lean: 0.25, reach: 0.5, smile: 1.35 }); c.P.pos.set(5.0, 0, -0.9); c.head = new V3(); },
    update(c) {
      const st = c.st, f = Math.floor(st * c.fps + 1e-6), pop = f === 0 || (f === 1 && c.fps >= 24);
      scarePose(c, st);
      stage(c, { nl: 1.6, dust: 0, expo: pop ? 6 : 1 }); c.ui.flash(pop ? 0.45 : 0); c.g.fear(1);
      shoot(c, [5.0, EYE, -0.9], [c.head.x, c.head.y - 0.02, c.head.z], 'hold');
    } },
  // the end card over the last frame: the title and where to go (c.opts.linkInBio / c.opts.cta pick the line for the platform)
  { id: 'p_end', dur: 1.7, noRender: true, camcorder: false,
    setup(c) { c.g.night(); c.g.thing({ x: 6.2, z: -0.9, yaw: -Math.PI / 2 }); c.head = new V3(); },
    update(c) {
      scarePose(c, 1.3); stage(c, { nl: 1.6, dust: 0 }); shoot(c, [5.0, EYE, -0.9], [c.head.x, c.head.y - 0.02, c.head.z], 'still');
      const o = c.opts || {}, line = o.cta === 'web' ? 'play it free in your browser<br>link in bio' : o.linkInBio ? 'wishlist on Steam<br>link in bio' : 'wishlist on Steam';
      c.black = 0.66; c.ui.card({ big: 'TOP BUNK', line, alpha: 1 });
    } },
]);
export const PORTRAIT_DURATION = +PORTRAIT_SHOTS.reduce((a, s) => a + s.dur, 0).toFixed(3);
