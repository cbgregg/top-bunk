// The portrait cut (9:16, about 22 s) for Shorts, Reels and TikTok, edited on its own rather than cropped. It plays as a tape a kid shot
// on the family camcorder: one hand-held lens at a kid's eye height, the date stamp, captions that read with the sound off, hard cuts.
// It opens on the thing rising over the top bunk, rewinds to moving day, and ends with it shoving you off the bunk; the last frame is its
// eyes over the mattress, the first frame again, so the clip loops. The full grin is kept for the hook, the bunk and the scare.
import { V3, clamp, lerp, ease, aim, xyz, lerpAngle, BATH_I } from './lib.js';

const FOV = 70, EYE = 1.05;   // one lens (vertical fov; tighter framing is the camcorder's digital zoom), a kid holding it at eye height
const T = (list) => { let t = 0; for (const s of list) { s.t = +t.toFixed(3); t += s.dur; } return list; };

// ---------- the operator ----------
// smooth noise in -1..1: a hand drifts and corrects, it does not swing like a pendulum
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
const vnoise = (t, s) => { const i = Math.floor(t), f = t - i, u = f * f * (3 - 2 * f); return lerp(hash(i + s * 71.3), hash(i + 1 + s * 71.3), u) * 2 - 1; };
const fbm = (t, s) => vnoise(t, s) * 0.62 + vnoise(t * 2.17 + 5.1, s + 13) * 0.28 + vnoise(t * 4.9 + 1.7, s + 29) * 0.1;
// a quick correction that overshoots a little and settles (0 -> 1 over about a fifth of a second)
const settle = (d) => (d <= 0 ? 0 : d > 0.45 ? 1 : 1 - Math.exp(-d / 0.05) * Math.cos(d * 2 * Math.PI / 0.3));
// a: aim wander (rad), f: how fast it wanders, roll, pos: how far the hands drift (m), step/bob: footfalls, tremor: fear in the fingers,
// refr: how big the operator's small re-framing corrections are
const HANDS = {
  still: { a: 0.0012, f: 0.3, roll: 0.0008, pos: 0.001 },
  hold: { a: 0.012, f: 0.8, roll: 0.007, pos: 0.006, refr: 1 },
  hide: { a: 0.0055, f: 0.45, roll: 0.003, pos: 0.0025, tremor: 0.0035, refr: 0.5 },
  walk: { a: 0.01, f: 0.9, roll: 0.007, pos: 0.006, step: 0.58, bob: 0.016, refr: 1 },
  run: { a: 0.013, f: 1.7, roll: 0.024, pos: 0.01, step: 0.31, bob: 0.042 },
};
// every 1.2-2.5 s the aim is nudged back to where the kid wants it: half a degree to a degree and a half, with a small overshoot
function reframe(st, seed) {
  let yaw = 0, pitch = 0, prev = [0, 0];
  for (let k = 0, t = 0.9 + hash(seed * 5.3) * 0.7; t <= st && k < 40; k++, t += 1.2 + hash(seed * 2.1 + k * 1.7) * 1.3) {
    const to = [(hash(seed * 9.1 + k * 3.3) * 2 - 1) * 0.012, (hash(seed * 4.7 + k * 7.9) * 2 - 1) * 0.009], f = settle(st - t);
    yaw = prev[0] + (to[0] - prev[0]) * f; pitch = prev[1] + (to[1] - prev[1]) * f; prev = to;
  }
  return [yaw, pitch];
}
// footfalls at an uneven pace: seconds since the last one, and which foot (gen_music.js lays the chase's footsteps on the same pace)
function stepAt(st, period, seed) { let t = 0; for (let k = 0; k < 400; k++) { const d = period * (0.85 + hash(k * 3.7 + seed) * 0.3); if (t + d > st) return { since: st - t, k }; t += d; } return { since: 0, k: 0 }; }
// o.t: the operator's own clock when it is not the shot's (the end card and the last shot run on into the first, so the hands carry over the loop)
function hand(c, kind, o) {
  const st = o.t ?? c.st, s = c.shot.seed || 1, H = HANDS[kind];
  let yaw = fbm(st * H.f, s) * H.a + Math.sin(st * 0.37 + s) * H.a * 0.8, pitch = fbm(st * H.f * 1.13, s + 3) * H.a * 0.85 + Math.sin(st * 0.29 + s * 2) * H.a * 0.6;
  let roll = fbm(st * H.f * 0.7, s + 7) * H.roll, dx = fbm(st * 0.6, s + 11) * H.pos, dy = fbm(st * 0.7, s + 17) * H.pos;
  if (H.tremor) { yaw += fbm(st * 7.3, s + 23) * H.tremor; pitch += fbm(st * 8.1, s + 31) * H.tremor; }
  if (H.refr) { const [ry, rp] = reframe(st, s); yaw += ry * H.refr; pitch += rp * H.refr; }
  if (kind === 'hide' && !o.held) { pitch += Math.sin(st * 1.7) * 0.0025; dy += Math.sin(st * 1.7) * 0.004; }   // breathing under the covers
  if (H.step && o.moving !== false) { const { since, k } = stepAt(st, H.step, s), e = Math.exp(-since * 11); dy -= H.bob * e; pitch -= H.bob * 0.45 * e; roll += (k % 2 ? 1 : -1) * H.roll * 0.5 * (1 - Math.exp(-since * 5)); }
  // a flinch: a hard knock that rings out (jolts: [[seconds into the shot, size, roll and pitch scale]])
  for (const [t0, a, big = 1] of c.shot.jolts || []) { if (c.st < t0) continue; const d = c.st - t0, j = a * Math.exp(-d * 7) * Math.sin(d * 24); pitch += j * 0.028 * big; yaw += j * 0.018 * (hash(t0 + s) > 0.5 ? 1 : -1); roll += j * 0.012 * big; dy -= j * 0.008; }
  return { yaw, pitch, roll, dx, dy };
}
// where the operator holds the camera, what they point it at and how; o.zoom is the digital zoom (it crops the same lens, shake and all).
// o.yaw / o.pitch offset the aim: the kid rarely puts it dead centre
function shoot(c, pos, look, kind = 'hold', o = {}) {
  const p = xyz(pos), a = aim(p, look), j = hand(c, kind, o), z = o.zoom || 1;
  c.cam.pos = [p[0] + j.dx, p[1] + j.dy, p[2]]; c.cam.look = null; c.cam.sway = 0;
  c.cam.yaw = a.yaw + (o.yaw || 0) + j.yaw; c.cam.pitch = a.pitch + (o.pitch || 0) + j.pitch; c.cam.roll = (o.roll || 0) + j.roll;
  c.cam.fov = 2 * Math.atan(Math.tan(FOV * Math.PI / 360) / z) * 180 / Math.PI; c.zoom = z;
}
// motion blur for a stretch of a shot: [from, to, exposures]... (the rest of the shot is one exposure)
const smear = (...spans) => (st) => { for (const [a, b, n] of spans) if (st >= a && st < b) return n; return 1; };

