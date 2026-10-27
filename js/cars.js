// The family car, seen from the back seat: a 90s sedan interior (seats, dash, wheel, glove box, mirror) that drives along the real road in front of
// the house, with traffic. Used for the road-trip dream, and for driving away at the end. Car-local axes: +x forward, +y up, +z right.
import * as THREE from 'three';

const std = (c, r = 0.8, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });

function makeNpcCar(color) {
  const g = new THREE.Group(), body = std(color, 0.45, 0.2), dark = std(0x1a1d22, 0.2, 0.4);
  const add = (geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; g.add(m); return m; };
  add(new THREE.BoxGeometry(4.5, 0.75, 1.8), body, 0, 0.62, 0);
  add(new THREE.BoxGeometry(2.3, 0.62, 1.62), dark, -0.2, 1.28, 0);
  for (const [x, z] of [[1.4, 0.9], [1.4, -0.9], [-1.4, 0.9], [-1.4, -0.9]]) { const w = add(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 14), std(0x0d0d0e, 1), x, 0.32, z); w.rotation.x = Math.PI / 2; }
  const tail = new THREE.MeshBasicMaterial({ color: 0x4a0000, fog: false });
  add(new THREE.BoxGeometry(0.06, 0.16, 0.5), tail, -2.26, 0.78, 0.55); add(new THREE.BoxGeometry(0.06, 0.16, 0.5), tail, -2.26, 0.78, -0.55);
  g.userData.tail = tail;
  return g;
}

