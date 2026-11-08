// Cars on the road out front: six models (assets/props/car_*.glb) that come out of the wood across the road at one end, pass the house and go
// into it at the other, in both lanes, with their own lamps lit after dark, one real headlight beam (the nearest lit car's) and a doppler pass as
// they go by. The road runs along x; the lane nearest the house carries the +x traffic.
// The road knows where you are (bind): after dark a car that meets you on it is the end of you, unseen (caught, with its horn and the skid);
// by day a car that finds you on the asphalt within 12 m brakes to a stop short of you and leans on its horn, and drives on once you are off.
// Cars keep their distance from the car ahead in their lane, so a stopped one holds up the ones behind it.
// For the story: pass() is the director's car-pass scare (timed with the headlight sweep in windowface.js); stop(x) brings a car along that
// slows and stops with its middle at x, idles there, then drives on or backs away (the neighbour's pickup at the mailbox, the car that
// waits at three); busHorn() is the school bus at 7:20, heard from the road and never drawn.
import * as THREE from 'three';
import { loadProp } from './props.js';
import { PHONE } from './gfx.js';
import { ROAD } from './world.js';

export const CAR_MODELS = ['car_sedan', 'car_sedan2', 'car_pickup', 'car_wagon', 'car_lt80', 'car_kiri'];
// the paints: faded period colours, none of them yellow (a yellow car would read as the school bus, which is never drawn)
export const COLORS = [0x8a8f96, 0x5b1d1a, 0x1f2a3a, 0xd9d3c2, 0x2d4a3a, 0x24262b, 0x7a6a4a, 0x5d6e7c];
const LANE = ROAD.lanes;
// where cars come on and go off the road: in the wood that stands across it at x ±150 (world.js roadEnds), and a car is drawn only on this
// side of it (SHOW), so it comes out of the trees and goes into them
export const EDGE = 185, SHOW = 148;
const PASS_X = 40, PASS_T = 4.2;   // the scare: from x = 40 to -40 in the far lane in PASS_T seconds (the same path as windowface.js)
const R = 0.28;                    // the player's circle
const SEE = 12;                    // by day a driver stops for a kid on the asphalt this far ahead of the car's nose
const BUS = new THREE.Vector3(0, 1.5, -30);   // where the bus's horn comes from: the road at the end of the drive, out of sight of the kitchen
const ACCEL = 2.6, BRAKE = 7.5, PANIC = 11;   // m/s²

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

