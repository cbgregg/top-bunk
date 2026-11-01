// Cars on the road out front: four models (assets/props/car_*.glb) that come out of the fog at one end, pass the house and go into the fog at
// the other, in both lanes, with headlights and tail lights after dark and a doppler pass as they go by. The director's car-pass scare asks for
// one on cue (pass()), timed with the headlight sweep in windowface.js. The road runs along x; the lane nearest the house carries the +x traffic.
import * as THREE from 'three';
import { loadProp } from './props.js';
import { PHONE } from './gfx.js';

const MODELS = ['car_sedan', 'car_sedan2', 'car_pickup', 'car_wagon'];
const LANE = { near: -29.0, far: -32.0 };
const EDGE = 135;   // where cars appear and leave (well past the fog)
const PASS_X = 40, PASS_T = 4.2;   // the scare: from x = 40 to -40 in the far lane in PASS_T seconds (the same path as windowface.js)
const COLORS = [0x8a8f96, 0x5b1d1a, 0x1f2a3a, 0xd9d3c2, 0x2d4a3a, 0x24262b, 0x7a6a4a];

function glowTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32); r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function createTraffic(scene, sfx) {
  const root = new THREE.Group(); scene.add(root);
  const cars = [], glow = glowTexture();
  const headMat = new THREE.MeshBasicMaterial({ color: 0xfff1cf, toneMapped: false }), tailMat = new THREE.MeshBasicMaterial({ color: 0xff2a1e, toneMapped: false });
  const headOff = new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.2, metalness: 0.4 }), tailOff = new THREE.MeshStandardMaterial({ color: 0x6a1410, roughness: 0.3 });
  let lit = false, timer = 20;

  Promise.all(MODELS.map(loadProp)).then((gs) => {
    for (let i = 0; i < (PHONE ? 1 : 6); i++) {   // a phone keeps one car; it is never on the road with another anyway
      const g = gs[i % gs.length], b = g.box, m = g.scene.clone(true);
      m.position.set(-(b.min.x + b.max.x) / 2, -b.min.y, -(b.min.z + b.max.z) / 2);
      // each copy its own paint: the body material (the one named after the car) is cloned and tinted
      m.traverse((o) => { if (o.isMesh && /bodymat/i.test(o.material.name)) { o.material = o.material.clone(); o.material.color.set(COLORS[i % COLORS.length]).multiplyScalar(1.6); } });
      const holder = new THREE.Group(); holder.add(m); holder.visible = false; root.add(holder);
      const L = (b.max.x - b.min.x) / 2, Wd = (b.max.z - b.min.z) / 2, lights = [], sprites = [];
      for (const s of [-1, 1]) {   // lamps: a disc each side at both ends, and a glow sprite over each
        const h = new THREE.Mesh(new THREE.CircleGeometry(0.11, 12), headOff); h.position.set(L - 0.03, 0.7, s * (Wd - 0.36)); h.rotation.y = Math.PI / 2; holder.add(h);
        const t = new THREE.Mesh(new THREE.CircleGeometry(0.09, 12), tailOff); t.position.set(-L + 0.03, 0.74, s * (Wd - 0.32)); t.rotation.y = -Math.PI / 2; holder.add(t);
        const hs = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xffe9c0, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.9 })); hs.scale.set(1.6, 1.6, 1); hs.position.copy(h.position).x += 0.1; holder.add(hs);
        const ts = new THREE.Sprite(new THREE.SpriteMaterial({ map: glow, color: 0xff3020, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.7 })); ts.scale.set(0.7, 0.7, 1); ts.position.copy(t.position).x -= 0.1; holder.add(ts);
        lights.push(h, t); sprites.push(hs, ts);
      }
      cars.push({ g: holder, lights, sprites, on: false, x: 0, dir: 1, v: 15, heard: false, scare: false });
    }
  }).catch((e) => console.warn('traffic failed:', e));

  const setLit = (c) => { c.lights[0].material = c.lights[2].material = lit ? headMat : headOff; c.lights[1].material = c.lights[3].material = lit ? tailMat : tailOff; for (const s of c.sprites) s.visible = lit; };
  const spawn = (dir, { x, v, scare = false } = {}) => {
    const c = cars.find((k) => !k.on); if (!c) return null;
    c.on = true; c.dir = dir; c.x = x ?? -dir * EDGE; c.v = v ?? 13 + Math.random() * 6; c.heard = scare; c.scare = scare;
    c.g.position.set(c.x, 0, dir > 0 ? LANE.near : LANE.far); c.g.rotation.y = dir > 0 ? 0 : Math.PI; c.g.visible = true; setLit(c);
    return c;
  };

  return {
    cars, root,
    // the scare: a car in the far lane right now, from one side of the house to the other in PASS_T seconds (main.js plays its sound)
    pass() { spawn(-1, { x: PASS_X, v: (2 * PASS_X) / PASS_T, scare: true }); },
    // an ordinary car, from either end
    one(dir = Math.random() < 0.5 ? 1 : -1) { return spawn(dir); },
    // phase: how often cars come by, and whether their lights are on; 'off' clears the road (the dream drive brings its own traffic)
    update(dt, phase) {
      if (phase === 'off') { for (const c of cars) if (c.on) { c.on = false; c.g.visible = false; } return; }
      const night = phase === 'night' || phase === 'title';
      if (night !== lit) { lit = night; for (const c of cars) if (c.on) setLit(c); }
      timer -= dt;
      if (timer <= 0) {
        timer = phase === 'day' ? 16 + Math.random() * 30 : phase === 'morning' ? 22 + Math.random() * 40 : 75 + Math.random() * 120;
        if (cars.length) this.one();
      }
      for (const c of cars) {
        if (!c.on) continue;
        c.x += c.dir * c.v * dt; c.g.position.x = c.x;
        if (!c.heard && Math.abs(c.x) < 58) { c.heard = true; sfx.moving('sfx/car_pass', { gain: phase === 'day' ? 0.42 : 0.3, from: c.dir > 0 ? -0.9 : 0.9, to: c.dir > 0 ? 0.9 : -0.9, dur: 116 / c.v }); }
        if (Math.abs(c.x) > EDGE + 2 && !(c.scare && c.x > -EDGE)) { c.on = false; c.g.visible = false; }
      }
    },
  };
}
