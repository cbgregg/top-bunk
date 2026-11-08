// The house's ceiling lights and their switches.
//
// Every room has its fixtures (world.js: a glass shade on the ceiling) and a switch by the door (two for the hall). A switch works its room's
// lights; the house can work them too (it turns a light off behind you, one on ahead of you; bulbs flicker and brown out as the thing comes
// near, and can die with a pop). A lit room makes you easier to find, but the thing will not walk into the light while you are watching it.
//
// The cost of a light is paid by every pixel, and a change in the NUMBER of lights recompiles every shader in the scene (that is what made
// starting a game slow). So the lights here are a fixed pool, made once and always in the scene: a few shadowed spots, a few plain ones and
// one soft bounce fill. Each frame the nearest lit fixtures borrow them; switching a light only changes intensities, never the count.
import * as THREE from 'three';
import { roomAt, ROOMS } from './world.js';
import { flicker as calm } from './settings.js';

// a 60 W incandescent bulb, about 2700 K
const STRIP = new THREE.Color(0xff9a48).multiplyScalar(1.0);
const WARM = new THREE.Color(0xffad5e), BROWN = new THREE.Color(0xff6a1c), BOUNCE_COL = new THREE.Color(0xffc690);
// how bright a fixture's light is, by phase: base (world.js, 7..10) times this, in candela; the bounce fill, per unit of the room's light
const K = { night: 3.4, day: 0.95, morning: 0.55, title: 0 };
const BOUNCE = { night: 2.2, day: 0.6, morning: 0.35, title: 0 };
const EMISSIVE = { night: 3.2, day: 1.6, morning: 1.2, title: 0 };
// the rooms each closed door belongs to (the strip of light under it shows on the other side)
const DOOR_ROOM = { kid: 'bed', bath: 'bath', spare: 'spare', room2: 'room2', parents: 'parents' };