// the models' own bounds start well below their tyres (up to 0.6 m) and one sits 24 m off its pivot, so a car is measured from its actual
// vertices once per model: the lowest one (floor), the body's extents round the box centre the holders are centred on (front, back, half
// width), and its lamps from the lamp meshes themselves (the front and back pairs of the light clusters). Returns, in model space
// recentred on the box: { floor, head, tail, front, back, half, lamps: { head: [Vector3, Vector3], tail: [...] } }
export function carFit(g) {
  if (g.userData.fit) return g.userData.fit;
  g.scene.updateMatrixWorld(true);
  const v = new THREE.Vector3(), b = g.box, cx = (b.min.x + b.max.x) / 2, cz = (b.min.z + b.max.z) / 2;
  let floor = Infinity, x0 = Infinity, x1 = -Infinity, w = 0;
  const lampPts = [];
  g.scene.traverse((o) => {
    if (!o.isMesh) return;
    const p = o.geometry.attributes.position, mat = [].concat(o.material)[0], lamp = /lights_and_glass$/i.test(mat.name || '') || (/headlight|brakelight|taillight|tail_light/i.test(o.name) && !/glass/i.test(o.name));
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
      if (v.y < floor) floor = v.y;
      x0 = Math.min(x0, v.x - cx); x1 = Math.max(x1, v.x - cx); w = Math.max(w, Math.abs(v.z - cz));
      if (lamp) lampPts.push(v.x - cx, v.y, v.z - cz);
    }
  });
  if (!isFinite(floor)) { floor = b.min.y; x0 = b.min.x - cx; x1 = b.max.x - cx; w = (b.max.z - b.min.z) / 2; }
  // a pair of lamps at one end: the lamp vertices within 0.3 m of that end, split down the middle, each side's centre
  const pair = (end) => {
    let lim = end > 0 ? -Infinity : Infinity; for (let i = 0; i < lampPts.length; i += 3) lim = end > 0 ? Math.max(lim, lampPts[i]) : Math.min(lim, lampPts[i]);
    const s = [[0, 0, 0, 0], [0, 0, 0, 0]];
    for (let i = 0; i < lampPts.length; i += 3) { if ((lampPts[i] - lim) * end < -0.3) continue; const k = lampPts[i + 2] < 0 ? 0 : 1; s[k][0] += lampPts[i]; s[k][1] += lampPts[i + 1]; s[k][2] += lampPts[i + 2]; s[k][3]++; }
    return s.every((q) => q[3]) ? s.map((q) => new THREE.Vector3(q[0] / q[3], q[1] / q[3] - floor, q[2] / q[3])) : null;
  };
  const head = pair(1) || [new THREE.Vector3(x1 - 0.05, 0.7, -w + 0.36), new THREE.Vector3(x1 - 0.05, 0.7, w - 0.36)];
  const tail = pair(-1) || [new THREE.Vector3(x0 + 0.05, 0.74, -w + 0.32), new THREE.Vector3(x0 + 0.05, 0.74, w - 0.32)];
  return (g.userData.fit = { floor, head: head[0].y, tail: tail[0].y, front: x1, back: x0, half: w, lamps: { head, tail } });
}

// a car's own paint: the body material (the one named after the car) cloned and tinted a little over the colour (not chalked), with a
// clear coat over it that takes the sky; the lower body darker and duller with road dirt (by height above the road). The lamp material is
// cloned too, so each car lights its own lamps (lit(k): 0 by day). The glass keeps the model's own.
const DIRT = (sh) => {
  sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nvarying float vCarY;').replace('#include <project_vertex>', '#include <project_vertex>\n  vCarY = (modelMatrix * vec4(transformed, 1.0)).y;');
  sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nvarying float vCarY;')
    .replace('#include <map_fragment>', '#include <map_fragment>\n  float carClean = smoothstep(0.15, 0.7, vCarY);\n  diffuseColor.rgb *= mix(0.6, 1.0, carClean);')
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(min(1.0, roughnessFactor + 0.3), roughnessFactor, carClean);');
};
export function paintCar(root, color) {
  const lamps = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (/bodymat/i.test(m.name)) {
      const p = new THREE.MeshPhysicalMaterial();
      THREE.MeshStandardMaterial.prototype.copy.call(p, m);
      p.name = m.name; p.color.set(color).multiplyScalar(1.1); p.roughness = 0.4; p.metalness = 0.35; p.envMapIntensity = 1.0;
      p.clearcoat = 0.6; p.clearcoatRoughness = 0.15;
      p.onBeforeCompile = DIRT; p.customProgramCacheKey = () => 'carpaint';
      o.material = p;
    } else if (/lights_and_glass$/i.test(m.name)) {
      const l = m.clone(); l.emissiveMap = m.map; l.emissive.set(0xffffff); l.emissiveIntensity = 0; o.material = l; lamps.push(l);
    }
  });
  return { lamps, lit(k) { for (const l of lamps) l.emissiveIntensity = k; } };
}

