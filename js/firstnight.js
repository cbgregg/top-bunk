// Moving day and night one: the things in your room that are not yours, and what the first night does with them.
//   box          the fourth box: your name on it in a small child's crayon, already in your room when you bring in your last one
//   marks        pencil height marks on the side of your closet: BEN 5, BEN 6, BEN 7, and nothing after
//   drawing()    the hall drawing with one more figure in it, fresh crayon, standing behind the little one
//   dent         a body pressed into the bottom bunk's quilt and pillow (set(k), 0 flat .. 1 full), smoothing out on its own (relax())
//   rock(i)      a kitchen chair left rocking on its legs, dying away
//   covers       under the covers with something at the bed: its shadow through the blanket, its fingers pressing in, a corner peeled back
import * as THREE from 'three';

export function createFirstNight({ W, scene, camera }) {
  const V3 = THREE.Vector3;
  const canvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const rnd = (s) => () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; };
  const CRAYON = '"Gloria Hallelujah", "Comic Sans MS", "Marker Felt", cursive';

  // ---------- the fourth box ----------
  const box = (() => {
    const S = 256, side = (label) => {
      const [c, g] = canvas(S, S), r = rnd(label ? 7 : 3);
      g.fillStyle = '#a77d4e'; g.fillRect(0, 0, S, S);
      for (let i = 0; i < 9; i++) { g.fillStyle = `rgba(80,52,25,${0.05 + r() * 0.08})`; g.beginPath(); g.ellipse(r() * S, r() * S, 20 + r() * 60, 10 + r() * 40, r() * 3, 0, 7); g.fill(); }
      g.fillStyle = 'rgba(205,175,120,0.55)'; g.fillRect(S / 2 - 20, 0, 40, S);   // packing tape down the middle
      for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? '40,25,10' : '230,200,150'},${r() * 0.07})`; g.fillRect(r() * S, r() * S, 1.5, 1.5); }
      if (label) {   // a small child's crayon, pressed hard, the letters different sizes and drifting uphill
        g.save(); g.translate(S * 0.5, S * 0.6); g.rotate(-0.07);
        g.font = `bold 92px ${CRAYON}`; g.textAlign = 'center'; g.textBaseline = 'middle';
        const letters = label.split(''), widths = [64, 60, 64];
        let x = -widths.slice(0, letters.length).reduce((a, b) => a + b, 0) / 2;
        letters.forEach((ch, i) => {
          for (let p = 0; p < 3; p++) {
            g.save(); g.translate(x + widths[i] / 2 + (r() - 0.5) * 3, -i * 7 + (r() - 0.5) * 3); g.rotate((r() - 0.5) * 0.12); g.scale(1 + i * 0.05, 1 + i * 0.07);
            g.globalAlpha = 0.5 + r() * 0.3; g.fillStyle = '#1f2f86'; g.fillText(ch, 0, 0); g.restore();
          }
          x += widths[i];
        });
        g.restore(); g.globalAlpha = 1;
        // the wax skips over the corrugation: little gaps across the strokes
        g.globalCompositeOperation = 'destination-out';
        for (let y = 0; y < S; y += 3) { g.fillStyle = `rgba(0,0,0,${0.12 + r() * 0.1})`; g.fillRect(0, y, S, 1); }
        g.globalCompositeOperation = 'source-over';
        g.fillStyle = 'rgba(167,125,78,1)'; g.globalCompositeOperation = 'destination-over'; g.fillRect(0, 0, S, S); g.globalCompositeOperation = 'source-over';
      }
      return tex(c);
    };
    const plain = new THREE.MeshStandardMaterial({ map: side(null), roughness: 0.92 }), named = new THREE.MeshStandardMaterial({ map: side('BUD'), roughness: 0.92 });
    // +x, -x, +y, -y, +z, -z: the name faces +z (turn the box to show it)
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.38, 0.42), [plain, plain, plain, plain, named, plain]);
    m.castShadow = m.receiveShadow = true; m.visible = false; m.name = 'strange box'; scene.add(m);
    return {
      mesh: m,
      place(x, z, rot) { m.position.set(x, 0.19, z); m.rotation.set(0, rot, 0); m.visible = true; },
      hide() { m.visible = false; },
    };
  })();

  // ---------- the height marks ----------
  const marks = (() => {
    const [c, g] = canvas(256, 512), r = rnd(23);
    const paint = () => {
      g.clearRect(0, 0, 256, 512);
      // pencil: thin grey lines, each with a name and an age beside it; the last one is the highest, and there is nothing over it
      [[5, 400], [6, 318], [7, 236]].forEach(([age, y]) => {
        g.strokeStyle = 'rgba(70,70,78,0.85)'; g.lineWidth = 3; g.beginPath(); g.moveTo(20, y + (r() - 0.5) * 3); g.lineTo(120, y + (r() - 0.5) * 3); g.stroke();
        g.strokeStyle = 'rgba(70,70,78,0.4)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(26, y + 4); g.lineTo(110, y + 3); g.stroke();
        g.font = `30px ${CRAYON}`; g.fillStyle = 'rgba(62,62,70,0.82)'; g.save(); g.translate(130, y + 8); g.rotate(-0.03 + (r() - 0.5) * 0.05); g.fillText(`BEN ${age}`, 0, 0); g.restore();
      });
      // and a last line, much higher, rubbed out
      g.strokeStyle = 'rgba(80,80,88,0.18)'; g.lineWidth = 4; g.beginPath(); g.moveTo(20, 60); g.lineTo(120, 63); g.stroke();
      for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(110,110,118,${r() * 0.05})`; g.fillRect(14 + r() * 120, 48 + r() * 30, 6, 2); }
    };
    paint();
    const t = tex(c); t.colorSpace = THREE.SRGBColorSpace;
    if (document.fonts && document.fonts.load) document.fonts.load(`30px "Gloria Hallelujah"`).then(() => { paint(); t.needsUpdate = true; }).catch(() => {});
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.3, 0.6), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.9, polygonOffset: true, polygonOffsetFactor: -2, depthWrite: false }));
    m.visible = false; m.name = 'height marks'; scene.add(m);
    // on the side of your closet that faces the door, found by feeling for it: a ray along the room at chest height
    const ray = new THREE.Raycaster();
    return {
      mesh: m, pos: new V3(),
      place() {
        const door = W.doors.kid; if (!door) return false;
        const from = new V3(door.mid.x - 0.2, 0.95, door.mid.z + 0.35);
        ray.set(from, new V3(-1, 0, 0)); ray.far = 3;
        const inDoor = (o) => { for (let n = o; n; n = n.parent) if (Object.values(W.doors).some((d) => d.g === n || d.fr === n)) return true; return false; };
        const hit = ray.intersectObjects(W.house.children, true).find((h) => h.face && Math.abs(h.face.normal.x) > 0.5 && h.point.x < door.mid.x - 0.5 && !inDoor(h.object));
        if (!hit) return false;
        // the strip sits on the closet's end panel, 9 cm in from the edge by the door, the ages at a kid's heights (5: 1.10 m .. 7: 1.22 m)
        m.position.set(hit.point.x + 0.003, 1.0, hit.point.z + 0.08); m.rotation.set(0, Math.PI / 2, 0); m.visible = true;
        this.pos.copy(m.position); return true;
      },
    };
  })();

  // ---------- the drawing, with someone new in it ----------
  function drawing() {
    const src = W.T.drawing0.image, w = src.width, h = src.height, [c, g] = canvas(w, h), r = rnd(77);
    g.drawImage(src, 0, 0);
    // fresh wax: darker, heavier, pressed so hard it has torn the paper in places. It stands right behind the little one on the top bunk
    const fx = 300, top = 52;
    const stroke = (pts, wd) => { g.strokeStyle = '#050505'; g.lineCap = 'round'; g.lineJoin = 'round';
      for (let p = 0; p < 4; p++) { g.lineWidth = wd * (0.7 + r() * 0.5); g.globalAlpha = 0.75 + r() * 0.25; g.beginPath(); pts.forEach(([x, y], i) => { const jx = x + (r() - 0.5) * 3, jy = y + (r() - 0.5) * 3; i ? g.lineTo(jx, jy) : g.moveTo(jx, jy); }); g.stroke(); } g.globalAlpha = 1; };
    for (let y = top + 40; y < 330; y += 3) { const w2 = 14 + Math.sin((y - top) / 50) * 4; stroke([[fx - w2, y], [fx + w2, y + (r() - 0.5) * 4]], 5); }
    for (let y = top; y < top + 44; y += 3) { const dy = y - (top + 22), w2 = Math.sqrt(Math.max(0, 22 * 22 - dy * dy)); stroke([[fx - w2, y], [fx + w2, y]], 4); }
    // two arms, down over the little one's head, the hands too big
    stroke([[fx + 12, top + 55], [fx + 25, top + 110], [345, 168], [362, 176]], 6); stroke([[fx - 12, top + 55], [fx - 6, top + 112], [338, 172]], 6);
    for (const [x, y] of [[362, 176], [338, 172]]) for (let k = -2; k <= 2; k++) stroke([[x, y], [x + 6 + k * 3, y + 14 + Math.abs(k) * 2]], 2.5);
    // two white eyes, no smile: a straight line
    g.fillStyle = '#fff'; g.beginPath(); g.ellipse(fx - 7, top + 18, 5, 6, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(fx + 7, top + 18, 5, 6, 0, 0, 7); g.fill();
    g.fillStyle = '#000'; g.beginPath(); g.arc(fx - 6, top + 20, 3, 0, 7); g.fill(); g.beginPath(); g.arc(fx + 8, top + 20, 3, 0, 7); g.fill();
    g.strokeStyle = '#ddd'; g.lineWidth = 2; g.beginPath(); g.moveTo(fx - 9, top + 32); g.lineTo(fx + 9, top + 32); g.stroke();
    // the paper torn where the wax went through
    for (let i = 0; i < 5; i++) { const x = fx - 10 + r() * 20, y = top + 80 + r() * 150; g.fillStyle = 'rgba(40,30,20,0.6)'; g.beginPath(); g.ellipse(x, y, 1.5 + r() * 2, 4 + r() * 4, r() * 3, 0, 7); g.fill(); }
    const t = tex(c); t.colorSpace = W.T.drawing0.colorSpace; return t;
  }

  // ---------- the dent in the bottom bunk ----------
  // A body lay down on it: head in the pillow, the shoulders, the back, two long legs and the heels past the foot of the bed. Built once
  // in the quilt's own vertices (each vertex pushed down by the body's shape and the cloth round it drawn a little up), set by k
  const dent = (() => {
    let floorY = 0, ready = false, q = null, base = null, push = null, pil = null, pbase = null, ppush = null, k = 0, goal = 0, rate = 0;
    function shapeAt(x, z, H, F, side) {
      // distance along the body (0 head .. 1 heels) and across it, in metres
      const ax = F.x - H.x, az = F.z - H.z, L = Math.hypot(ax, az), ux = ax / L, uz = az / L;
      const dx = x - H.x, dz = z - H.z, t = (dx * ux + dz * uz) / L, d = dx * -uz + dz * ux;
      if (t < -0.08 || t > 1.08) return 0;
      const sm = (a, b, v) => { const u = Math.max(0, Math.min(1, (v - a) / (b - a))); return u * u * (3 - 2 * u); };
      let depth = 0;
      const blob = (cx, w, deep) => { const q2 = (d - cx) / w; return q2 * q2 < 1 ? deep * (1 - q2 * q2) * (1 - q2 * q2) : 0; };
      // shoulders and back (wide), the hips, then two legs apart, narrowing to the heels
      const torso = sm(0.12, 0.2, t) * (1 - sm(0.5, 0.6, t));
      depth = Math.max(depth, torso * blob(0, 0.21 - 0.05 * sm(0.25, 0.45, t), 0.075));
      const hips = sm(0.45, 0.52, t) * (1 - sm(0.6, 0.66, t));
      depth = Math.max(depth, hips * blob(0, 0.17, 0.085));
      const legs = sm(0.56, 0.64, t) * (1 - sm(0.97, 1.04, t));
      const spread = 0.05 + 0.03 * sm(0.6, 1, t);
      depth = Math.max(depth, legs * Math.max(blob(-spread, 0.065, 0.06), blob(spread, 0.065, 0.06)));
      // the head, at the pillow end (most of it is in the pillow)
      const head = sm(-0.06, 0.0, t) * (1 - sm(0.1, 0.14, t));
      depth = Math.max(depth, head * blob(0, 0.1, 0.03));
      // the cloth pulled up round the edge of it
      const near = Math.abs(d) - 0.2 * torso - 0.15 * legs;
      const rim = (torso + legs) * Math.exp(-((near - 0.04) * (near - 0.04)) / 0.0009) * 0.014;
      return depth - rim * side;
    }
    function build() {
      const lb = W.lowerBunk; if (!lb || !lb.quilt) return false;
      q = lb.quilt; q.updateMatrixWorld(true);
      const pa = q.geometry.attributes.position, n = pa.count, v = new V3(), inv = new THREE.Matrix4().copy(q.matrixWorld).invert();
      base = Float32Array.from(pa.array); push = new Float32Array(n);
      floorY = new V3(0, lb.top + 0.011, 0).applyMatrix4(inv).y;   // the sheet's top, in the quilt's own frame
      // the bed in world space: its head is the pillow's end
      const box3 = new THREE.Box3().setFromBufferAttribute(pa); box3.applyMatrix4(q.matrixWorld);
      const pw = lb.pillow.getWorldPosition(new V3());
      const headEnd = Math.abs(pw.x - box3.min.x) < Math.abs(pw.x - box3.max.x) ? box3.min.x : box3.max.x, footEnd = headEnd === box3.min.x ? box3.max.x : box3.min.x;
      const dir = Math.sign(footEnd - headEnd), zc = box3.min.z + (box3.max.z - box3.min.z) * 0.3;   // toward the room side, where the cloth hangs
      const H = { x: headEnd + dir * 0.17, z: zc }, F = { x: footEnd + dir * 0.18, z: zc };
      for (let i = 0; i < n; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(q.matrixWorld);
        push[i] = v.y > lb.top + 0.003 ? shapeAt(v.x, v.z, H, F, 1) : 0;   // only the top of the quilt, not the cloth hanging down the side
      }
      void inv;
      // the pillow: a hollow where the head was
      pil = lb.pillow; pil.updateMatrixWorld(true);
      const pp = pil.geometry.attributes.position; pbase = Float32Array.from(pp.array); ppush = new Float32Array(pp.count);
      const pb = new THREE.Box3().setFromBufferAttribute(pp); const ptop = pb.max.y;
      const hc = new V3(H.x - dir * 0.13, 0, H.z).applyMatrix4(new THREE.Matrix4().copy(pil.matrixWorld).invert());
      for (let i = 0; i < pp.count; i++) {
        const x = pp.getX(i), y = pp.getY(i), z = pp.getZ(i), r2 = ((x - hc.x) ** 2) / 0.012 + ((z - hc.z) ** 2) / 0.018;
        if (y > ptop - 0.05 && r2 < 1) ppush[i] = 0.05 * (1 - r2) * (1 - r2);
      }
      ready = true; return true;
    }
    function apply() {
      const pa = q.geometry.attributes.position, a = pa.array;
      for (let i = 0; i < push.length; i++) a[i * 3 + 1] = Math.max(floorY, base[i * 3 + 1] - push[i] * k);   // never through the sheet under it
      pa.needsUpdate = true; q.geometry.computeVertexNormals();
      const pp = pil.geometry.attributes.position, b = pp.array;
      for (let i = 0; i < ppush.length; i++) b[i * 3 + 1] = pbase[i * 3 + 1] - ppush[i] * k;
      pp.needsUpdate = true; pil.geometry.computeVertexNormals();
    }
    return {
      get k() { return k; },
      // world position of the middle of the body
      centre: new V3(),
      set(v) { if (!ready && !build()) return; k = goal = v; rate = 0; apply(); },
      relax(sec = 7) { goal = 0; rate = k / Math.max(0.1, sec); },
      tick(dt) { if (!ready || k === goal || !rate) return; k = Math.max(goal, k - rate * dt); apply(); if (k === goal) rate = 0; },
    };
  })();

  // ---------- a chair left rocking ----------
  const rocking = [];
  function rock(i, amp = 0.09) {
    const c = W.chairs[i]; if (!c) return;
    rocking.push({ c, t: 0, amp, y0: c.holder.position.y, rz: c.holder.rotation.z });
  }
  function tickRock(dt) {
    for (let j = rocking.length - 1; j >= 0; j--) {
      const r = rocking[j]; r.t += dt;
      const a = r.amp * Math.exp(-r.t * 0.35) * Math.sin(r.t * 4.1), h = r.c.holder;
      // tipped onto two legs: it turns about the legs on the ground, so it rises by the width it leans over
      h.rotation.z = r.rz + a; h.position.y = r.y0 + Math.abs(Math.sin(a)) * 0.2;
      if (r.t > 14) { h.rotation.z = r.rz; h.position.y = r.y0; rocking.splice(j, 1); }
    }
  }
  const rockClicks = (fn) => { for (const r of rocking) { const ph = Math.sin(r.t * 4.1), prev = r.ph || 0; if (ph * prev < 0 && Math.exp(-r.t * 0.35) > 0.15) fn(r.c.holder.position, Math.exp(-r.t * 0.35)); r.ph = ph; } };

  // ---------- under the covers ----------
  // The comforter pulled right over your head: a real sheet of the bunk's own cloth a hand's width from your eyes, folded where it falls,
  // resting on the mattress at the bottom. It is lit from outside by the hall light coming in through your door (a shadow-casting spot)
  // and shows that light through it, so whatever stands between the door and the bed is a real shadow on it: the thing's own body,
  // posed by the bunk. Its hand comes down and its fingertips press the cloth in; the corner by your face lifts and its face is there.
  //   covers.start() / stop(), covers.s: { light 0..1, warm 0..1 (the hall light, Mom's), lift 0..1 }, covers.at(theta, phi, r) a
  //   point on the cloth's sphere in the world, covers.dimple(points) the fingertips this frame
  const covers = (() => {
    const NU = 120, NV = 80, T0 = -1.9, T1 = 1.9, F0 = -1.0, F1 = 1.35, R0 = 0.4, MAT_Y = 1.615;
    const group = new THREE.Group(); group.visible = false; scene.add(group);
    const geo = new THREE.PlaneGeometry(1, 1, NU, NV), pos = geo.attributes.position, n = pos.count;
    const th = new Float32Array(n), ph = new Float32Array(n), r0 = new Float32Array(n), r1 = new Float32Array(n);
    const uv = geo.attributes.uv;
    for (let i = 0; i < n; i++) {
      const u = uv.getX(i), v = uv.getY(i), t = T0 + (T1 - T0) * u, f = F0 + (F1 - F0) * v; th[i] = t; ph[i] = f;
      // the cloth falls away to the sides and is pulled into soft folds where it drapes over your head and shoulder
      r0[i] = R0 + 0.07 * t * t + 0.02 * Math.max(0, f) + 0.016 * Math.sin(t * 6.5 + f * 2.2) + 0.009 * Math.sin(f * 8.5 - t * 3.1) + 0.004 * Math.sin(t * 17 + f * 13);
      uv.setXY(i, t * 0.55 * 1.6, f * 0.55 * 1.6);   // about metres across the cloth, at the comforter's own scale
    }
    const src = W.M.comforter;
    const mat = new THREE.MeshLambertMaterial({ map: src.map, normalMap: src.normalMap || null, side: THREE.DoubleSide });
    if (src.normalMap) mat.normalScale = new THREE.Vector2(1.2, 1.2);
    mat.userData.trans = { value: 0.9 };
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uTrans = mat.userData.trans;
      // thin cloth: light on its far side comes through it (dimmed and coloured by the weave) as well as lighting its near side; the room's
      // soft light barely reaches in here
      sh.fragmentShader = 'uniform float uTrans;\n' + sh.fragmentShader.replace('#include <lights_lambert_pars_fragment>', THREE.ShaderChunk.lights_lambert_pars_fragment
        .replace('float dotNL = saturate( dot( geometryNormal, directLight.direction ) );', 'float dn = dot( geometryNormal, directLight.direction ); float dotNL = dn > 0.0 ? dn * 0.35 : - dn * uTrans;')
        .replace('reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor );', 'reflectedLight.indirectDiffuse += irradiance * BRDF_Lambert( material.diffuseColor ) * 0.1;'));
    };
    mat.customProgramCacheKey = () => 'blanket-transmit';
    const cloth = new THREE.Mesh(geo, mat); cloth.receiveShadow = true; cloth.castShadow = false; cloth.frustumCulled = false; group.add(cloth);
    const s = { light: 0, warm: 0, lift: 0 };
    let tips = [], spot = null, saved = null, E = null, on = false;
    const local = new V3(), q = new THREE.Quaternion(), ax = new V3(), hp = new V3(), tmpV = new V3();
    const dirOf = (t, f, out) => out.set(Math.sin(t) * Math.cos(f), Math.sin(f), -Math.cos(t) * Math.cos(f));
    function shape() {
      const L = s.lift, ft = tips.map((p) => { const lp = group.worldToLocal(tmpV.copy(p)).clone(); const d = lp.length(); return { d: d - (p.thick || 0.01), dir: lp.divideScalar(d), w: p.w || 0.0012 }; });
      for (let i = 0; i < n; i++) {
        const t = th[i], f = ph[i]; let r = r0[i];
        dirOf(t, f, local);
        // fingertips on the cloth push it in where they touch, and pull it taut in a wider, shallow hollow around them
        for (const tp of ft) {
          const c = local.dot(tp.dir); if (c < 0.7) continue;
          const a2 = 2 * (1 - c), base = r0[i];
          if (tp.d < base) { r = Math.min(r, tp.d + (base - tp.d) * (1 - Math.exp(-a2 / tp.w)), base - (base - tp.d) * 0.35 * Math.exp(-a2 / (tp.w * 10))); }
        }
        local.multiplyScalar(r);
        // the bottom of it lies on the mattress
        const y0 = MAT_Y - group.position.y; if (local.y < y0) { const k = y0 - local.y; local.y = y0; local.z -= k * 0.4 * Math.cos(t); local.x += k * 0.4 * Math.sin(t); }
        // the corner by your face lifted: everything below a hinge across the cloth swings up and out, like a flap pulled from below
        if (L > 0) {
          const w = ss(0.22, 0.42, t) * (1 - ss(0.86, 1.08, t)) * (1 - ss(0.2, 0.32, f));
          if (w > 0) {
            dirOf(t, 0.32, hp).multiplyScalar(r0[i]); ax.set(Math.cos(t), 0, Math.sin(t));
            q.setFromAxisAngle(ax, L * w * 1.9); local.sub(hp).applyQuaternion(q).add(hp);
          }
        }
        pos.setXYZ(i, local.x, local.y, local.z);
      }
      pos.needsUpdate = true; geo.computeVertexNormals();
    }
    const ss = (a, b, v) => { const u = Math.max(0, Math.min(1, (v - a) / (b - a))); return u * u * (3 - 2 * u); };
    function light() {
      if (!spot) return;
      const c = new THREE.Color(0xb9d8c4).lerp(new THREE.Color(0xffcf96), s.warm);
      spot.color.copy(c); spot.intensity = (16 + 22 * s.warm) * s.light;
    }
    return {
      s, group,
      bind(e) { E = e; },
      // the cloth's sphere, in the world: theta across (+ to your right), phi up, at r metres from your eyes
      at(t, f, r, out = new V3()) { group.updateMatrixWorld(true); return group.localToWorld(dirOf(t, f, out).multiplyScalar(r)); },
      start(eye, yaw) {
        mat.map = src.map; mat.normalMap = src.normalMap || null; mat.needsUpdate = false;   // the comforter's own cloth (its photo textures once they are in)
        on = true; group.position.copy(eye); group.rotation.set(0, yaw, 0); group.visible = true; group.updateMatrixWorld(true);
        Object.assign(s, { light: 0, warm: 0, lift: 0 }); tips = []; shape();
        // the hall light: the headlights' spot (it casts shadows and is always there at night, so no shader has to be rebuilt) at your door
        spot = W.carLight; saved = { p: spot.position.clone(), t: spot.target.position.clone(), a: spot.angle, pe: spot.penumbra, i: spot.intensity, c: spot.color.clone(), d: spot.decay, au: spot.shadow.autoUpdate, near: spot.shadow.camera.near, far: spot.shadow.camera.far, bias: spot.shadow.bias };
        const door = W.doors.kid;
        spot.position.set(door.mid.x, 1.9, door.mid.z + 0.08);   // in the doorway itself, so the open leaf does not cut it off
        spot.target.position.set(eye.x, eye.y - 0.1, eye.z - 0.35); spot.target.updateMatrixWorld();
        spot.angle = 0.55; spot.penumbra = 0.6; spot.decay = 1.2; spot.shadow.camera.near = 0.2; spot.shadow.camera.far = 9; spot.shadow.bias = -0.0004; spot.shadow.camera.updateProjectionMatrix();
        spot.shadow.autoUpdate = true; light();
      },
      dimple(points) { tips = points; },
      tick() { if (!on) return; light(); shape(); },
      stop() {
        on = false; group.visible = false; tips = []; s.lift = 0;
        if (spot && saved) { spot.position.copy(saved.p); spot.target.position.copy(saved.t); spot.target.updateMatrixWorld(); spot.angle = saved.a; spot.penumbra = saved.pe; spot.intensity = saved.i; spot.color.copy(saved.c); spot.decay = saved.d; spot.shadow.autoUpdate = saved.au; spot.shadow.camera.near = saved.near; spot.shadow.camera.far = saved.far; spot.shadow.bias = saved.bias; spot.shadow.camera.updateProjectionMatrix(); }
        spot = null;
      },
      // built once ahead, while the screen is dark at the start of the night, so it never hitches when it is needed
      warm(renderer) { group.visible = true; group.position.set(0, -50, 0); try { renderer.compile(group, camera, scene); } catch (e) { /* built on first use */ } group.visible = false; },
    };
  })();

  // ---------- the thing at the bed ----------
  // It is posed on top of whatever its clip does: one arm reaches a point (two-bone IK: the elbow out and up, the hand on the target),
  // and while the corner is up its head is put at a point, the body following
  const bedside = (() => {
    let reachAt = null, headAt = null, hand = 'R', tips = [], clearOf = null;
    const S = new V3(), Tg = new V3(), Eb = new V3(), u = new V3(), pole = new V3(), dir = new V3(), w = new V3(), h = new V3();
    // the arm onto a point: the middle fingertip is carried onto it. Each round the forearm is aimed and the upper arm turned so the
    // wrist goes where the fingertip's miss says it should (the hand rides along, curled as it is)
    const midTip = (r) => { const b2 = r.bones[hand + '_Finger22'], b1 = r.bones[hand + '_Finger21']; if (!b2 || !b1) return null; b2.updateWorldMatrix(true, false); const p2 = b2.getWorldPosition(new V3()), p1 = b1.getWorldPosition(new V3()); return p2.add(p2.clone().sub(p1).multiplyScalar(0.8)); };
    function ik(r) {
      const up = r.bones[hand + '_UpperArm'], fo = r.bones[hand + '_Forearm'], ha = r.bones[hand + '_Hand']; if (!up || !fo || !ha) return;
      for (let it = 0; it < 8; it++) {
        up.updateWorldMatrix(true, true);
        up.getWorldPosition(S); fo.getWorldPosition(Eb); ha.getWorldPosition(w);
        const tip = midTip(r); if (!tip) return;
        Tg.copy(w).add(tip.sub(reachAt).negate());   // the wrist, moved by however far the fingertip misses
        if (it === 0) {   // start from the elbow out and up
          const a = S.distanceTo(Eb), b = Eb.distanceTo(w); let d = S.distanceTo(Tg); d = Math.max(Math.abs(a - b) + 0.01, Math.min(a + b - 0.005, d));
          u.copy(Tg).sub(S).normalize(); pole.set(0, 1, 0).addScaledVector(u, -u.y).normalize();
          const ca = (a * a + d * d - b * b) / (2 * a * d), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
          r.aim(up, fo, h.copy(S).addScaledVector(u, a * ca).addScaledVector(pole, a * sa).sub(S).normalize(), 1);
        } else {
          const cur = h.copy(w).sub(S).normalize(), want = u.copy(Tg).sub(S).normalize(), axis = new V3().crossVectors(cur, want), ang = Math.acos(Math.min(1, cur.dot(want)));
          if (axis.lengthSq() > 1e-10 && ang > 1e-4) r.rotateWorld(up, new THREE.Quaternion().setFromAxisAngle(axis.normalize(), ang));
        }
        fo.updateWorldMatrix(true, true); fo.getWorldPosition(Eb);
        r.aim(fo, ha, h.copy(Tg).sub(Eb).normalize(), 1);
      }
    }
    return {
      set({ reach = null, head = null, side = 'R', clear = clearOf } = {}) { reachAt = reach; headAt = head; hand = side; clearOf = clear; },
      post(e) {
        return (r) => {
          if (headAt) {   // the head where it is wanted: move the whole figure (its feet are out of sight under the bunk's edge)
            e.root.updateMatrixWorld(true); const ey = e.head.eyes; if (ey) { if (!ey.geometry.boundingBox) ey.geometry.computeBoundingBox(); ey.localToWorld(ey.geometry.boundingBox.getCenter(h)); } else e.head.getWorldPosition(h);
            e.root.position.add(h.sub(headAt).negate()); e.root.updateMatrixWorld(true);
          }
          if (clearOf) {   // never into the cloth: the head stays clear of your eyes by this much, the whole figure kept back
            e.root.updateMatrixWorld(true); r.bones.Head.getWorldPosition(h); const d = h.distanceTo(clearOf.eye);
            if (d < clearOf.r) { const push = h.sub(clearOf.eye); push.y = 0; e.root.position.add(push.normalize().multiplyScalar(clearOf.r - d)); e.root.updateMatrixWorld(true); }   // back across the floor
          }
          if (reachAt) ik(r);
        };
      },
      // the hand where it meets the cloth: each finger's joints and its tip (carried on a little past the last joint), and the palm, in the
      // world, each with how wide a dent it makes (.w, in squared radians at the cloth) and how thick it is (.thick)
      fingertips(e) {
        const r = e.rig; if (!r) return [];
        tips.length = 0;
        const add = (p, w, thick) => { p.w = w; p.thick = thick; tips.push(p); };
        const ha = r.bones[hand + '_Hand']; if (ha) { ha.updateWorldMatrix(true, false); add(ha.getWorldPosition(new V3()), 0.03, 0.085); }
        for (const f of ['Finger1', 'Finger2', 'Finger3', 'Finger4', 'Finger0']) {
          const b0 = r.bones[hand + '_' + f], b1 = r.bones[hand + '_' + f + '1'], b2 = r.bones[hand + '_' + f + '2']; if (!b2 || !b1 || !b0) continue;
          b2.updateWorldMatrix(true, false);
          const p0 = b0.getWorldPosition(new V3()), p1 = b1.getWorldPosition(new V3()), p2 = b2.getWorldPosition(new V3());
          add(p0, 0.014, 0.06); add(p1, 0.011, 0.05); add(p2.clone(), 0.009, 0.042);
          add(p2.clone().add(p2.clone().sub(p1).multiplyScalar(0.8)), 0.006, 0.032);
        }
        return tips;
      },
    };
  })();

  // nothing of night one's bedside outlives it: the cloth hidden and its light given back, the thing's extra pose let go, the face light off.
  // Called on every phase change, every restart and every morning (and harmless any other time)
  function reset(E) {
    covers.stop(); covers.dimple([]); covers.s.lift = 0;
    if (E) { E.post = null; }
    bedside.set({ clear: null });
    if (W.faceLight) W.faceLight.intensity = 0;
  }
  // true while any of it could show (the tests assert this is false by day and at breakfast)
  const showing = (E) => covers.group.visible || !!(E && E.post);

  return {
    reset, showing,
    box, marks, drawing, dent, rock, rockClicks, covers, bedside,
    tick(dt) { dent.tick(dt); tickRock(dt); covers.tick(dt); },
  };
}