export function createLights({ W, scene, camera, sfx, PHONE, F, E, renderer }) {
  const V3 = THREE.Vector3, tmp = new V3(), fwd = new V3();
  // ---------- the rooms ----------
  const rooms = {};
  for (const [name, b] of Object.entries(W.bulbs)) (rooms[b.room] ||= { name: b.room, bulbs: [], switches: [], on: false, dead: false, lvl: 0, out: 0, flk: 1, brown: 0, fT: 0, fv: 1, leftT: 0, delay: 0, killT: 0 }).bulbs.push(b);
  for (const b of Object.values(W.bulbs)) { b.dome.material.emissive.copy(WARM); b.out = 0; }
  for (const s of W.switches) {
    s.pos = new V3(); s.g.getWorldPosition(s.pos);
    s.at = s.pos.clone().addScaledVector(s.normal, 0.12);   // where you reach for it from
    if (s.room && rooms[s.room]) rooms[s.room].switches.push(s);
  }
  const rectOf = (name) => ROOMS[name];
  const center = (name) => { const r = rectOf(name); return r ? new V3((r[0] + r[1]) / 2, 1.15, (r[2] + r[3]) / 2) : null; };
  for (const r of Object.values(rooms)) { r.c = center(r.name); const q = rectOf(r.name); r.rect = q; r.radius = q ? Math.hypot(q[1] - q[0], q[3] - q[2]) / 2 : 3; }

  // ---------- the pool ----------
  const NS = PHONE ? 0 : 2, NP = PHONE ? 2 : 3;
  const pool = [];
  const mkSpot = (shadow) => {
    const l = new THREE.SpotLight(WARM, 0, 7.5, 1.2, 0.85, 2);
    l.position.set(0, -50, 0); l.target.position.set(0, -60, 0); scene.add(l, l.target);
    if (shadow) {
      l.castShadow = true; l.shadow.mapSize.set(1024, 1024); l.shadow.camera.near = 0.12; l.shadow.camera.far = 7.5;
      l.shadow.bias = -0.0009; l.shadow.normalBias = 0.025; l.shadow.radius = 3; l.shadow.autoUpdate = false;
      (scene.userData.shadowLights ||= []).push({ light: l, sun: false });
    }
    pool.push({ light: l, shadow, bulb: null, n: 0 });
  };
  for (let i = 0; i < NS; i++) mkSpot(true);
  for (let i = 0; i < NP; i++) mkSpot(false);
  // one plain spot kept out of the pool for a light that is carried: Dad's torch on his night walks (js/parents.js aims it from his hand).
  // It is in the scene from the start like the rest, dark and parked under the floor, so lighting it never changes the light count
  const torch = new THREE.SpotLight(0xfff0d8, 0, 13, 0.36, 0.55, 1.3);
  torch.position.set(0, -50, 0); torch.target.position.set(0, -60, 0); scene.add(torch, torch.target);
  // (a phone does without it: one light fewer for every pixel)
  const bounce = PHONE ? null : new THREE.PointLight(BOUNCE_COL, 0, 6, 1); if (bounce) { bounce.position.set(0, -50, 0); scene.add(bounce); }

  // ---------- the light under a shut door ----------
  // a soft strip on the floor just outside the door, in five pieces so that something standing behind the door can block two of them (feet)
  // the texture: bright along the gap, falling off fast across the carpet, and fading out at both ends of the door
  const stripTex = (() => {
    const N = 64, c = document.createElement('canvas'); c.width = N; c.height = N; const x = c.getContext('2d'), img = x.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const v = j / (N - 1), u = i / (N - 1), across = Math.exp(-v * 5.5) * (1 - v), ends = Math.min(1, Math.min(u, 1 - u) / 0.16), k = across * ends * ends;
      const o = (j * N + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = 255; img.data[o + 3] = Math.round(255 * k);
    }
    x.putImageData(img, 0, 0); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.flipY = false; return t;
  })();
  const strips = [];
  for (const [door, room] of Object.entries(DOOR_ROOM)) {
    const d = W.doors[door], R = rooms[room], rr = rectOf(room); if (!d || !R || !rr) continue;
    const alongX = Math.abs(d.col.maxX - d.col.minX) > Math.abs(d.col.maxZ - d.col.minZ);
    const cx = (rr[0] + rr[1]) / 2, cz = (rr[2] + rr[3]) / 2;
    // the side away from the room (where the light shows when the room is lit and the door is shut), and the side in it
    for (const side of ['out', 'in']) {
      const away = alongX ? Math.sign(d.mid.z - cz) || 1 : Math.sign(d.mid.x - cx) || 1, s = side === 'out' ? away : -away;
      const g = new THREE.Group(), w = 0.84, depth = 0.42, n = 5;
      g.position.set(d.mid.x + (alongX ? 0 : s * 0.06), 0.006, d.mid.z + (alongX ? s * 0.06 : 0));
      g.rotation.y = alongX ? (s > 0 ? 0 : Math.PI) : (s > 0 ? Math.PI / 2 : -Math.PI / 2);
      const parts = [];
      for (let i = 0; i < n; i++) {
        // each piece takes its own slice of the texture across the door; v = 0 at the gap
        const geo = new THREE.PlaneGeometry(w / n, depth), uv = geo.attributes.uv, P = geo.attributes.position;
        for (let k = 0; k < uv.count; k++) uv.setXY(k, (i + (P.getX(k) / (w / n) + 0.5)) / n, 0.5 - P.getY(k) / depth);
        const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: stripTex, color: STRIP, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
        m.rotation.x = -Math.PI / 2; m.position.set(-w / 2 + (i + 0.5) * (w / n), 0, depth / 2); m.renderOrder = 3; m.userData.noAO = true; g.add(m); parts.push(m);
      }
      g.visible = false; scene.add(g);
      strips.push({ g, parts, door: d, room: R, side, other: side === 'in' ? 'outside' : null, alongX, s });
    }
  }

  // ---------- state ----------
  let phase = 'title', since = 0, assignT = 0, frame = 0, deaths = 0;
  const L = {
    rooms, switches: W.switches, pool, bounce, torch,
    // what moves near a lit fixture besides the thing and the doors (a parent walking the house): its shadow map is drawn again while it does
    movers: [],
    // the room's light now (0..1, flicker included), at a point in the house; the dining end takes some of the kitchen's
    levelAt(x, z, y = 0) {
      const name = roomAt(x, z, y), r = rooms[name];
      if (r) return r.out;
      if (name === 'dining' && rooms.kitchen) return rooms.kitchen.out * 0.55;
      return 0;
    },
    isOn: (name) => !!(rooms[name] && rooms[name].on),
    // flip a room's lights. by: 'player' (the switch you are at), 'house' (the one nearest you clicks, heard from there)
    set(name, on, { by = 'house', sw = null, silent = false } = {}) {
      const r = rooms[name]; if (!r || r.on === on) return false;
      r.on = on; r.lastFlip = since;
      const s = sw || nearestSwitch(r);
      if (s) s.pivot.rotation.x = on ? -0.36 : 0.36;
      if (!silent && sfx.ctx && s) sfx.pick('switch', { gain: by === 'house' ? 0.55 : 0.4, wet: 0.05, maxLen: 0.6, at: { x: s.pos.x, y: s.pos.y, z: s.pos.z } }) || sfx.click();
      // a cold filament: sometimes it takes a beat to catch, sometimes it buzzes as it comes on
      if (on && !r.dead && !F.blackout) {
        const k = Math.random();
        r.delay = k < 0.14 ? 0.25 + Math.random() * 0.45 : 0.04;
        if (k > 0.9 && sfx.ctx) { const b = r.bulbs[0]; sfx.tone({ type: 'sawtooth', f: 120, dur: 0.7, gain: 0.018, wet: 0.05, pan: sfx.place(0, b.pos) }); }
      }
      if (L.onFlip) L.onFlip(name, on, by);
      return true;
    },
    toggle(name, opts) { const r = rooms[name]; return r ? L.set(name, !r.on, opts) : false; },
    // the bulb dies: a pop and a tinkle, dark for the rest of the night (the switch still clicks)
    kill(name) {
      const r = rooms[name]; if (!r || r.dead) return false;
      r.dead = true; deaths++;
      const b = r.bulbs.reduce((a, c) => (c.pos.distanceTo(camera.position) < a.pos.distanceTo(camera.position) ? c : a));
      if (sfx.ctx) {
        const pan = sfx.place(0, b.pos);
        sfx.noiseHit({ dur: 0.05, type: 'highpass', f: 2600, gain: 0.55, wet: 0.35, pan });
        sfx.tone({ f: 1500, f2: 180, dur: 0.07, gain: 0.2, wet: 0.35, pan });
        sfx.noiseHit({ dur: 0.18, type: 'bandpass', f: 6200, q: 2, gain: 0.12, wet: 0.3, delay: 0.06, pan });
      }
      return true;
    },
    get deaths() { return deaths; },
    // the story's light setup: by day every room is lit, in the morning and at night none is, and the night's dead bulbs work again
    phase(p) {
      phase = p in K ? p : 'night';
      for (const r of Object.values(rooms)) {
        r.dead = false; r.killT = 0; r.on = p === 'day'; r.lvl = r.on ? 1 : 0; r.delay = 0; r.flk = 1; r.brown = 0;
        for (const s of r.switches) s.pivot.rotation.x = r.on ? -0.36 : 0.36;
      }
      deaths = 0; assignT = 0;
      houseT = 45 + Math.random() * 45; aheadT = 70 + Math.random() * 120; aheadLeft = 1; revealDone = false; arm = null; flash = null;
    },
    // every room off at once (night one's crescendo); each switch you can hear click
    allOff({ silent = false } = {}) { for (const r of Object.values(rooms)) if (r.on) L.set(r.name, false, { silent }); },
    update(dt) { step(dt); },
  };
  // ---------- the house works the lights (nights two to ten) ----------
  // H, from nights.js: { n, quiet (the night's own scene has the house), calm, hunting, looking(x, z, cos), los(ax, az, bx, bz),
  //   revealCool(), revealed(), show(x, z) / hide() (the thing, for one frame), sting(), fear(v), near (the thing is out and close: its position) }
  let houseT = 60, aheadT = 120, aheadLeft = 1, revealDone = false, arm = null, flash = null;
  const dist2 = (a, x, z) => Math.hypot(a.x - x, a.z - z);
  L.house = (dt, H) => {
    const px = camera.position.x, pz = camera.position.z, here = roomAt(px, pz, camera.position.y - 1.4);
    for (const r of Object.values(rooms)) r.leftT = r.on && r.name !== here ? r.leftT + dt : 0;
    // the one-frame reveal, already under way: it was in the corner when the light came on; now the bulb goes
    if (flash) { flash.t += dt; if (flash.t > 0.09) { H.hide(); L.kill(flash.room); flash = null; } return; }
    if (arm) {
      arm.t += dt; const r = rooms[arm.room];
      if (arm.t > 4 || !r.on || r.dead || H.hunting) arm = null;
      else if (r.lvl > 0.9 && H.looking(arm.x, arm.z, 0.84)) {
        H.show(arm.x, arm.z); H.sting(); H.revealed(); H.fear(1); flash = { room: arm.room, t: 0 }; arm = null; revealDone = true; return;
      }
    }
    if (H.quiet || H.n < 2) return;
    // the thing out and near a lit fixture: the bulb gives out after a few seconds of it
    if (H.near) for (const r of Object.values(rooms)) {
      if (!r.on || r.dead) continue;
      let d = 99; for (const b of r.bulbs) d = Math.min(d, dist2(b.pos, H.near.x, H.near.z));
      if (d < 2.7) { r.killT += dt; if (r.killT > 2.5 + (r.name.length % 3) && deaths < 2) L.kill(r.name); } else r.killT = Math.max(0, r.killT - dt);
    }
    if (!H.calm) return;
    // a room you lit and left goes dark behind you, and you hear its switch from where you are
    houseT -= dt;
    if (houseT <= 0) {
      const c = Object.values(rooms).filter((r) => r.on && !r.dead && r.leftT > 8 && r.switches.length).map((r) => ({ r, s: nearestSwitch(r) }))
        .filter(({ s }) => { const d = dist2(s.pos, px, pz); return d > 4 && d < 14 && !H.looking(s.pos.x, s.pos.z, 0.5); });
      if (c.length) { const { r } = c[Math.floor(Math.random() * c.length)]; L.set(r.name, false, { by: 'house' }); H.fear(0.35); houseT = (100 + Math.random() * 90) / (1 + 0.08 * H.n); }
      else houseT = 8;
    }
    // once a night (from night three), a dark room ahead of you lights up by itself, as if somebody wants you to go in
    aheadT -= dt;
    if (aheadT <= 0 && aheadLeft > 0 && H.n >= 3) {
      camera.getWorldDirection(fwd);
      const c = Object.values(rooms).filter((r) => {
        if (r.on || r.dead || r.name === here || !r.c) return false;
        const dx = r.c.x - px, dz = r.c.z - pz, d = Math.hypot(dx, dz);
        return d > 3 && d < 9.5 && (dx * fwd.x + dz * fwd.z) / d > 0.35 && H.los(px, pz, r.c.x, r.c.z);
      });
      if (c.length) { const r = c[Math.floor(Math.random() * c.length)]; L.set(r.name, true, { by: 'house' }); H.fear(0.4); aheadLeft--; aheadT = 200 + Math.random() * 200; }
      else aheadT = 6;
    }
  };
  // you put a light on: once in a while (never twice a night) it was standing in the room's far corner, and the bulb goes as you see it
  L.flipped = (name, on, by, H) => {
    if (!on || by !== 'player' || revealDone || arm || !H || H.quiet || H.n < 2 || H.hunting || H.revealCool() || name === 'hall') return;
    if (Math.random() > (H.n <= 3 ? 0.22 : 0.15)) return;
    const r = rooms[name], q = rectOf(name), s = nearestSwitch(r); if (!q || !s) return;
    const corners = [[q[0], q[2]], [q[0], q[3]], [q[1], q[2]], [q[1], q[3]]].map(([x, z]) => ({ x: x + (x < r.c.x ? 0.5 : -0.5), z: z + (z < r.c.z ? 0.5 : -0.5) }))
      .filter((c) => H.los(s.at.x, s.at.z, c.x, c.z)).sort((a, b) => dist2(b, s.pos.x, s.pos.z) - dist2(a, s.pos.x, s.pos.z));
    if (corners.length) arm = { room: name, t: 0, x: corners[0].x, z: corners[0].z };
  };
  const nearestSwitch = (r) => r.switches.reduce((a, s) => (!a || s.pos.distanceTo(camera.position) < a.pos.distanceTo(camera.position) ? s : a), null);

  function step(dt) {
    since += dt; frame++;
    const kPhase = K[phase] || 0;
    // ---- each room: on/off, the delay before a cold bulb catches, the flicker near the thing ----
    const ex = E && E.visible ? E.root.position : null;
    for (const r of Object.values(rooms)) {
      if (r.delay > 0) r.delay -= dt;
      const goal = r.on && !r.dead && !F.blackout && r.delay <= 0 ? 1 : 0;
      // a filament comes up in a few hundredths of a second and glows a moment after it goes off
      r.lvl += (goal - r.lvl) * Math.min(1, dt * (goal > r.lvl ? 30 : 14));
      if (r.lvl < 0.002) r.lvl = 0;
      // the thing near the room's light: flicker and brown-out, worse the closer it is (and with the house's own flicker, F.flicker)
      let p = 0;
      if (ex && r.lvl > 0) { let d = 99; for (const b of r.bulbs) d = Math.min(d, Math.hypot(b.pos.x - ex.x, b.pos.z - ex.z)); p = Math.max(0, 1 - d / 6.5); }
      if (F.flicker && r.lvl > 0) p = Math.max(p, 0.55);
      if (p > 0.02) {
        r.fT -= dt;
        if (r.fT <= 0) { r.fT = 0.03 + Math.random() * 0.13; r.fv = Math.random() < 0.28 * p ? 0.04 + Math.random() * 0.2 : 1 - p * 0.45 * Math.random(); }
        r.flk = calm('room:' + r.name, r.fv, 1 - p * 0.25); r.brown = p * 0.75;
        if (p > 0.45 && Math.random() < dt * 0.6 && sfx.ctx) sfx.tone({ type: 'sawtooth', f: 120, dur: 0.35, gain: 0.012 * p, wet: 0.05, pan: sfx.place(0, r.bulbs[0].pos) });
      } else { r.flk += (1 - r.flk) * Math.min(1, dt * 8); r.brown *= Math.max(0, 1 - dt * 3); }
      r.out = r.lvl * r.flk * (1 - r.brown * 0.6);
      for (const b of r.bulbs) { b.out = r.out; b.brown = r.brown; b.dome.material.emissiveIntensity = (EMISSIVE[phase] || 0) * r.out; b.dome.material.emissive.copy(WARM).lerp(BROWN, r.brown); }
    }
    // ---- lend the pool to the nearest lit fixtures ----
    assignT -= dt;
    const shadowsOn = NS > 0 && phase === 'night' && renderer.shadowMap.enabled;
    if (assignT <= 0) {
      assignT = 0.15;
      const here = roomAt(camera.position.x, camera.position.z, camera.position.y - 1.4);
      const lit = Object.values(W.bulbs).filter((b) => b.out > 0.002 || pool.some((s) => s.bulb === b && s.light.intensity > 0.01));
      lit.sort((a, b) => score(a, here) - score(b, here));
      // the nearest fixtures get the shadowed lights, the next ones the plain lights; a fixture keeps the light it has while it still
      // belongs in that group, so nothing pops as you walk
      const ns = shadowsOn ? NS : 0, nearW = lit.slice(0, ns), restW = lit.slice(ns, ns + NP);
      const give = (s, b) => {
        s.bulb = b; s.n = 0;
        s.light.position.copy(b.pos); s.light.target.position.set(b.pos.x, 0, b.pos.z); s.light.target.updateMatrixWorld();
        if (s.shadow) s.light.shadow.needsUpdate = true;
      };
      const sh = pool.filter((s) => s.shadow), pl = pool.filter((s) => !s.shadow);
      for (const s of sh) if (!s.bulb || !nearW.includes(s.bulb)) s.bulb = null;
      for (const s of pl) if (!s.bulb || !restW.includes(s.bulb)) s.bulb = null;
      for (const b of nearW) if (!sh.some((s) => s.bulb === b)) { const s = sh.find((x) => !x.bulb); if (s) give(s, b); }
      for (const b of restW) if (!pl.some((s) => s.bulb === b)) { const s = pl.find((x) => !x.bulb); if (s) give(s, b); }
    }
    for (const s of pool) {
      const b = s.bulb;
      s.light.intensity = b ? b.base * kPhase * b.out : 0;
      if (b) s.light.color.copy(WARM).lerp(BROWN, b.brown || 0);
      // the house holds still, so a shadow map is drawn when its light moves to another fixture and again only while something near it
      // moves: the thing, or a door swinging (every other frame then, the two lights taking turns)
      if (s.shadow && b && s.light.intensity > 0.01 && (frame + pool.indexOf(s)) % 2 === 0 && moverNear(b.pos)) s.light.shadow.needsUpdate = true;
    }
    // ---- the bounce: a lit room fills with its own light, the walls and ceiling too ----
    if (bounce) {
      const here = roomAt(camera.position.x, camera.position.z, camera.position.y - 1.4), r = rooms[here] || (here === 'dining' ? rooms.kitchen : null);
      const k = r ? r.out * (here === 'dining' ? 0.55 : 1) : 0;
      if (r && k > 0.002) { bounce.position.copy(r.c); bounce.distance = r.radius + 1.6; bounce.intensity = (BOUNCE[phase] || 0) * k * r.bulbs.reduce((a, b) => a + b.base, 0) / 9; bounce.color.copy(BOUNCE_COL).lerp(BROWN, r.brown * 0.6); }
      else bounce.intensity = 0;
    }
    // ---- the light under the shut doors ----
    const night = phase === 'night' ? 1 : phase === 'title' ? 0 : 0.25;
    for (const st of strips) {
      const shut = 1 - Math.min(1, st.door.a * 4);
      // out: the room is lit and you are outside it; in: the room is dark and the hall (or the dining room) beyond is lit
      const src = st.side === 'out' ? st.room.out : Math.max(0, L.levelAt(st.door.mid.x + (st.alongX ? 0 : st.s * -0.5), st.door.mid.z + (st.alongX ? st.s * -0.5 : 0)) - st.room.out);
      const v = src * shut * night;
      st.g.visible = v > 0.01;
      if (!st.g.visible) continue;
      // something standing just behind the door on the lit side: two of the pieces go dark, where its feet are
      let feet = 0;
      if (ex) { const dd = Math.hypot(ex.x - st.door.mid.x, ex.z - st.door.mid.z); const behind = st.alongX ? Math.sign(ex.z - st.door.mid.z) !== st.s : Math.sign(ex.x - st.door.mid.x) !== st.s; if (dd < 1.1 && behind) feet = 1 - dd / 1.1; }
      st.parts.forEach((m, i) => { m.material.opacity = Math.min(1, v * 0.8) * (feet && (i === 1 || i === 3) ? 1 - feet * 0.9 : 1); });
    }
  }
  const moverNear = (p) => {
    if (E && E.visible && Math.hypot(E.root.position.x - p.x, E.root.position.z - p.z) < 7.5) return true;
    for (const k in W.doors) { const d = W.doors[k]; if (d.a !== d.target && Math.hypot(d.mid.x - p.x, d.mid.z - p.z) < 7.5) return true; }
    for (const m of L.movers || []) if (m.visible && Math.hypot(m.position.x - p.x, m.position.z - p.z) < 7.5) return true;
    return false;
  };
  // which fixture wants a light most: the one in your room, then the nearest; one behind a wall or a shut door counts as further away
  function score(b, here) {
    const d = b.pos.distanceTo(camera.position);
    if (b.room === here) return d - 100;
    return d;
  }
  return L;
}