// ---------- the house, per frame ----------
const EXPOSURE = { day: 0.8, night: 1.0, morning: 0.85, title: 0.95 };   // setPhase's own values
// night lights (the game re-pulses them every update; set here they hold for the frame), exposure with the camcorder hunting
// (hunt: [how far over it opens at the cut, settle time in s]), a focus miss (blur, px at 360 wide), a colour cast (grade, css), the dust,
// contrast (the film grade's; harder for the scare's first frames) and streak ([x, y] px of blur along one axis, for a whip pan or a fall)
function stage(c, o = {}) {
  const g = c.game, st = c.st;
  if (o.nl !== undefined) g.nlMult(o.nl, false);
  const hunt = o.hunt ? 1 + (o.hunt[0] - 1) * Math.exp(-st / o.hunt[1]) : 1;
  g.renderer.toneMappingExposure = (EXPOSURE[c.F.phase] ?? 1) * hunt * (o.expo || 1);
  const u = g.gfx.pass && g.gfx.pass.grade && g.gfx.pass.grade.uniforms; if (u) u.contrast.value = o.contrast ?? 1.04;
  g.gfx.night = g.gfx.nightGoal ?? g.gfx.night;   // (the grade eases its night tint in over seconds, as for a player; a cut is a cut)
  c.canvas ??= document.querySelector('#game canvas');
  if (c.canvas) c.canvas.style.filter = [o.blur > 0.05 ? `blur(${(o.blur * innerWidth / 360).toFixed(2)}px)` : '', o.grade || '', c.ui.streak(o.streak)].join(' ').trim() || 'none';
  c.dust ??= g.scene.children.find((x) => x.isPoints && x.material.uniforms && x.material.uniforms.alpha) || null;
  if (c.dust) { const a = o.dust ?? 0.08; c.dust.visible = a > 0; c.dust.material.uniforms.alpha.value = a; }
  c.zoom = 1;
}
const torch = (c, i) => { const f = c.camera.children.find((x) => x.isSpotLight); if (f) f.intensity = i; c.F.flashOn = i > 0; };
// hold a door at an exact angle (0 shut, 1 open) for this frame; the game's own door motion is too quick for a door that closes itself
const doorTo = (c, name, a) => { const d = c.W.doors[name]; if (!d) return; d.a = a; d.target = a; d.apply(); };
// a caption from `from` to `to` seconds into the shot, at height y (a share of the frame), put where the picture is empty.
// y is the middle of the text; its bottom edge stays above 0.655: below that the platforms lay their own names, descriptions and buttons
// over the picture (a line of caption is about 0.043 of the height)
const cap = (c, text, y, from = 0, to = 1e9, o) => { if (c.st >= from && c.st < to) c.ui.caption(text, 1, Math.min(y, 0.655 - 0.0216 * text.split('\n').length), o); };
// move the thing so its head is at p (its pose stays as the game last drew it)
function headTo(c, p) { for (let k = 0; k < 2; k++) { c.E.headWorld(c.head); c.E.root.position.x += p[0] - c.head.x; c.E.root.position.y += p[1] - c.head.y; c.E.root.position.z += p[2] - c.head.z; } c.E.headWorld(c.head); }
// aim one of its arms at a point (after the game has posed it): side 'L' or 'R', w how far
function armTo(c, side, to, w = 1) {
  const r = c.E.rig; if (!r || w < 0.01) return;
  for (const [a, b] of [['_UpperArm', '_Forearm'], ['_Forearm', '_Hand']]) { const bone = r.bones[side + a], p = bone.getWorldPosition(new V3()); r.aim(bone, r.bones[side + b], new V3(...to).sub(p).normalize(), w); }
}