export function createCar(scene) {
  const G = new THREE.Group(); G.visible = false; scene.add(G);
  const dome = new THREE.PointLight(0xfff0d8, 1.6, 6, 1.5); dome.position.set(0, 1.55, 0.1); G.add(dome);
  const domeFill = new THREE.PointLight(0xcfd8ff, 0.8, 5, 1.5); domeFill.position.set(0, 1.0, 0.9); G.add(domeFill);
  const add = (parent, geo, mat, x, y, z) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = m.receiveShadow = true; parent.add(m); return m; };
  const box = (parent, w, h, d, mat, x, y, z) => add(parent, new THREE.BoxGeometry(w, h, d), mat, x, y, z);
  const cloth = std(0x8c7b66, 0.95), dash = std(0x2a2a2d, 0.6), panel = std(0x6a6155, 0.8), carpet = std(0x3b3834, 1), liner = std(0xcdc5b1, 0.95), pillar = std(0x35332f, 0.7), black = std(0x0e0e10, 0.5), chrome = std(0xcfd2d4, 0.2, 0.9);

  // ---- the shell: floor, roof, door panels, pillars ----
  box(G, 3.9, 0.06, 1.9, carpet, 0.45, 0.22, 0);
  box(G, 3.9, 0.06, 1.9, liner, 0.45, 1.5, 0);
  for (const s of [-1, 1]) {
    box(G, 3.6, 0.72, 0.08, panel, 0.4, 0.62, s * 0.96);                    // lower door panels
    box(G, 3.6, 0.06, 0.1, pillar, 0.4, 0.99, s * 0.96);                    // window sills
    box(G, 0.1, 0.52, 0.1, pillar, 0.42, 1.25, s * 0.96);                   // B pillar
    box(G, 0.1, 0.52, 0.1, pillar, -1.3, 1.25, s * 0.96);                   // C pillar
    const a = box(G, 0.09, 0.62, 0.09, pillar, 1.55, 1.22, s * 0.93); a.rotation.z = -0.6;   // A pillars lean back
    add(G, new THREE.BoxGeometry(0.06, 0.04, 0.3), chrome, 0.55, 0.9, s * 0.9);            // door handles
  }
  box(G, 0.1, 0.52, 1.8, liner, -1.62, 1.22, 0);                            // rear parcel shelf pillar (the back window frame)
  box(G, 0.7, 0.1, 1.9, dash, -1.45, 0.98, 0);                              // parcel shelf
  // ---- the dash, wheel, console, glove box ----
  box(G, 0.7, 0.34, 1.9, dash, 2.0, 0.82, 0); box(G, 0.5, 0.22, 1.9, dash, 1.82, 1.04, 0);
  box(G, 0.7, 0.12, 0.9, dash, 1.95, 1.0, -0.45);                           // instrument hood
  const dial = new THREE.Mesh(new THREE.CircleGeometry(0.1, 20), new THREE.MeshBasicMaterial({ color: 0x20301c })); dial.position.set(1.64, 0.98, -0.62); dial.rotation.y = Math.PI / 2; dial.rotation.y = -Math.PI / 2; G.add(dial);
  box(G, 0.55, 0.4, 0.34, dash, 1.82, 0.62, 0); box(G, 0.05, 0.1, 0.22, black, 1.54, 0.74, 0);   // centre console + radio
  const wheelG = new THREE.Group(); wheelG.position.set(1.62, 0.9, -0.45); wheelG.rotation.z = -0.5; G.add(wheelG);
  { const rim = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 10, 28), black); rim.rotation.y = Math.PI / 2; wheelG.add(rim);
    for (const a of [0, 2.1, 4.2]) { const sp = box(wheelG, 0.02, 0.19, 0.03, black, 0, 0, 0); sp.rotation.x = a; sp.position.set(0, Math.cos(a) * 0.09, Math.sin(a) * 0.09); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.04, 12), black); hub.rotation.z = Math.PI / 2; wheelG.add(hub); }
  // the glove box: a door on the passenger side of the dash, hinged at its bottom edge
  const glovePivot = new THREE.Group(); glovePivot.position.set(1.64, 0.58, 0.5); G.add(glovePivot);
  box(glovePivot, 0.035, 0.26, 0.5, std(0x34322f, 0.6), 0, 0.13, 0); box(glovePivot, 0.045, 0.03, 0.14, chrome, -0.01, 0.2, 0);
  const gloveInside = box(G, 0.42, 0.24, 0.5, black, 1.84, 0.7, 0.5);   // the dark mouth behind the door
  gloveInside.visible = true;
  // ---- seats ----
  const seat = (x, z, back) => {
    box(G, 0.55, 0.2, 0.55, cloth, x, 0.38, z);
    const bk = box(G, 0.14, 0.68, 0.56, cloth, x - 0.28, 0.82, z); bk.rotation.z = 0.18;
    const hd = box(G, 0.12, 0.2, 0.3, cloth, x - 0.3 - 0.04, 1.28, z); hd.rotation.z = 0.18;
    return { cushion: null, back: bk, head: hd };
  };
  seat(0.95, -0.42); seat(0.95, 0.42);                                         // front
  box(G, 0.6, 0.2, 1.55, cloth, -0.6, 0.38, 0);                                // rear bench
  { const bk = box(G, 0.16, 0.7, 1.55, cloth, -0.95, 0.82, 0); bk.rotation.z = 0.12; for (const z of [-0.45, 0.45]) box(G, 0.12, 0.2, 0.28, cloth, -0.98, 1.27, z); }
  // seatbelts (the front ones stay buckled when the people are gone)
  const belt = (z) => { const b = box(G, 0.02, 0.7, 0.07, black, 0.88, 0.95, z); b.rotation.x = 0.5; return b; };
  belt(-0.5); belt(0.35);
  // ---- the rear-view mirror ----
  const mc = document.createElement('canvas'); mc.width = 128; mc.height = 40; const mg = mc.getContext('2d');
  const mtex = new THREE.CanvasTexture(mc); mtex.colorSpace = THREE.SRGBColorSpace;
  const mirror = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.09), new THREE.MeshBasicMaterial({ map: mtex, toneMapped: false })); mirror.position.set(1.45, 1.32, 0); mirror.rotation.y = Math.PI / 2; G.add(mirror);
  box(G, 0.03, 0.12, 0.03, black, 1.52, 1.4, 0);
  const drawMirror = (face) => {
    const gr = mg.createLinearGradient(0, 0, 128, 40); gr.addColorStop(0, '#6f7a85'); gr.addColorStop(1, '#a9b3bb'); mg.fillStyle = gr; mg.fillRect(0, 0, 128, 40);
    mg.fillStyle = '#2f2c28'; mg.fillRect(0, 26, 128, 14); mg.fillStyle = '#46423c'; mg.fillRect(8, 14, 34, 26); mg.fillRect(86, 14, 34, 26);   // the back seat
    if (face) { mg.fillStyle = '#050506'; mg.fillRect(46, 8, 26, 32); mg.beginPath(); mg.ellipse(59, 11, 11, 13, 0, 0, 7); mg.fill(); mg.fillStyle = '#fff'; mg.beginPath(); mg.ellipse(54, 10, 3.2, 5, 0.3, 0, 7); mg.ellipse(64, 10, 3.2, 5, -0.3, 0, 7); mg.fill(); mg.strokeStyle = '#fff'; mg.lineWidth = 1.6; mg.beginPath(); mg.arc(59, 13, 8, 0.15 * Math.PI, 0.85 * Math.PI); mg.stroke(); }
    mtex.needsUpdate = true;
  };
  drawMirror(false);
  // the hood ahead, a little shake of the road
  const hood = box(G, 1.2, 0.08, 1.7, std(0x6f2a22, 0.4, 0.3), 2.85, 0.92, 0);
  // ---- outside: the street ----
  const traffic = []; const colors = [0x2a4a7a, 0x8a8f96, 0x7a1f1f, 0xd9d3c2, 0x2d5a3d, 0x1f1f24, 0xb08a2a];
  const sceneRoot = new THREE.Group(); scene.add(sceneRoot);
  for (let i = 0; i < 9; i++) { const c = makeNpcCar(colors[i % colors.length]); sceneRoot.add(c); traffic.push({ g: c, lane: i < 6 ? 1 : -1, off: 0, v: 0, rel: 0 }); c.visible = false; }

  const car = {
    group: G, glovePivot, wheelG, traffic, hood, mirror, drawMirror,
    x: 0, z: -28.8, heading: 0, speed: 0, lookBack: false, jam: false, bob: 0, brake: false, gloveOpen: 0,
    // the seat you sit in: back right, or (after the front seats empty) the passenger seat
    eye: new THREE.Vector3(-0.62, 1.0, 0.0), seatName: 'back',
    place(x, z, heading) { car.x = x; car.z = z; car.heading = heading; },
    show(on) { G.visible = on; for (const t of traffic) t.g.visible = on && t.active !== false; },
    setSeat(name) { car.seatName = name; car.eye.set(name === 'front' ? 0.82 : -0.62, name === 'front' ? 1.02 : 1.0, name === 'front' ? 0.42 : 0.0); },
    // world position/yaw of the car, and the camera in it
    apply() { G.position.set(car.x, 0.0, car.z); G.rotation.y = car.heading; },
    cameraWorld(out) { G.updateMatrixWorld(true); return out.copy(car.eye).add(new THREE.Vector3(0, Math.sin(car.bob) * 0.012, Math.sin(car.bob * 0.7) * 0.006)).applyMatrix4(G.matrixWorld); },
    baseYaw() { return car.heading - Math.PI / 2; },
    openGlove(k) { car.gloveOpen = k; glovePivot.rotation.z = -k * 1.45; },
    // traffic around us: cars ahead in our lane, cars passing in the other lane, one behind
    layoutTraffic(mode) {
      traffic.forEach((t, i) => {
        t.active = true;
        if (i < 4) { t.lane = 1; t.off = 8 + i * 9.5; }
        else if (i < 6) { t.lane = 1; t.off = -10 - (i - 4) * 12; }
        else { t.lane = -1; t.off = 20 + (i - 6) * 30; }
        t.g.visible = G.visible;
      });
      car.trafficMode = mode;
    },
    update(dt) {
      car.bob += dt * (3 + car.speed * 0.6);
      // our own motion (along the heading)
      const hx = Math.cos(car.heading), hz = -Math.sin(car.heading);
      car.x += hx * car.speed * dt; car.z += hz * car.speed * dt;
      // the road runs along x: wrap so it never ends
      if (car.road && car.x > 190) car.x -= 380; if (car.road && car.x < -190) car.x += 380;
      car.apply();
      wheelG.rotation.x = car.steer || 0;
      hood.position.y = 0.92 + Math.sin(car.bob * 1.3) * 0.004;
      // the other cars
      for (const t of traffic) {
        if (t.active === false) continue;
        const sp = t.lane === 1 ? Math.max(0, car.speed + (car.trafficMode === 'jam' ? 0 : (t.off > 0 ? 1.5 : -0.5))) : -(14 + (t.off % 7));
        t.off += (t.lane === 1 ? (sp - car.speed) : (sp - car.speed)) * dt;
        if (t.lane === -1) { if (t.off < -60) t.off += 150; }
        const laneZ = t.lane === 1 ? 0 : -3.5;   // the other lane is to the left of ours (car-local -z)
        const lx = t.off, lz = laneZ;
        // place in world: car-local (lx, 0, lz) rotated by heading
        const c = Math.cos(car.heading), s = Math.sin(car.heading);
        t.g.position.set(car.x + lx * c + lz * s, 0, car.z - lx * s + lz * c);
        t.g.rotation.y = car.heading + (t.lane === -1 ? Math.PI : 0);
        t.g.userData.tail.color.setHex(car.brake && t.lane === 1 ? 0xff1a14 : 0x4a0000);
      }
    },
  };
  car.setSeat('back'); car.layoutTraffic('cruise'); car.apply();
  return car;
}