export function createTraffic(scene, sfx) {
  const root = new THREE.Group(); root.name = 'traffic'; scene.add(root);
  const cars = [], glow = glowTexture(), tmp = new THREE.Vector3();
  const ctx = { P: null, F: null, W: null, caught: null, note: null };   // bind(): the player, the flags, the world (its colliders), getting caught, the journal
  const listeners = [];   // onBrake(fn): fn({ car, x, z }) when a car brakes for the player by day (the day's rings count it)
  let lit = false, timer = 20, night = false, phase = 'day', idleGain = -1;
  // the one real beam: a spot on the nearest lit car (no shadow), so a car going by at night sweeps the road, the mailbox, the fence and the
  // ditch with its light; always in the scene, dark by day (a light added or taken away would rebuild every shader). The phone has none
  const beam = PHONE ? null : new THREE.SpotLight(0xfff0d2, 0, 35, 0.5, 0.45, 1.3);
  if (beam) { beam.name = 'carBeam'; beam.castShadow = false; scene.add(beam, beam.target); }

  Promise.all(CAR_MODELS.map((n) => loadProp(n).then((g) => [n, g]).catch(() => null))).then((loaded) => {
    const gs = loaded.filter(Boolean);
    for (let i = 0; i < (PHONE ? 1 : 6) && gs.length; i++) {   // a phone keeps one car; it is never on the road with another anyway
      const [model, g] = gs[i % gs.length], b = g.box, m = g.scene.clone(true), fit = carFit(g);
      m.position.set(-(b.min.x + b.max.x) / 2, -fit.floor - 0.005, -(b.min.z + b.max.z) / 2);   // tyres on the asphalt (its top is at -0.005)
      const paint = paintCar(m, COLORS[i % COLORS.length]);
      const holder = new THREE.Group(); holder.add(m); holder.visible = false; holder.userData.car = model; root.add(holder);
      const sprites = [];
      for (const p of fit.lamps.head) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffe9c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 })); s.scale.set(1.6, 1.6, 1); s.position.set(p.x + 0.12, p.y, p.z); holder.add(s); sprites.push(s); }
      for (const p of fit.lamps.tail) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff3020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 })); s.scale.set(0.7, 0.7, 1); s.position.set(p.x - 0.1, p.y, p.z); holder.add(s); sprites.push(s); }
      const hl = Math.max(fit.front, -fit.back);
      cars.push({ g: holder, model, paint, sprites, fit, hl, hw: fit.half, on: false, x: 0, z: 0, dir: 1, v: 15, v0: 15, state: 'drive', heard: false, scare: false, park: null, blocked: 0, honks: 0, honkT: 0, warned: false });
    }
  }).catch((e) => console.warn('traffic failed:', e));

  const setLit = (c) => { c.paint.lit(lit ? 2.4 : 0); for (const s of c.sprites) s.visible = lit; };
  const laneOf = (dir) => (dir > 0 ? LANE.near : LANE.far);
  const nose = (c, out = tmp) => out.set(c.x + c.dir * c.hl, 0.8, c.z);
  const free = (model) => cars.find((k) => !k.on && (!model || k.model === model)) || (model ? cars.find((k) => !k.on) : null);
  const spawn = (dir, { x, v, scare = false, model = null } = {}) => {
    const sx = x ?? -dir * EDGE;
    // not on top of a car already coming in at that end of that lane
    if (!scare && x === undefined && cars.some((k) => k.on && k.dir === dir && Math.abs(k.x - sx) < 14)) return null;
    const c = free(model); if (!c) return null;
    c.on = true; c.dir = dir; c.x = sx; c.z = laneOf(dir); c.v0 = c.v = v ?? 13 + Math.random() * 6; c.heard = scare; c.scare = scare; c.state = 'drive'; c.park = null; c.blocked = 0; c.honks = 0; c.warned = false;
    c.g.position.set(c.x, 0, c.z); c.g.rotation.y = dir > 0 ? 0 : Math.PI; c.g.visible = Math.abs(c.x) < SHOW; setLit(c);
    return c;
  };
  const off = (c) => { c.on = false; c.g.visible = false; c.park = null; c.state = 'gone'; if (c.col) c.col.on = false; };
  // each car on the road is a box the player cannot walk into (W.colliders, moved with it; off the road it is off)
  const body = (c, i) => {
    if (!c.col && ctx.W && ctx.W.colliders) { c.col = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, maxY: 1.5, on: false, id: 'car', car: c.model }; ctx.W.colliders.push(c.col); }
    if (c.col) { c.col.on = c.on; c.col.minX = c.x - c.hl; c.col.maxX = c.x + c.hl; c.col.minZ = c.z - c.hw; c.col.maxZ = c.z + c.hw; }
  };
  const horn = (c, hold = 0.6) => { if (sfx && sfx.carHorn) sfx.carHorn({ at: nose(c).clone(), hold }); };
  const skid = (c, gain = 1) => { if (sfx && sfx.pick) sfx.pick('skid', { at: nose(c).clone(), ref: 4, roll: 0.8, gain, wet: 0.2 }); };

  // where the player stands, if on foot and in play: { x, z, road (on the asphalt) } or null
  const player = () => {
    const P = ctx.P, F = ctx.F;
    if (!P || !F || F.dead || P.mode !== 'walk') return null;
    return { x: P.pos.x, z: P.pos.z, road: Math.abs(P.pos.x) < ROAD.x && P.pos.z > ROAD.z0 - R && P.pos.z < ROAD.z1 + R };
  };
  // the player's circle against a car's footprint (the car runs along x, so its box is axis-aligned round (x, lane))
  const touches = (c, p, pad = 0) => { const dx = Math.max(Math.abs(p.x - c.x) - c.hl, 0), dz = Math.max(Math.abs(p.z - c.z) - c.hw, 0); return dx * dx + dz * dz < (R + pad) * (R + pad); };
  // how far ahead of the car's nose the player is, if in its path (within a lane-width of its line): metres, or Infinity
  const ahead = (c, p) => { if (Math.abs(p.z - c.z) > c.hw + R + 0.5) return Infinity; const d = (p.x - c.x) * c.dir - c.hl - R; return d > -c.hl - R ? d : Infinity; };

  const traffic = {
    cars, root, beam, BUS,
    // main.js hands over the player, the flags, caught() and the journal once at load; a test may pass parts of it again
    bind(o) { Object.assign(ctx, o); return traffic; },
    onBrake(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; },
    get stopped() { return cars.filter((c) => c.on && c.state === 'stopped'); },
    // seconds until the next ordinary car is sent (a test or a scene can hold the road clear)
    get next() { return timer; }, set next(v) { timer = v; },
    // the scare: a car in the far lane right now, from one side of the house to the other in PASS_T seconds (main.js plays its sound)
    // (it keeps time with the light, so the far lane is cleared in front of it, out in the dark and the fog, and it follows nobody)
    pass() { for (const c of cars) if (c.on && c.dir < 0 && Math.abs(c.x) < PASS_X + 12) off(c); return spawn(-1, { x: PASS_X, v: (2 * PASS_X) / PASS_T, scare: true }); },
    // an ordinary car, from either end
    one(dir = Math.random() < 0.5 ? 1 : -1, o = {}) { return spawn(dir, o); },
    // a car that comes along (one already on the road heading that way and far enough short of x to stop in time, or a new one from the
    // end of the road), slows, stops with its middle at x and idles there `hold` seconds (Infinity: until go() or back()), then drives on
    // ('go'), backs away the way it came ('back') or waits ('stay'). Returns a handle: { car, state, go(), back() }
    stop(x = 4.7, { dir = 1, model = null, hold = 6, then = 'go', v } = {}) {
      let c = cars.find((k) => k.on && !k.scare && !k.park && k.dir === dir && (!model || k.model === model) && (x - k.x) * dir > (k.v * k.v) / (2 * BRAKE) + 4);
      if (!c) c = spawn(dir, { model, v, x: -dir * EDGE });
      if (!c) return null;
      c.park = { x, hold, then, t: 0 }; c.state = 'stopping'; c.heard = true;   // its own sound: the idle when it stands, not the pass
      return { car: c, get state() { return c.on ? c.state : 'gone'; }, go() { if (c.park) { c.park = null; c.state = 'drive'; } }, back() { if (c.on) { c.park = null; c.state = 'back'; } } };
    },
    // the school bus's horn from the road at 7:20 (the breakfast): heard, never drawn
    busHorn(hold = 0.9) { if (sfx && sfx.carHorn) sfx.carHorn({ at: BUS.clone(), bus: true, hold }); return BUS; },
    // phase: how often cars come by, and whether their lights are on; 'off' clears the road (the dream drive brings its own traffic)
    update(dt, ph) {
      phase = ph;
      if (ph === 'off') { for (const c of cars) if (c.on) off(c); if (beam) beam.intensity = 0; idle(0); return; }
      night = ph === 'night' || ph === 'title';
      if (night !== lit) { lit = night; for (const c of cars) if (c.on) setLit(c); }
      timer -= dt;
      if (timer <= 0) {
        timer = ph === 'day' ? 16 + Math.random() * 30 : ph === 'morning' ? 22 + Math.random() * 40 : 75 + Math.random() * 120;
        if (cars.length) traffic.one();
      }
      const p = ph === 'title' ? null : player(), daylight = ph === 'day' || ph === 'morning';
      for (const c of cars) {
        if (!c.on) continue;
        // how fast it wants to go: its own speed, held back by the car ahead in its lane, by a stop it is making, by a kid in the road
        let want = c.state === 'back' ? -3.5 : c.v0, decel = BRAKE, wall = Infinity;   // wall: how far its nose may still go (metres along its way)
        for (const a of cars) {
          if (c.scare || a === c || !a.on || a.dir !== c.dir || a.z !== c.z) continue;
          const gap = (a.x - c.x) * c.dir - c.hl - a.hl;
          if (gap < -0.5 || gap > 40) continue;
          want = Math.min(want, Math.max(0, a.v) + Math.max(0, gap - 7) * 0.7); wall = Math.min(wall, gap - 2.5);
        }
        if (c.park) {
          const d = (c.park.x - c.x) * c.dir;
          if (c.state === 'stopping') { want = Math.min(want, Math.sqrt(Math.max(0, 2 * 2.8 * d))); wall = Math.min(wall, d); if (d < 0.05 && c.v < 0.2) { c.state = 'stopped'; c.v = 0; c.park.t = 0; } }
          else if (c.state === 'stopped') { want = 0; c.park.t += dt; if (c.park.t >= c.park.hold) { const then = c.park.then; if (then === 'back') { c.park = null; c.state = 'back'; } else if (then === 'go') { c.park = null; c.state = 'drive'; } } }
        }
        // the player
        if (p) {
          const d = ahead(c, p);
          if (daylight && p.road && d < SEE && c.state !== 'back') {
            // by day: brake to stand short of the kid, horn as it starts to, and the nose never goes past a metre from them
            if (c.state !== 'brake' && c.state !== 'held') {
              const need = (c.v * c.v) / (2 * Math.max(0.3, d - 1));
              c.state = 'brake'; c.honks = 1; c.honkT = 3.5; horn(c, 0.7); if (need > 5.5 && c.v > 4) skid(c, 0.8);
              traffic.braked = (traffic.braked || 0) + 1;
              for (const fn of listeners) try { fn({ car: c, x: p.x, z: p.z }); } catch (e) { console.warn(e); }
            }
            want = 0; decel = Math.min(PANIC, Math.max(2.5, (c.v * c.v) / (2 * Math.max(0.3, d - 1.2)))); wall = Math.min(wall, d - 1.0); c.blocked = 0;
          } else if (!daylight && d < c.v * 1.0 + 2 && !c.warned && c.v > 3) {
            // after dark: the driver sees a kid in the lamps too late; the horn and the tyres, and it is still coming
            c.warned = true; horn(c, 0.8); skid(c, 1.1); decel = 5; want = 0;
          }
          if (!daylight && c.warned && d < 8) { want = 0; decel = 5; }
        }
        if (c.state === 'brake' || c.state === 'held') {
          const d = p ? ahead(c, p) : Infinity;
          if (c.v < 0.05) c.state = 'held';
          if (!(p && p.road && d < SEE + 2)) { c.blocked += dt; if (c.blocked > 1.0) { c.state = c.park ? 'stopping' : 'drive'; c.blocked = 0; } else want = 0; }   // they are off the asphalt: a moment, then on
          else if (c.state === 'held') { c.honkT -= dt; if (c.honkT <= 0 && c.honks < 3) { c.honks++; c.honkT = 4 + Math.random() * 2; horn(c, 1.2); } }
        }
        // speed toward want, within what a car can do; then the move, and the nose held short of whatever it must not reach
        if (want > c.v) c.v = Math.min(want, c.v + (c.v < 0 ? BRAKE : ACCEL) * dt); else c.v = Math.max(want, c.v - (c.v > 0 ? decel : 1.8) * dt);
        let step = c.v * dt;
        if (step > 0 && wall < Infinity) step = Math.max(0, Math.min(step, wall));
        if (step === 0 && wall < 0.01 && c.v > 0) c.v = 0;
        c.x += c.dir * step; c.g.position.x = c.x; c.g.visible = Math.abs(c.x) < SHOW;
        body(c);
        // after dark the car that meets you is the end of you (a car standing still is only in your way)
        if (p && !daylight && Math.abs(c.v) > 0.5 && touches(c, p)) {
          if (!c.warned) { horn(c, 0.6); skid(c, 1.2); }
          c.warned = true;
          if (ctx.note) ctx.note('I was on the road.');
          if (ctx.caught) ctx.caught({ unseen: true });
        }
        if (!c.heard && Math.abs(c.x) < 58) { c.heard = true; sfx.moving('sfx/car_pass', { gain: daylight ? 0.42 : 0.3, from: c.dir > 0 ? -0.9 : 0.9, to: c.dir > 0 ? 0.9 : -0.9, dur: 116 / Math.max(4, c.v) }); }
        if (Math.abs(c.x) > EDGE + 2 && !(c.scare && c.x > -EDGE)) off(c);
      }
      // the beam on the nearest lit car (not the scare's, which has its own light), fading in as it comes
      if (beam) {
        let best = null, bd = 70; const ex = ctx.P ? ctx.P.pos.x : 2.3, ez = ctx.P ? ctx.P.pos.z : -10;
        if (lit) for (const c of cars) { if (!c.on || c.scare || !c.g.visible || c.state === 'back') continue; const d = Math.hypot(c.x - ex, c.z - ez); if (d < bd) { bd = d; best = c; } }
        if (best) {
          const h = best.fit.lamps.head, y = (h[0].y + h[1].y) / 2;
          beam.position.set(best.x + best.dir * (best.fit.front - 0.1), y, best.z);
          beam.target.position.set(best.x + best.dir * (best.fit.front + 16), 0, best.z + (best.dir > 0 ? 0.6 : -0.6)); beam.target.updateMatrixWorld();
          beam.intensity = 140 * THREE.MathUtils.smoothstep(70 - bd, 0, 30);
        } else beam.intensity = 0;
      }
      // a car standing in the road idles where it stands (heard by how far it is)
      let ig = 0; for (const c of cars) if (c.on && (c.state === 'stopped' || c.state === 'held')) { const ex = ctx.P ? ctx.P.pos.x : 2.3, ez = ctx.P ? ctx.P.pos.z : -10; ig = Math.max(ig, 0.55 * Math.max(0, 1 - Math.hypot(c.x - ex, c.z - ez) / 45)); }
      idle(ig);
    },
  };
  function idle(v) { if (Math.abs(v - idleGain) < 0.03 && !(v === 0 && idleGain > 0)) return; idleGain = v; if (sfx && sfx.bed) sfx.bed('lib/car_idle', v, 0.6); }
  return traffic;
}