// the camcorder's stamp: the date and the clock run with the shot; each take jumps to its own time on the tape.
// o.rec: REC and the tape counter too (only where the recording itself is the point: the first and last shots)
// o.tracking: [from, to] (or a list of them) seconds of a torn tracking band, where the tape was spliced or knocked
// o.zoomUntil: the zoom readout shows while the rocker is in use, then goes, as it does on the camera
const pad2 = (n) => String(n).padStart(2, '0');
const tapeTime = (tp) => `${Math.floor(tp / 3600)}:${pad2(Math.floor(tp / 60) % 60)}:${pad2(tp % 60)}`;
const spans = (s) => (!s ? [] : Array.isArray(s[0]) ? s : [s]);
function osd(date, [h, m, s, pm], tape, o = {}) {
  return (c) => {
    const e = Math.floor(c.st), sec = s + e, mm = m + Math.floor(sec / 60), tp = tape + e, tr = spans(o.tracking).some(([a, b]) => c.st >= a && c.st < b);
    return { rec: !!o.rec, blink: Math.floor(c.st * 1.6) % 2 === 0, counter: tapeTime(tp), tracking: tr ? 1 : 0, trackSeed: Math.floor(c.st * 97) + tape,
      stamp: `${date}\n${h + Math.floor(mm / 60)}:${pad2(mm % 60)}:${pad2(sec % 60)} ${pm ? 'PM' : 'AM'}`, zoom: c.zoom > 1.04 && c.st < (o.zoomUntil || 0) ? `x${c.zoom.toFixed(1)}` : '' };
  };
}

// the TV picture, drawn here (over the game's own snow) so the figure in it can be closer in the second take. off: seconds since the set
// switched itself off; then the picture collapses to a line and the dark glass shows what is standing behind the kid
function snow(c, fig, scale, off = -1) {
  const fx = c.W.tvFx, tex = fx.plane.material.map, cv = tex.image, g = cv.getContext('2d'), W = cv.width, H = cv.height;
  fx.figure = 0;
  if (off >= 0) { crt(g, W, H, off); fx.light.intensity = off < 0.05 ? fx.base * 1.6 : 0; tex.needsUpdate = true; return; }
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
// the dark glass is a mirror: the room faint behind, the kid holding the camcorder up (its red light on), and over the kid's shoulder,
// small and faint, the eyes and the grin. It has to read as a reflection of something behind you, not a face drawn on the screen
function crt(g, W, H, off) {
  g.save(); g.filter = 'none'; g.globalAlpha = 1; g.globalCompositeOperation = 'source-over'; g.fillStyle = '#07080a'; g.fillRect(0, 0, W, H);
  if (off < 0.05) {   // the picture squeezed into one bright line
    const lg = g.createLinearGradient(0, H / 2 - 6, 0, H / 2 + 6); lg.addColorStop(0, 'rgba(200,215,255,0)'); lg.addColorStop(0.5, 'rgba(235,242,255,1)'); lg.addColorStop(1, 'rgba(200,215,255,0)');
    g.fillStyle = lg; g.fillRect(W * 0.04, H / 2 - 6, W * 0.92, 12); g.restore(); return;
  }
  const a = clamp((off - 0.08) / 0.2, 0, 1);
  // the room behind the kid, lit by the night lights, picked up faintly by the curved glass
  const room = g.createRadialGradient(W * 0.5, H * 0.45, W * 0.05, W * 0.5, H * 0.5, W * 0.62);
  room.addColorStop(0, `rgba(104,120,150,${0.62 * a})`); room.addColorStop(0.6, `rgba(62,74,98,${0.45 * a})`); room.addColorStop(1, `rgba(24,28,38,${0.25 * a})`);
  g.fillStyle = room; g.fillRect(0, 0, W, H);
  // the kid: head and shoulders against it, the camcorder held up in front of the face, slightly left of centre
  const kx = W * 0.45, ky = H * 0.6;
  g.filter = 'blur(1.2px)'; g.globalAlpha = 0.92 * a; g.fillStyle = '#030405';
  g.beginPath(); g.ellipse(kx + W * 0.02, ky - H * 0.04, W * 0.075, H * 0.13, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.moveTo(kx - W * 0.3, H); g.quadraticCurveTo(kx - W * 0.25, ky + H * 0.13, kx + W * 0.02, ky + H * 0.12); g.quadraticCurveTo(kx + W * 0.28, ky + H * 0.13, kx + W * 0.33, H); g.closePath(); g.fill();
  g.fillRect(kx - W * 0.06, ky - H * 0.09, W * 0.12, H * 0.1);
  g.filter = 'blur(0.4px)'; g.globalAlpha = a; g.fillStyle = '#ff2a18'; g.beginPath(); g.arc(kx + W * 0.045, ky - H * 0.065, 1.3, 0, Math.PI * 2); g.fill();
  // the face, up over the kid's right shoulder, small, and fainter than anything else in the glass
  const fx = W * 0.71, fy = H * 0.3, s = W * 0.042;
  g.filter = 'blur(0.8px)'; g.globalAlpha = 0.5 * a;
  for (const sx of [-1, 1]) {
    g.fillStyle = '#e8eef8'; g.beginPath(); g.ellipse(fx + sx * s * 0.95, fy, s * 0.62, s * 0.85, sx * -0.3, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#07080a'; g.beginPath(); g.ellipse(fx + sx * s * 0.95, fy + s * 0.05, s * 0.36, s * 0.42, 0, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = '#dfe6f2'; g.beginPath(); g.moveTo(fx - s * 2, fy + s * 1.1); g.quadraticCurveTo(fx, fy + s * 2.6, fx + s * 2, fy + s * 1.1); g.quadraticCurveTo(fx, fy + s * 1.8, fx - s * 2, fy + s * 1.1); g.fill();
  g.strokeStyle = '#07080a'; g.lineWidth = 0.6;
  for (let i = -6; i <= 6; i++) { const x = fx + i * s * 0.28; g.beginPath(); g.moveTo(x, fy + s * 1.25 + Math.abs(i) * 0.02 * s); g.lineTo(x, fy + s * 2.0 - Math.abs(i) * 0.08 * s); g.stroke(); }
  // the bulge of the glass catches a window of light across the top right, washing over part of the face
  g.filter = 'blur(2px)'; g.globalAlpha = a; g.globalCompositeOperation = 'lighter';
  const hl = g.createRadialGradient(W * 0.78, H * 0.18, 1, W * 0.74, H * 0.22, W * 0.3); hl.addColorStop(0, 'rgba(120,135,160,0.35)'); hl.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = hl; g.fillRect(0, 0, W, H);
  g.restore();
}

// the hook's pose: peeking over the mattress at frame 0, then up with a sway, head first (the end shot holds its first frame)
function hookPose(c, st) {
  const rise = ease.outCubic(clamp((st - 0.3) / 0.42, 0, 1)), arc = Math.sin(rise * Math.PI);
  c.E.root.position.set(6.2 + arc * 0.05, lerp(-1.02 + Math.min(st, 0.3) * 0.03, -0.62, rise), 1.5);
  c.E.lean = 0.1 * rise + 0.1 * arc;
  c.E.tilt = lerp(0.04, 0.62, ease.out(clamp((st - 1.45) / 0.09, 0, 1)));
}
const HOOK_CAM = [[6.22, 1.95, 2.92], [6.3, 1.35, 1.4]], SCARE_TOP = [6.22, 1.95, 2.92];
const hookSetup = (c) => { c.g.night(); c.g.thing({ x: 6.2, y: -1.02, z: 1.5, yaw: 0, tilt: 0, smile: 1.05 }); c.g.lookNow(HOOK_CAM[0]); c.P.pos.set(6.13, 0, 3.02); };
const END_DUR = 1.4, EYES_DUR = 0.8, SUN_AT = [6.3, 1.25, 3.3];

export const PORTRAIT_SHOTS = T([
  // the hook: lying on the top bunk, something is already looking over the edge of the mattress; it rises and tilts its head
  { id: 'p_hook', dur: 2.1, seed: 3, jolts: [[1.45, 1]], shutter: smear([1.42, 1.75, 4]), osd: osd('OCT 20 2004', [3, 13, 2], 31 * 60 + 52, { rec: true }),
    setup: hookSetup,
    update(c) {
      hookPose(c, c.st); c.g.lookNow(HOOK_CAM[0]);   // (it stares into the lens from the first frame; the last frame of the cut has the same stare)
      doorTo(c, 'kid', 1); stage(c, { nl: 1, dust: 0 });
      shoot(c, ...HOOK_CAM, 'hide');
      cap(c, 'never take\nthe top bunk', 0.62);   // (on the quilt, under the face)
    } },
  // the tape winds back to the first day: the hook plays backwards at four times speed under the search bands while the counter spins down
  { id: 'p_cut1', dur: 0.45, seed: 3,
    osd: (c) => ({ rew: true, search: c.st, counter: tapeTime(Math.round(lerp(31 * 60 + 54, 2 * 60 + 31, ease.inOut(clamp(c.st / 0.4, 0, 1))))) }),
    setup: hookSetup,
    update(c) {
      const hst = Math.max(0, 2.05 - c.st * 4.4);
      hookPose(c, hst); c.g.lookNow(HOOK_CAM[0]); doorTo(c, 'kid', 1);
      stage(c, { nl: 1, dust: 0, blur: 0.5, grade: 'saturate(0.55) contrast(1.12) brightness(1.08)' });
      shoot(c, ...HOOK_CAM, 'hide', { t: hst });
    } },
  // the story: one caption a take, the house in the order you meet it
  { id: 'p_day', dur: 1.4, seed: 5, osd: osd('OCT 13 2004', [4, 18, 22, true], 2 * 60 + 31, { tracking: [0, 0.12] }),
    setup(c) { c.g.phase('day'); c.g.person('mom', { visible: false }); c.g.person('dad', { visible: false }); c.W.moveTeddy(6.6, 1.79, 3.15); c.P.pos.set(-8, 0, -9); c.g.sunPatch(48, SUN_AT); },
    update(c, k) {
      c.g.sunPatch(48, SUN_AT);   // (the low afternoon sun through the window, across the top bunk: the first day is the brightest, warmest shot)
      stage(c, { dust: 0.14, expo: 1.55, grade: 'saturate(1.3) contrast(1.04)' });
      shoot(c, [lerp(7.15, 7.05, k), EYE, lerp(-0.1, 0.12, k)], [6.15, 1.25, 3.1], 'walk');
      cap(c, 'i got the top bunk', 0.21);   // (on the wall above the bunk, clear of the bear)
    } },
  // the lights cut out for a third of a second; when they come back it is much closer, dead still, and only its eyes show
  { id: 'p_hall', dur: 2.5, seed: 8, jolts: [[1.5, 0.9]], shutter: smear([1.5, 1.72, 4]), osd: osd('OCT 14 2004', [2, 51, 7], 7 * 60 + 44, { zoomUntil: 1.45 }),
    setup(c) { c.g.night(); c.g.thing({ x: 1.7, z: -0.92, yaw: Math.PI / 2, tilt: 0, smile: 1.05 }); c.P.pos.set(7.6, 0, -0.9); c.head = new V3(); },
    update(c) {
      const st = c.st, out = st >= 1.2 && st < 1.5, near = st >= 1.5;
      c.E.root.position.x = near ? 4.3 : 1.7; c.E.visible = !out; c.E.tilt = 0;
      c.E.smile.visible = !near;
      c.E.headWorld(c.head);
      stage(c, { nl: out ? 0 : 1, dust: 0.1, expo: out ? 0.04 : 1, streak: st >= 1.5 && st < 1.72 ? [1.5, 7 * (1 - (st - 1.5) / 0.22)] : null });
      // a zoom rocker runs at one speed and stops dead; after the lights come back the kid jerks the camera up to its face, a little off
      const z = 1 + 0.9 * clamp((st - 0.05) / 0.9, 0, 1), up = near ? ease.out(clamp((st - 1.5) / 0.16, 0, 1)) : 0;
      shoot(c, [7.55, EYE, -0.9], [lerp(1.7, c.head.x, up), lerp(1.85, c.head.y - 0.12, up), -0.92], 'hold', { zoom: z, yaw: lerp(0.022, -0.04, up) });
      cap(c, 'it waits at the\nend of our hall', 0.6);
    } },
  // two shuffled steps up to the drawing, stopping a little short and low, and the aim corrected up
  { id: 'p_drawing', dur: 1.9, seed: 13, osd: osd('OCT 15 2004', [3, 6, 41], 11 * 60 + 20),
    setup(c) { c.g.night(); c.W.drawingMat.map = c.W.T.drawing1; c.W.drawingMat.needsUpdate = true; c.P.pos.set(5.6, 0, -1.1); },
    update(c) {
      const st = c.st, step = (a) => ease.inOut(clamp((st - a) / 0.32, 0, 1)), z = -1.32 + 0.08 * step(0.08) + 0.07 * step(0.64);
      torch(c, 1.2); stage(c, { nl: 1, dust: 0.06, hunt: [2.2, 0.2], blur: Math.max(0, 1.4 - st * 4) });
      shoot(c, [5.62, 1.12, z], [5.6, 0.93, -0.36], 'walk', { moving: st < 0.98, pitch: -0.009 * (1 - settle(st - 1.08)) });
      cap(c, "i didn't draw this", 0.62, 0, 1e9, { kid: true });
    } },
  // the caption runs across both takes of the set, so there is time to read it
  { id: 'p_tv_a', dur: 1.1, seed: 17, osd: osd('OCT 16 2004', [3, 0, 14], 16 * 60 + 5),
    setup(c) { c.g.night(); c.W.tvFx.set(true); c.P.pos.set(1.4, 0, -3.2); },
    update(c) { stage(c, { nl: 1, dust: 0.08 }); snow(c, 0.6, 1); shoot(c, [1.45, 0.92, -3.18], [2.71, 0.7, -3.27], 'hold', { yaw: -0.03 }); cap(c, "the tv isn't\nplugged in", 0.62); } },
  // closer, the figure in the snow bigger; then the set switches itself off, and in the dark glass it is standing behind the kid
  { id: 'p_tv_b', dur: 1.55, seed: 19, jolts: [[0.04, 0.4], [1.18, 0.9, 1.6]], shutter: smear([1.16, 1.45, 4]), osd: osd('OCT 16 2004', [3, 0, 52], 16 * 60 + 43),
    setup(c) { c.g.night(); c.W.tvFx.set(true); c.P.pos.set(1.9, 0, -3.2); },
    update(c) {
      const st = c.st, off = st >= 0.97 ? st - 0.97 : -1;
      stage(c, { nl: off >= 0.05 ? 0.55 : 1, dust: 0.05, blur: st < 0.2 ? 1.6 * (1 - st / 0.2) : 0 });
      snow(c, 1, 1.35 + st * 0.12, off);
      shoot(c, [1.98, 0.86, -3.24], [2.71, 0.69, -3.27], 'hold');
      cap(c, "the tv isn't\nplugged in", 0.62, 0, 0.97);
    } },
  // from the top bunk, one take: the door swings shut by itself and the latch clicks; a held breath; then it opens again, and it is behind
  // the door, half of its face round the edge and one hand curled round the frame. The camera finds it late.
  { id: 'p_door', dur: 2.3, seed: 23, jolts: [[0.46, 0.5], [1.42, 0.7]], teaser: 0.25, osd: osd('OCT 18 2004', [2, 47, 30], 23 * 60 + 40),
    setup(c) { c.g.night(); c.g.thing({ x: 7.28, y: -0.62, z: -0.8, face: [6.4, 2.7], tilt: 0, lean: 0.4, smile: 1.1 }); c.P.pos.set(6.3, 0, 2.8); c.head = new V3(); },
    update(c) {
      const st = c.st, SHUT = 0.45, OPEN = 0.95;
      doorTo(c, 'kid', st < SHUT ? 0.55 * (1 - ease.in(clamp((st - 0.02) / 0.43, 0, 1))) : st < OPEN ? 0 : 0.74 * ease.out(clamp((st - OPEN) / 0.5, 0, 1)));
      c.E.visible = st >= OPEN; c.E.smile.visible = false; c.E.tilt = 0; c.E.lean = 0.4 + 0.06 * ease.inOut(clamp((st - 1.5) / 0.6, 0, 1));   // (not before it opens: its hand and the glow of its eye show through a shut door)
      c.E.headWorld(c.head);
      stage(c, { nl: 1.3, dust: 0.06 }); c.g.fear(0.6);
      const find = ease.inOut(clamp((st - OPEN - 0.42) / 0.3, 0, 1)), door = [7.05, 1.1, -0.3], face = [c.head.x - 0.12, c.head.y - 0.3, c.head.z];
      shoot(c, [6.4, 2.02, 2.7], [lerp(door[0], face[0], find), lerp(door[1], face[1], find), lerp(door[2], face[2], find)], 'hide', { zoom: 1.4 });
      cap(c, 'then it\nopens again', 0.5, 0.75, 1e9, { left: 0.06, w: 0.46, align: 'left' });   // (on the dark of the door)
    },
    post(c) { if (c.E.visible) armTo(c, 'L', [7.53, 1.55, -0.22]); } },   // (already holding the frame when the door opens)
  // the game itself: under the covers on the top bunk, holding your breath while it stands over you, seen through a slit in the blanket.
  // its head jerks down on the heartbeats and holds dead still in between; on the fourth it darts at the slit, and the tape cuts
  { id: 'p_bunk', dur: 2.85, seed: 31, jolts: [[2.7, 0.5]], osd: osd('OCT 20 2004', [3, 12, 41], 31 * 60 + 13),
    setup(c) { c.g.night(); c.g.thing({ x: 6.5, z: 0.85, mode: 'walk', speed: 0.7, tilt: 0, smile: 1.05 }); c.P.pos.set(6.13, 0, 3.02); c.head = new V3(); },
    update(c) {
      const st = c.st, from = [6.5, 0.85], to = [6.14, 1.28], HELD = 1.0, snap = (t0) => ease.out(clamp((st - t0) / 0.07, 0, 1));
      const jab = ease.out(clamp((st - 2.68) / 0.1, 0, 1));
      // where its root is at time s (the camera aims where its head was a moment ago)
      const at = (s) => { const w = clamp(s / 0.8, 0, 1), j = ease.out(clamp((s - 2.68) / 0.1, 0, 1)); return [lerp(from[0], to[0], w), lerp(from[1], to[1], w) + 0.16 * j]; };
      const [x, z] = at(st), w = clamp(st / 0.8, 0, 1), turn = ease.inOut(clamp((st - 0.6) / 0.5, 0, 1)), lean = ease.inOut(clamp((st - 0.9) / 1.1, 0, 1));
      c.E.root.position.set(x, 0, z); c.E.mode = w < 1 ? 'walk' : 'idle'; c.E.root.rotation.y = lerpAngle(Math.atan2(to[0] - from[0], to[1] - from[1]), 0, turn);
      c.E.lean = 0.12 * lean + 0.035 * snap(1.56) + 0.035 * snap(2.12) + 0.1 * jab; c.E.smileScale = 1.05 + 0.15 * lean + 0.1 * jab; c.E.tilt = 0;
      c.E.headWorld(c.head);
      const [lx, lz] = at(st - 0.22), b = Math.sin(Math.min(st, HELD) * 1.7);
      stage(c, { nl: 1, dust: 0 }); c.g.fear(0.8);
      // its face sits low in the slit, so the ridge of the blanket hides the bottom of the grin: the full face is kept for the scare
      shoot(c, [6.13, 1.9, 3.02], [c.head.x + lx - x, c.head.y - 0.05, c.head.z + lz - z], 'hide', { held: st > HELD, yaw: 0.06, pitch: -0.1 });
      c.ui.quilt({ lift: 0.03 + 0.012 * (1 + b) / 2, glow: 0.6 + 0.3 * lean + 0.1 * jab });   // the slit rises and falls with the breath, and freezes when it stops
      cap(c, st < 1.0 ? 'hold your breath' : "hold your breath\nit can't see you", 0.62, 0.2, 2.2);
    } },
  // the run: down the hall, its shadow filling the end wall, the whip pan back, and it is right there coming at you with its hands out
  { id: 'p_chase', dur: 2.0, seed: 37, shutter: smear([0, 0.8, 3], [1.15, 1.5, 3]), osd: osd('OCT 23 2004', [3, 31, 9], 38 * 60 + 27),
    setup(c) { c.g.night({ spot: BATH_I }); c.g.thing({ x: 1.7, z: -0.95, mode: 'run', speed: 1.2, tilt: 0, smile: 1.1 }); c.head = new V3(); },
    update(c) {
      const st = c.st, run = clamp(st / 0.75, 0, 1), x = lerp(4.3, 6.5, ease.out(run)), back = ease.inOut(clamp((st - 1.15) / 0.36, 0, 1)), lunge = ease.in(clamp((st - 1.5) / 0.5, 0, 1));
      const gap = st < 1.5 ? lerp(2.6, 1.75, clamp(st / 1.5, 0, 1)) : lerp(1.75, 1.05, lunge);
      // it runs bent over, and comes down at you: its face never towers straight above the lens, where the smile stops reading as a face
      c.E.root.position.set(x - gap, -0.55 * back, -0.93); c.E.faceTowards(x, -0.9, 1); c.E.mode = lunge < 0.4 ? 'run' : 'idle'; c.E.reach = 0; c.E.lean = 0.3 + 0.25 * back; c.E.tilt = 0;
      c.E.smile.visible = false;   // (eyes and a shape: the grin is the scare's)
      c.E.headWorld(c.head); c.back = back; c.lunge = lunge;
      // the night lights low, so the hall light throws its shadow up the end wall; when the kid turns, it is a shape against that light
      stage(c, { nl: back > 0.5 ? 0.6 : 0.3, dust: 0.06, streak: st >= 1.15 && st < 1.5 ? [Math.sin(clamp((st - 1.15) / 0.36, 0, 1) * Math.PI) * 9, 0] : null }); c.g.fear(1);
      // the face comes in a third of the way down the frame, under the date (aimed just under its head, and up to it as it closes in:
      // aimed any lower, the eyes rise into the date and out of the top)
      const ahead = [x + 3, 1.2, -0.9], behind = [c.head.x, c.head.y - lerp(0.15, -0.02, lunge), c.head.z], a1 = aim([x, EYE, -0.9], ahead), a2 = aim([x, EYE, -0.9], behind);
      const over = back < 1 ? 0 : Math.exp(-(st - 1.51) * 6) * Math.sin((st - 1.51) * 14) * 0.12;   // the turn overshoots and comes back
      shoot(c, [x, EYE, -0.9], ahead, run < 1 ? 'run' : 'hold', { yaw: lerpAngle(0, a2.yaw - a1.yaw, back) + over + 0.05 * back, pitch: (a2.pitch - a1.pitch) * back });
      if (st > 1.7) c.g.shake(0.6);
      cap(c, "it's faster than me", 0.62, 0.1, 1.15);
    },
    // its hands come up at the lens, one ahead of the other (arms pointed at a wide lens fly out to the edges like a mannequin's)
    post(c) {
      const k = Math.max(c.back > 0.6 ? 0.35 : 0, c.lunge || 0), [x] = xyz(c.cam.pos);
      armTo(c, 'L', [x - 0.3, 0.86, -1.08], k * 0.9); armTo(c, 'R', [x - 0.42, 0.78, -0.72], k);
    } },
  { id: 'p_cut2', dur: 0.6, black: true, noRender: true, osd: osd('OCT 23 2004', [3, 31, 11], 38 * 60 + 29), setup() {}, update(c) { c.zoom = 1; } },
  // the scare, where the drawing said: back on the top bunk, its face comes up over the edge, stopping short of the lens so the black head
  // frames its eyes and teeth; its hands come up; it shoves, and the camera goes over the side. It lands on the floor tipped over, looking
  // up past the bunk's rail at it lying where the kid was, head over the edge, arms hanging, tilting its head. Then the tape is gone.
  { id: 'p_scare', dur: 1.3, seed: 41, jolts: [[0.37, 1.2, 3]], shutter: smear([0.37, 0.62, 3]), osd: osd('OCT 23 2004', [3, 32, 40], 39 * 60 + 58, { tracking: [0.62, 0.71] }),
    setup(c) { c.g.night(); c.g.thing({ x: 6.24, y: -0.6, z: 2.0, yaw: 0, tilt: 0, lean: 0.35, smile: 1.3 }); c.g.lookNow(SCARE_TOP); c.P.pos.set(6.13, 0, 3.02); c.head = new V3(); },
    update(c) {
      const st = c.st, SHOVE = 0.37, LAND = 0.62, reach = ease.out(clamp((st - 0.2) / 0.14, 0, 1));
      if (st < LAND) {
        // up over the edge in two or three frames; no head tilt here, the shove is the move
        const up = ease.outCubic(clamp((st + 0.045) / 0.105, 0, 1));
        // a metre from the lens: the face fills about two thirds of the width with dark room round the black head, not the whole frame
        c.E.root.rotation.set(0, 0, 0); c.E.lean = 0.35; c.E.reach = reach; c.E.tilt = 0; c.E.smileScale = 1.15 + 0.05 * up + 0.1 * reach;
        headTo(c, [6.24, lerp(1.58, 1.76, up), lerp(1.86, 1.97, up)]);
      } else {
        // where the kid was: lying on the top bunk, its head over the edge, arms drifting down at the camera on the floor, the head tilting
        const b = st - LAND, k = ease.inOut(clamp(b / 0.68, 0, 1));
        c.E.root.rotation.set(-Math.PI / 2, Math.PI, 0); c.E.lean = 0.75; c.E.reach = 0.6 + 0.35 * k; c.E.smileScale = 1.45;
        c.E.tilt = lerp(-0.1, 0.5, k);
        headTo(c, [6.2, 1.36 - 0.07 * k, 2.4]);
      }
      // the first frames after the silence are the hardest in the cut: true black, the whites clipping, the exposure kicking and settling
      const kick = Math.exp(-st / 0.05), fall = st >= SHOVE && st < LAND ? (st - SHOVE) / (LAND - SHOVE) : -1;
      stage(c, st < SHOVE ? { nl: 0.3, dust: 0, expo: 1.2 * (1 + 0.2 * kick), contrast: 1.1 + 0.16 * kick } : st < LAND ? { nl: 1.0, dust: 0, streak: [2, Math.sin(fall * Math.PI) * 10] } : { nl: 1.45, dust: 0 });
      // on the floor the camcorder's lamp points up at it: the black body and the hanging arms read against the dark, lit from below
      torch(c, st < LAND ? 0 : 3.5);
      c.g.fear(1);
      const floor = [6.28, 0.14, 1.98];
      // eyes a third of the way down the frame; then the camera dips as its hands come up at the lens
      if (st < SHOVE) shoot(c, SCARE_TOP, [c.head.x, c.head.y - 0.08, c.head.z], 'hide', { held: true, pitch: -0.08 * ease.inOut(clamp((st - 0.22) / 0.13, 0, 1)) });
      else if (st < LAND) {
        // the fall: off the edge, tumbling over backwards and round, the floor coming up
        const k = fall, d = ease.out(k), a0 = aim(SCARE_TOP, [6.24, 1.45, 2.2]), a1 = aim(floor, [6.2, 1.5, 2.4]);
        shoot(c, [lerp(SCARE_TOP[0], floor[0], d), lerp(SCARE_TOP[1], floor[1], k * k), lerp(SCARE_TOP[2], floor[2], d)], [0, 0, 0], 'hold');
        c.cam.yaw = lerp(a0.yaw, a1.yaw, ease.inOut(k)); c.cam.pitch = lerp(a0.pitch, a1.pitch, ease.inOut(k)) + Math.sin(k * Math.PI) * 0.6; c.cam.roll = lerp(0, 0.45, ease.in(k));
      } else {
        // tipped on the floor (not on its end), one bounce and it settles, still running
        const b = st - LAND, bounce = Math.exp(-b * 9) * Math.sin(b * 30) * 0.05;
        shoot(c, [floor[0], floor[1] + Math.max(0, bounce), floor[2]], [c.head.x, c.head.y - 0.12, c.head.z], 'still', { roll: 0.45 + bounce * 2, pitch: bounce });
      }
    },
    // its hands come up over the edge of the mattress at the lens, either side of the face, before the shove; on the floor they hang down
    // from the bunk toward the camera
    post(c) {
      const st = c.st, reach = ease.out(clamp((st - 0.2) / 0.14, 0, 1));
      if (st < 0.62) { armTo(c, 'L', [5.98, 1.9, 2.8], reach); armTo(c, 'R', [6.48, 1.88, 2.8], reach); }
      else { const k = ease.inOut(clamp((st - 0.62) / 0.68, 0, 1)); armTo(c, 'L', [6.12, 0.2, 2.15 - 0.1 * k], 0.9); armTo(c, 'R', [6.5, 0.3, 2.25], 0.75); }
    } },
  // the title in the kid's crayon, written on over the dark room the tape began in (c.opts.linkInBio / c.opts.cta pick the line for the platform)
  { id: 'p_end', dur: END_DUR, seed: 3, camcorder: false, setup: hookSetup,
    update(c) {
      const o = c.opts || {}, web = o.cta === 'web', kick = `<span class="kick">${web ? 'a horror game' : 'a horror game for PC'}</span>`;
      const line = kick + (web ? 'play it free in your browser<br>link in bio' : o.linkInBio ? 'wishlist on Steam<br>link in bio' : 'wishlist on Steam');
      hookPose(c, 0); c.g.lookNow(HOOK_CAM[0]); c.g.eyes(0); c.E.smile.visible = false; doorTo(c, 'kid', 1);
      stage(c, { nl: 0, dust: 0, expo: 0.24 });
      shoot(c, ...HOOK_CAM, 'hide', { t: c.st - END_DUR - EYES_DUR });
      c.ui.card({ kid: 'TOP BUNK', reveal: c.st / 0.2, line, alpha: 1 });
    } },
  // and the tape starts over: in the dark, two eyes switch on over the edge of the mattress, where the first frame finds them
  { id: 'p_eyes', dur: EYES_DUR, seed: 3, osd: osd('OCT 20 2004', [3, 13, 1], 31 * 60 + 51, { rec: true }),
    setup: hookSetup,
    update(c) {
      const st = c.st; hookPose(c, 0); c.g.lookNow(HOOK_CAM[0]);
      c.g.eyes(st < 0.3 ? 0 : st < 0.34 ? 0.9 : st < 0.39 ? 0 : 2.2); c.E.smile.visible = st >= 0.39;   // (brighter than built: the room is dark and so is the exposure)
      doorTo(c, 'kid', 1); stage(c, { nl: 0, dust: 0, expo: 0.32 });
      shoot(c, ...HOOK_CAM, 'hide', { t: st - EYES_DUR });
    } },
]);
export const PORTRAIT_DURATION = +PORTRAIT_SHOTS.reduce((a, s) => a + s.dur, 0).toFixed(3);
