// Contact audit: poses Mom, Dad and grandpa the way the game does (sitting at the table, the stove, the mug, carrying boxes, the camera
// handed over, asleep in bed, the evening talk, the vigil chair) and checks their skinned bodies against the furniture and what they hold.
//   node tests/contacts.js [--port N] [--tol 0.015] [--json out.json] [--shots dir] [--only seat,stove,...] [--prelude file.js]
// A few hundred skin vertices per body part are moved by the skeleton and tested against every solid mesh near the body (inside by ray
// parity, then the depth to the nearest triangle); feet are also checked against the floor. Hits deeper than --tol are reported with
// the body part and the object; exit 1 when there are any. --shots renders each checked frame from the front and the side.
// --prelude runs a file of page code before the scenes (to try a change without editing the game).
const http = require('http'), fs = require('fs'), path = require('path');
const { Readable } = require('stream');
const ROOT = path.resolve(__dirname, '..');
const serve = require(path.join(ROOT, 'desktop', 'static'));
const ARGV = process.argv.slice(2);
const opt = (k, d) => { const i = ARGV.indexOf(k); return i >= 0 && ARGV[i + 1] ? ARGV[i + 1] : d; };
const PORT = +opt('--port', 9392), TOL = +opt('--tol', 0.015), JSON_OUT = opt('--json', ''), SHOTS = opt('--shots', ''), ONLY = opt('--only', ''), PRELUDE = opt('--prelude', '');

// ---------- the audit, in the page ----------
function auditLib(TOL) {
  const g = window.__game;
  return import('three').then((THREE) => {
    const V3 = THREE.Vector3;
    const PART = [[/Finger|Hand/, 'hand'], [/Forearm/, 'forearm'], [/UpperArm/, 'upper arm'], [/Clavicle/, 'shoulder'], [/Toe|Foot/, 'foot'], [/Calf/, 'shin'], [/Thigh/, 'thigh'],
      [/Pelvis/, 'hips'], [/Spine/, 'torso'], [/Neck|Head|Jaw|Eye|brow|Lip|lip|Cheek|Mouth|Ear|Nose/i, 'head']];
    const partOf = (name) => { const side = / L |L_|^L/.test(name) ? 'L ' : / R |R_|^R/.test(name) ? 'R ' : ''; for (const [re, n] of PART) if (re.test(name)) return (n === 'torso' || n === 'hips' || n === 'head' ? '' : side) + n; return 'body'; };
    const visibleChain = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
    const nameOf = (o) => {
      for (let n = o, i = 0; n && i < 7; n = n.parent, i++) { const t = n.name || (n.userData && (n.userData.tag || n.userData.kind)); if (t && !/^(Scene|Group|Object3D)$/.test(t)) return t; }
      const b = new THREE.Box3().setFromObject(o), c = b.getCenter(new V3()), z = b.getSize(new V3());   // unnamed: what it is, its size and where
      return `${o.geometry.type.replace('Geometry', '').toLowerCase()} ${z.x.toFixed(2)}x${z.y.toFixed(2)}x${z.z.toFixed(2)} at ${c.x.toFixed(1)},${c.y.toFixed(1)},${c.z.toFixed(1)}`;
    };
    // the body: skin vertices sampled per part (cached per mesh)
    const samples = new Map();
    function body(root, per = 260) {
      const out = [];
      root.updateMatrixWorld(true);
      root.traverse((o) => {
        if (!o.isSkinnedMesh || !visibleChain(o)) return;
        o.skeleton.update();
        let s = samples.get(o);
        if (!s) {
          const si = o.geometry.attributes.skinIndex, sw = o.geometry.attributes.skinWeight, by = new Map();
          for (let i = 0; i < si.count; i++) {
            let best = 0, bw = -1; for (let j = 0; j < 4; j++) { const w = sw.getComponent(i, j); if (w > bw) { bw = w; best = si.getComponent(i, j); } }
            const part = partOf(o.skeleton.bones[best].name); if (!by.has(part)) by.set(part, []); by.get(part).push(i);
          }
          s = []; for (const [part, idx] of by) { const step = Math.max(1, Math.floor(idx.length / per)); for (let k = 0; k < idx.length; k += step) s.push([idx[k], part]); }
          samples.set(o, s);
        }
        for (const [i, part] of s) { const v = o.getVertexPosition(i, new V3()).applyMatrix4(o.matrixWorld); out.push({ p: v, part }); }
      });
      return out;
    }
    // a solid: its triangles in its own frame, kept once
    const tris = new Map();
    function triOf(m) {
      let t = tris.get(m.geometry); if (t) return t;
      const pos = m.geometry.attributes.position, idx = m.geometry.index, n = idx ? idx.count : pos.count, a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { const k = idx ? idx.getX(i) : i; a[i * 3] = pos.getX(k); a[i * 3 + 1] = pos.getY(k); a[i * 3 + 2] = pos.getZ(k); }
      tris.set(m.geometry, a); return a;
    }
    // ray parity along the three axes, each through a grid of the triangles binned across that axis (so a ray only meets its own cell's)
    const grids = new Map(), GN = 24;
    function gridOf(m, ax) {
      let gm = grids.get(m.geometry); if (!gm) grids.set(m.geometry, gm = []);
      if (gm[ax]) return gm[ax];
      const a = triOf(m), bb = m.geometry.boundingBox, u = (ax + 1) % 3, v = (ax + 2) % 3, mn = bb.min.toArray(), mx = bb.max.toArray();
      const su = GN / Math.max(1e-6, mx[u] - mn[u]), sv = GN / Math.max(1e-6, mx[v] - mn[v]), cells = Array.from({ length: GN * GN }, () => []);
      const cl = (x) => Math.max(0, Math.min(GN - 1, Math.floor(x)));
      for (let i = 0; i < a.length; i += 9) {
        const us = [a[i + u], a[i + 3 + u], a[i + 6 + u]], vs = [a[i + v], a[i + 3 + v], a[i + 6 + v]];
        const u0 = cl((Math.min(...us) - mn[u]) * su), u1 = cl((Math.max(...us) - mn[u]) * su), v0 = cl((Math.min(...vs) - mn[v]) * sv), v1 = cl((Math.max(...vs) - mn[v]) * sv);
        for (let x = u0; x <= u1; x++) for (let y = v0; y <= v1; y++) cells[x * GN + y].push(i);
      }
      return (gm[ax] = { a, u, v, mn, su, sv, cells, cl });
    }
    function crossings(m, p, ax) {
      const G = gridOf(m, ax), a = G.a, pu = p.getComponent(G.u) + 1.3e-6, pv = p.getComponent(G.v) + 0.7e-6, pa = p.getComponent(ax);
      const list = G.cells[G.cl((pu - G.mn[G.u]) * G.su) * GN + G.cl((pv - G.mn[G.v]) * G.sv)]; let c = 0;
      for (const i of list) {
        const x0 = a[i + G.u], y0 = a[i + G.v], x1 = a[i + 3 + G.u], y1 = a[i + 3 + G.v], x2 = a[i + 6 + G.u], y2 = a[i + 6 + G.v];
        const d = (y1 - y2) * (x0 - x2) + (x2 - x1) * (y0 - y2); if (Math.abs(d) < 1e-14) continue;
        const l0 = ((y1 - y2) * (pu - x2) + (x2 - x1) * (pv - y2)) / d, l1 = ((y2 - y0) * (pu - x2) + (x0 - x2) * (pv - y2)) / d, l2 = 1 - l0 - l1;
        if (l0 < 0 || l1 < 0 || l2 < 0) continue;
        if (l0 * a[i + ax] + l1 * a[i + 3 + ax] + l2 * a[i + 6 + ax] > pa) c++;
      }
      return c;
    }
    const A = new V3(), B = new V3(), C = new V3(), CP = new V3();
    // closed enough: most edges are shared by two triangles (welded by position, so split normals and seams do not count as holes)
    const shut = new Map(), openSeen = new Set();
    function closed(m) {
      if (shut.has(m.geometry)) return shut.get(m.geometry);
      const a = triOf(m), key = (i) => `${Math.round(a[i] * 1e4)},${Math.round(a[i + 1] * 1e4)},${Math.round(a[i + 2] * 1e4)}`, edges = new Map();
      for (let i = 0; i < a.length; i += 9) { const k = [key(i), key(i + 3), key(i + 6)]; for (let j = 0; j < 3; j++) { const e = [k[j], k[(j + 1) % 3]].sort().join('|'); edges.set(e, (edges.get(e) || 0) + 1); } }
      let open = 0; for (const n of edges.values()) if (n === 1) open++;
      const ok = open <= edges.size * 0.25; shut.set(m.geometry, ok); return ok;   // models come in loose pieces with a few open seams; a ray-parity majority copes with those
    }
    const tri = new THREE.Triangle();
    function nearest(a, p) {
      let best = Infinity;
      for (let i = 0; i < a.length; i += 9) { A.set(a[i], a[i + 1], a[i + 2]); B.set(a[i + 3], a[i + 4], a[i + 5]); C.set(a[i + 6], a[i + 7], a[i + 8]); tri.set(A, B, C).closestPointToPoint(p, CP); const d = CP.distanceToSquared(p); if (d < best) best = d; }
      return Math.sqrt(best);
    }
    // a limb's bone line through a surface: thin things (a seat, a table top) are crossed without any skin point ending up deep inside them
    const SEGS = [['Thigh', 'Calf', 'thigh'], ['Calf', 'Foot', 'shin'], ['Foot', 'Toe0', 'foot'], ['UpperArm', 'Forearm', 'upper arm'], ['Forearm', 'Hand', 'forearm'], ['Hand', 'Finger2', 'hand']];
    function bonesOf(root) {
      const by = {}; root.traverse((o) => { if (o.isBone) { const m = o.name.match(/(?:^|\s|_)([LR])[\s_](Thigh|Calf|Foot|Toe0|UpperArm|Forearm|Hand|Finger2)$/); if (m) by[m[1] + m[2]] = o; } });
      const out = []; for (const S of ['L', 'R']) for (const [a, b, n] of SEGS) if (by[S + a] && by[S + b]) out.push([by[S + a], by[S + b], S + ' ' + n]);
      return out;
    }
    const S0 = new V3(), S1 = new V3(), SD = new V3(), e1 = new V3(), e2 = new V3(), pv = new V3(), tv = new V3(), qv = new V3();
    function segHits(a, p0, p1) {
      SD.subVectors(p1, p0); const len = SD.length(); SD.divideScalar(len);
      const lo = [Math.min(p0.x, p1.x), Math.min(p0.y, p1.y), Math.min(p0.z, p1.z)], hi = [Math.max(p0.x, p1.x), Math.max(p0.y, p1.y), Math.max(p0.z, p1.z)];
      for (let i = 0; i < a.length; i += 9) {
        if (Math.max(a[i], a[i + 3], a[i + 6]) < lo[0] || Math.min(a[i], a[i + 3], a[i + 6]) > hi[0] || Math.max(a[i + 1], a[i + 4], a[i + 7]) < lo[1] || Math.min(a[i + 1], a[i + 4], a[i + 7]) > hi[1] || Math.max(a[i + 2], a[i + 5], a[i + 8]) < lo[2] || Math.min(a[i + 2], a[i + 5], a[i + 8]) > hi[2]) continue;
        A.set(a[i], a[i + 1], a[i + 2]); e1.set(a[i + 3], a[i + 4], a[i + 5]).sub(A); e2.set(a[i + 6], a[i + 7], a[i + 8]).sub(A);
        pv.crossVectors(SD, e2); const det = e1.dot(pv); if (Math.abs(det) < 1e-12) continue;
        const inv = 1 / det; tv.subVectors(p0, A); const u = tv.dot(pv) * inv; if (u < 0 || u > 1) continue;
        qv.crossVectors(tv, e1); const v = SD.dot(qv) * inv; if (v < 0 || u + v > 1) continue;
        const t = e2.dot(qv) * inv; if (t > 0 && t < len) return true;
      }
      return false;
    }
    // every solid mesh (not a flat card) whose box reaches the body's box
    function solidsNear(pts, skip) {
      const bb = new THREE.Box3(); for (const s of pts) bb.expandByPoint(s.p); bb.expandByScalar(0.03);
      const out = [];
      g.scene.updateMatrixWorld(true);
      g.scene.traverse((o) => {
        if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes.position || !visibleChain(o)) return;
        for (const r of skip) { let n = o; while (n && n !== r) n = n.parent; if (n === r && !o.userData.held) return; }
        if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
        const lb = o.geometry.boundingBox, size = lb.getSize(new V3());
        if (Math.min(size.x, size.y, size.z) < 0.004) return;   // a card or a decal has no inside
        const wb = lb.clone().applyMatrix4(o.matrixWorld); if (!wb.intersectsBox(bb)) return;
        if (wb.min.y < -0.05 && wb.max.y < 0.02) return;   // the ground itself (the floor check below covers it)
        out.push(o);
      });
      return out;
    }
    // the audit of one frame: { hits: [{ part, obj, depth }] }
    function check(root, { floor = 0, floorCheck = true, skip = [] } = {}) {
      const pts = body(root), hits = new Map(), seen = new Map();
      const add = (part, obj, d) => { const k = part + ' | ' + obj, h = hits.get(k); if (!h) hits.set(k, { part, obj, depth: d, n: 1 }); else { h.n++; if (d > h.depth) h.depth = d; } };
      if (floorCheck) for (const s of pts) if (s.p.y < floor - TOL) add(s.part, 'floor', floor - s.p.y);
      for (const m of solidsNear(pts, [root, ...skip])) {
        // a sheet (the quilt) or a room's shell has no inside to be in: those get only the bone lines below
        const big = m.geometry.boundingBox.getSize(new V3()).multiplyScalar(m.matrixWorld.getMaxScaleOnAxis());
        if (/Plane/.test(m.geometry.type) || Math.max(big.x, big.y, big.z) > 3 || !closed(m)) { openSeen.add(nameOf(m)); continue; }
        const inv = m.matrixWorld.clone().invert(), lb = m.geometry.boundingBox, a = triOf(m), sc = m.matrixWorld.getMaxScaleOnAxis(), L = new V3(), nm = (m.userData.held ? 'held ' : '') + nameOf(m);
        for (const s of pts) {
          L.copy(s.p).applyMatrix4(inv); if (!lb.containsPoint(L)) continue;
          let odd = 0; for (let ax = 0; ax < 3; ax++) if (crossings(m, L, ax) % 2) odd++;
          if (odd < 2) continue;
          const k = s.part + '|' + nm; seen.set(k, (seen.get(k) || 0) + 1); if (seen.get(k) > 40) continue;   // forty points are enough to know how deep a part goes
          const depth = nearest(a, L) * sc; if (depth > TOL + (m.userData.soft || 0)) add(s.part, nm, depth);   // soft things (a pillow) give that much
        }
      }
      // the bone lines: a limb whose bone passes through something is in it however thin the thing is (reported as 'through')
      const segs = bonesOf(root);
      for (const m of solidsNear(pts, [root, ...skip])) {
        const inv = m.matrixWorld.clone().invert(), a = triOf(m), nm = (m.userData.held ? 'held ' : '') + nameOf(m);
        if (m.userData.soft) continue;   // an arm under a pillow is how people sleep
        for (const [b0, b1, part] of segs) { b0.getWorldPosition(S0).applyMatrix4(inv); b1.getWorldPosition(S1).applyMatrix4(inv); if (segHits(a, S0, S1)) add(part + ' bone', nm, 1); }
      }
      return [...hits.values()].map((h) => ({ ...h, depth: /bone$/.test(h.part) ? 'through' : +(h.depth * 100).toFixed(1) })).sort((x, y) => (y.depth === 'through' ? 99 : y.depth) - (x.depth === 'through' ? 99 : x.depth));
    }
    // a person stepped by hand (the main loop is stopped)
    let T = 0;
    const step = (people, n, fn) => { for (let i = 0; i < n; i++) { T += 1 / 60; if (fn) fn(i, T); for (const p of people) p.update(T, 1 / 60); } g.scene.updateMatrixWorld(true); };
    // a checked frame, drawn from its camera when shots are wanted
    const rec = (f) => {
      if (window.__wantShots) { g.scene.updateMatrixWorld(true); g.camera.position.set(...f.cam[0]); g.camera.lookAt(...f.cam[1]); g.camera.fov = 50; g.camera.updateProjectionMatrix(); g.gfx.render(0.016); f.img = document.querySelector('#game canvas').toDataURL('image/jpeg', 0.85); }
      return f;
    };
    // several frames' hits together: each part and object once, at its deepest
    const merge = (a, b) => { const m = new Map(a.map((h) => [h.part + '|' + h.obj, h])); for (const h of b) { const o = m.get(h.part + '|' + h.obj); if (!o || (h.depth === 'through' || (o.depth !== 'through' && h.depth > o.depth))) m.set(h.part + '|' + h.obj, h); } return [...m.values()]; };
    // the largest turn of any arm bone between two frames, in degrees (a snap reads as a jump in the pose)
    const armBones = (root) => { const a = []; root.traverse((o) => { if (o.isBone && /(Clavicle|UpperArm|Forearm|Hand)$/.test(o.name)) a.push(o); }); return a; };
    const snapper = (root) => { const bones = armBones(root), last = new Map(); let worst = 0, at = '';
      return { take() { for (const b of bones) { const q = b.getWorldQuaternion(new THREE.Quaternion()), p = last.get(b); if (p) { const d = p.angleTo(q) * 180 / Math.PI; if (d > worst) { worst = d; at = b.name; } } last.set(b, q); } }, get worst() { return worst; }, get at() { return at; } }; };
    window.__contacts = { THREE, V3, check, step, body, rec, merge, openSeen, snapper };
  });
}

// ---------- the scenes ----------
// each returns a list of frames to check: { label, root(s), opts, cam: [pos, at] }
const SCENES = {
  // at the breakfast table, on each chair, sitting still, listening, then talking with the hands
  seat: async (page) => {
    const out = [];
    for (const who of ['mom', 'dad']) for (let i = 0; i < 4; i++) out.push(...await page.evaluate(async ([wn, i]) => {
      const g = window.__game, { V3, check, step, rec, merge } = window.__contacts, out = [], who = g[wn], other = who === g.mom ? g.dad : g.mom;
      if (i >= g.W.chairs.length) return out;
      g.setPhase('morning', true);
      const C = g.W.chairs.map((c) => c.holder.getWorldPosition(new V3())), mid = C.reduce((a, c) => a.add(c), new V3()).multiplyScalar(1 / C.length);
      other.group.visible = false; who.group.visible = true; who.busy = true; who.listening = false; who.talk(null);
      who.pose = null; who.sitNow = 0; step([who], 4);
      g.seatOn(who, i, mid); step([who], 90);
      const name = `${wn === 'mom' ? 'Mom' : 'Dad'} on chair ${i}`, f = C[i].clone().sub(mid).normalize();
      const cam = [[C[i].x + f.z * 1.7 + f.x * 0.5, 0.95, C[i].z - f.x * 1.7 + f.z * 0.5], [C[i].x - f.x * 0.15, 0.55, C[i].z - f.z * 0.15]];
      out.push(rec({ label: name + ', still', hits: check(who.group), cam, who: wn }));
      who.talk(Array.from({ length: 120 }, (_, k) => (Math.sin(k * 0.45) > 0.2 ? 0.85 : 0.15)), { to: 'you', question: i % 2 === 1 });
      let worst = []; step([who], 100, (k) => { if (k % 25 === 24) { worst = merge(worst, check(who.group)); } });
      out.push(rec({ label: name + ', talking', hits: worst, cam, who: wn }));
      who.talk(null); who.pose = null; who.sitNow = 0; other.group.visible = true;
      return out;
    }, [who, i]));
    return out;
  },
  // the real breakfast: both seated by the game's own seatThem() with the kitchen's life running, Mom uneasy (arms folded while she
  // listens), each talking in turn through both mirrors of the talking clips, every third frame over six seconds checked against the
  // chairs (backs, posts, seats), the table and each other; and the largest arm-bone turn between frames (a snap) over 15 degrees
  breakfast: async (page) => page.evaluate(async () => {
    const g = window.__game, { V3, check, step, rec, merge, snapper } = window.__contacts, out = [], m = g.mom, d = g.dad;
    g.setPhase('morning', true); g.F.stage = 'b1';
    g.W.chairs.forEach((c, i) => g.W.moveChair(i, c.x, c.z, c.rot));
    for (const p of [m, d]) { p.group.visible = true; p.busy = false; p.talk(null); p.listening = false; }
    g.kitchenLife(); g.seatThem();
    { // what the kitchen's loop does once they sit (its clock is stopped here): the spoon put away, the mug down on the table in front of Dad
      const [spoon, mug] = g.kitchen.things; spoon.visible = false; g.scene.attach(mug); mug.position.copy(d.group.localToWorld(new V3(-0.32, 0, 0.56))); mug.position.y = g.kitchen.tableY; mug.rotation.set(0, d.group.rotation.y, 0); }
    step([m, d], 60);
    const C = g.W.chairs.map((c) => c.holder.getWorldPosition(new V3())), mid = C.reduce((a, c) => a.add(c), new V3()).multiplyScalar(1 / C.length);
    const env = (n) => Array.from({ length: n }, (_, k) => Math.max(0, Math.min(1, 0.5 + 0.45 * Math.sin(k * 0.41) + 0.25 * Math.sin(k * 0.13))));
    const camOf = (p) => { const a = p.group.position, f = new V3().subVectors(a, mid).setY(0).normalize(); return [[a.x + f.z * 1.6 + f.x * 0.6, 1.1, a.z - f.x * 1.6 + f.z * 0.6], [a.x, 0.75, a.z]]; };
    for (const [mood, tag] of [[null, 'calm'], ['uneasy', 'uneasy']]) {
      m.mood = mood;
      for (const [talker, listener, n] of [[m, d, 'Mom'], [d, m, 'Dad'], [m, d, 'Mom'], [d, m, 'Dad']]) {
        talker.listening = false; listener.listening = true; talker.talk(env(200), { to: 'you' }); listener.talk(null);
        const sm = snapper(m.group), sd = snapper(d.group);
        let wm = [], wd = []; step([m, d], 180, (k) => { sm.take(); sd.take(); if (k % 3 === 2) { wm = merge(wm, check(m.group)); wd = merge(wd, check(d.group)); } });
        const snaps = [[sm, 'Mom'], [sd, 'Dad']].filter(([s]) => s.worst > 15).map(([s, w]) => ({ part: `${w} ${s.at}`, obj: 'snap', depth: +s.worst.toFixed(1), n: 1 }));
        out.push(rec({ label: `Breakfast (${tag}), ${n} talking: Mom`, hits: [...wm, ...snaps.filter((h) => h.part.startsWith('Mom'))], cam: camOf(m), who: 'mom' }));
        out.push(rec({ label: `Breakfast (${tag}), ${n} talking: Dad`, hits: [...wd, ...snaps.filter((h) => h.part.startsWith('Dad'))], cam: camOf(d), who: 'dad' }));
        talker.talk(null);
      }
    }
    m.mood = null; m.listening = d.listening = false; g.kitchen.run++; g.kitchen.seated = false; m.pose = d.pose = null; m.sitNow = d.sitNow = 0;
    for (const o of g.kitchen.things) if (o.parent) o.parent.remove(o); g.kitchen.things.length = 0;
    return out;
  }),
  // standing talk and listening (the evening spots), every third frame through both mirrors of the talking clip, and the folded arms
  stand: async (page) => page.evaluate(async () => {
    const g = window.__game, { V3, check, step, rec, merge, snapper } = window.__contacts, out = [], m = g.mom, d = g.dad;
    g.setPhase('day', true);
    for (const p of [m, d]) { p.group.visible = true; p.busy = true; p.pose = null; p.sitNow = 0; p.listening = false; p.talk(null); }
    const you = new V3(2.4, 0, 1.6), face = (p, at) => { p.group.position.copy(at); p.group.rotation.set(0, Math.atan2(you.x - at.x, you.z - at.z), 0); };
    face(m, g.EVE_MOM); face(d, g.DAD_HOME); step([m, d], 40);
    const cam = (at) => { const k = new V3(you.x - at.x, 0, you.z - at.z).normalize(); return [[at.x + k.x * 1.8, 1.3, at.z + k.z * 1.8], [at.x, 0.95, at.z]]; };
    const env = (n) => Array.from({ length: n }, (_, k) => Math.max(0, Math.min(1, 0.5 + 0.45 * Math.sin(k * 0.37) + 0.25 * Math.sin(k * 0.17))));
    for (const mood of [null, 'uneasy']) {
      m.mood = mood;
      for (const [talker, listener, n] of [[m, d, 'Mom'], [d, m, 'Dad'], [m, d, 'Mom'], [d, m, 'Dad']]) {
        talker.listening = false; listener.listening = true; talker.talk(env(200), { to: 'you' }); listener.talk(null);
        const sm = snapper(m.group), sd = snapper(d.group);
        let wm = [], wd = []; step([m, d], 180, (k) => { sm.take(); sd.take(); if (k % 3 === 2) { wm = merge(wm, check(m.group)); wd = merge(wd, check(d.group)); } });
        const sn = (s, w) => (s.worst > 15 ? [{ part: `${w} ${s.at}`, obj: 'snap', depth: +s.worst.toFixed(1), n: 1 }] : []);
        out.push(rec({ label: `Standing${mood ? ' (uneasy)' : ''}, ${n} talking: Mom`, hits: [...wm, ...sn(sm, 'Mom')], cam: cam(g.EVE_MOM), who: 'mom' }));
        out.push(rec({ label: `Standing${mood ? ' (uneasy)' : ''}, ${n} talking: Dad`, hits: [...wd, ...sn(sd, 'Dad')], cam: cam(g.DAD_HOME), who: 'dad' }));
        talker.talk(null);
      }
    }
    m.mood = null; m.listening = d.listening = false;
    return out;
  }),
  // Mom stirring at the stove, Dad at the counter with his mug (resting, a sip, and both hands while you talk)
  stove: async (page) => page.evaluate(async () => {
    const g = window.__game, { V3, check, step, rec, merge } = window.__contacts, out = [];
    g.setPhase('morning', true);
    const [mx, mz, mr] = g.KSPOT.mom, [dx, dz, dr] = g.KSPOT.dad, m = g.mom, d = g.dad, bm = (m.group.userData.h || 1.75) / 1.75, bd = (d.group.userData.h || 1.75) / 1.75;
    for (const p of [m, d]) { p.group.visible = true; p.busy = true; p.pose = null; p.sitNow = 0; p.talk(null); p.listening = false; }
    m.group.position.set(mx, 0, mz); m.group.rotation.set(0, mr, 0); d.group.position.set(dx, 0, dz); d.group.rotation.set(0, dr, 0);
    const spoon = g.makeThing('spoon'), mug = g.makeThing('mug'); g.scene.add(spoon, mug); spoon.traverse((o) => { o.userData.held = true; o.name = 'spoon'; }); mug.traverse((o) => { o.userData.held = true; o.name = 'mug'; });
    step([m, d], 4); m.grab(spoon, 'R', g.GRIP.spoon); d.grab(mug, 'R', g.GRIP.mug);
    const camM = [[mx - Math.sin(mr) * 0.2 + Math.cos(mr) * 1.6, 1.3, mz - Math.cos(mr) * 0.2 - Math.sin(mr) * 1.6], [mx + Math.sin(mr) * 0.3, 0.9, mz + Math.cos(mr) * 0.3]];
    let worst = []; step([m], 160, (k, t) => { m.pose = g.KPOSE.stir(t); if (k % 20 === 19) { const h = check(m.group); worst = merge(worst, h); } });
    out.push(rec({ label: 'Mom stirring at the stove', hits: worst, cam: camM, who: 'mom' }));
    const camD = [[dx + Math.sin(dr) * 1.5 + 0.4, 1.3, dz + Math.cos(dr) * 1.5], [dx, 1.0, dz]];
    for (const lift of [0, 0.5, 1]) { step([d], 70, () => { d.pose = g.KPOSE.sip(lift, bd); }); out.push(rec({ label: `Dad with the mug, lift ${lift}`, hits: check(d.group), cam: camD, who: 'dad' })); }
    step([d], 70, () => { d.pose = g.KPOSE.mugLow(bd); }); out.push(rec({ label: 'Dad with the mug in both hands', hits: check(d.group), cam: camD, who: 'dad' }));
    spoon.parent.remove(spoon); mug.parent.remove(mug); m.pose = d.pose = null;
    return out;
  }),
  // Dad carrying a box against his chest, standing and through a walk cycle (out on the drive, away from everything else)
  carry: async (page) => page.evaluate(async () => {
    const g = window.__game, { V3, check, step, rec, merge } = window.__contacts, out = [], d = g.dad, bd = (d.group.userData.h || 1.75) / 1.75;
    g.setPhase('day', true); g.mom.group.visible = false; d.group.visible = true; d.busy = true; d.pose = null; d.sitNow = 0;
    d.group.position.set(3.1, 0, -8.5); d.group.rotation.set(0, Math.PI, 0); step([d], 4);
    const box = g.W.cardboardBox(0, 0, 0, 0.46, 0.4, 0.46, 1, 0, g.scene); box.name = 'box'; box.traverse((o) => { o.userData.held = true; o.name = 'box'; });
    d.group.add(box); box.position.copy(g.carryPos(d, box)); box.rotation.set(0, 0, 0);
    const cam = [[3.1 + 0.9, 1.35, -8.5 - 0.95], [3.1, 1.05, -8.85]];
    // and the hands must be on it: a palm more than 4.5 cm off the box's surface is holding air
    const off = () => ['L', 'R'].map((s) => { const l = box.worldToLocal(d.palm(s, new V3())), h = box.geometry.parameters, o = Math.hypot(Math.max(0, Math.abs(l.x) - h.width / 2), Math.max(0, Math.abs(l.y) - h.height / 2), Math.max(0, Math.abs(l.z) - h.depth / 2)); return o > 0.045 ? { part: s + ' hand', obj: 'off the held box', depth: +(o * 100).toFixed(1), n: 1 } : null; }).filter(Boolean);
    step([d], 60, () => { d.pose = { hold: box, holdW: 0.46 }; }); out.push(rec({ label: 'Dad holding a box, standing', hits: [...check(d.group), ...off()], cam, who: 'dad' }));
    d.rig.play('walk', { fade: 0.2 });
    let worst = []; step([d], 120, (k) => { d.pose = { hold: box, holdW: 0.46 }; if (k % 8 === 7) { const h = [...check(d.group), ...off()]; worst = merge(worst, h); } });
    out.push(rec({ label: 'Dad carrying a box, walking (15 samples)', hits: worst, cam, who: 'dad' }));
    d.rig.play('idle', { fade: 0.2 }); step([d], 20); box.parent.remove(box); d.pose = null; g.mom.group.visible = true;
    return out;
  }),
  // the evening talk on moving day, both standing where the day leaves them, and Mom holding the camera out
  evening: async (page) => page.evaluate(async () => {
    const g = window.__game, { V3, check, step, rec, merge } = window.__contacts, out = [], m = g.mom, d = g.dad, bm = (m.group.userData.h || 1.75) / 1.75;
    g.setPhase('day', true);
    for (const p of [m, d]) { p.group.visible = true; p.busy = true; p.pose = null; p.sitNow = 0; p.listening = false; }
    const you = new V3(2.4, 0, 1.6), face = (p, at) => { p.group.position.copy(at); p.group.rotation.set(0, Math.atan2(you.x - at.x, you.z - at.z), 0); };
    face(m, g.EVE_MOM); face(d, g.DAD_HOME); step([m, d], 60);
    const cam = (at) => { const d = new V3(you.x - at.x, 0, you.z - at.z).normalize(); return [[at.x + d.x * 1.7, 1.35, at.z + d.z * 1.7], [at.x, 0.9, at.z]]; };
    out.push(rec({ label: 'Mom standing for the evening talk', hits: check(m.group), cam: cam(g.EVE_MOM), who: 'mom' }));
    out.push(rec({ label: 'Dad standing for the evening talk', hits: check(d.group), cam: cam(g.DAD_HOME), who: 'dad' }));
    m.talk(Array.from({ length: 120 }, (_, k) => (Math.sin(k * 0.45) > 0.2 ? 0.85 : 0.15)), { to: 'you' }); d.listening = true;
    let wm = [], wd = []; step([m, d], 100, (k) => { if (k % 20 === 19) { wm = merge(wm, check(m.group)); wd = merge(wd, check(d.group)); } });
    out.push(rec({ label: 'Mom talking, Dad listening (evening)', hits: [...wm, ...wd.map((h) => ({ ...h, part: 'Dad ' + h.part }))], cam: cam(g.EVE_MOM), who: 'mom' }));
    m.talk(null); d.listening = false;
    const cam1 = g.makeThing('camera'); g.scene.add(cam1); cam1.traverse((o) => { o.userData.held = true; o.name = 'camera'; });
    step([m], 70, () => { m.pose = g.KPOSE.gift(bm); }); m.grab(cam1, 'R', g.GRIP.camera); step([m], 20, () => { m.pose = g.KPOSE.gift(bm); });
    out.push(rec({ label: 'Mom holding the camera out', hits: check(m.group), cam: [[g.EVE_MOM.x + (you.x - g.EVE_MOM.x) * 0.6 + 0.3, 1.25, g.EVE_MOM.z + (you.z - g.EVE_MOM.z) * 0.6], [g.EVE_MOM.x, 1.0, g.EVE_MOM.z]], who: 'mom' }));
    cam1.parent.remove(cam1); m.pose = null;
    return out;
  }),
  // asleep in their bed (against the mattress, the frame and the quilt)
  bed: async (page) => page.evaluate(async () => {
    const g = window.__game, { V3, check, step, rec, merge } = window.__contacts, out = [];
    g.setPhase('morning', true); g.sleepers(true); step([g.mom, g.dad], 90);   // (morning light, so the pictures show them)
    for (const [p, n] of [[g.mom, 'Mom'], [g.dad, 'Dad']]) {
      const at = p.group.getWorldPosition(new V3());
      out.push(rec({ label: `${n} asleep in bed`, hits: check(p.group, { floorCheck: false }), cam: [[at.x + 1.2, at.y + 1.3, at.z + 0.2], [at.x, at.y, at.z]], who: n.toLowerCase() }));
      // the same, with the quilt lifted off, from the side: how they lie on the mattress and the pillows
      if (g.W.bedSleepers) { g.W.bedSleepers.group.visible = false; out.push(rec({ label: `${n} asleep, quilt off`, hits: [], cam: [[at.x + 0.2, at.y + 0.5, at.z + 1.6], [at.x, at.y, at.z]], who: n.toLowerCase() })); g.W.bedSleepers.group.visible = true; }
    }
    g.sleepers(false); g.setPhase('day', true);
    return out;
  }),
  // grandpa in the vigil chair
  vigil: async (page) => {
    await page.evaluate(() => { const g = window.__game; g.vigil.run({}, () => new Promise(() => {})); });
    await page.waitForFunction(() => { let ok = false; window.__game.scene.traverse((o) => { if (o.isSkinnedMesh && o.material && o.material.name === 'm004_head') ok = true; }); return ok; }, null, { timeout: 120e3, polling: 500 });
    return page.evaluate(async () => {
      const g = window.__game, { V3, check, rec } = window.__contacts; let root = null;
      g.scene.traverse((o) => { if (o.isSkinnedMesh && o.material && o.material.name === 'm004_head') root = o; });
      while (root.parent && !root.parent.isScene && root.parent.parent && !(root.parent.children.some((c) => c.isMesh && !c.isSkinnedMesh))) root = root.parent;
      for (let i = 0; i < 30; i++) g.vigil.update(1 / 60);
      g.scene.updateMatrixWorld(true);
      const at = root.getWorldPosition(new V3());
      g.setPhase('morning', true); for (let i = 0; i < 2; i++) g.vigil.update(1 / 60);   // (lit for the picture; the vigil itself is in the dark)
      const out = [rec({ label: 'Grandpa in the vigil chair', hits: check(root), cam: [[at.x - 1.5, 1.15, at.z + 0.6], [at.x, 0.7, at.z]], who: 'grandpa' })];   // (from in front: the chair faces the living room, west)
      g.vigil.stop();
      return out;
    });
  },
};

(async () => {
  const { chromium } = require('playwright');
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      const r = await serve.respond(ROOT, new Request(url.href, { method: req.method, headers: req.headers.range ? { range: req.headers.range } : {} }));
      res.writeHead(r.status, Object.fromEntries(r.headers));
      if (r.body) Readable.fromWeb(r.body).on('error', () => res.destroy()).pipe(res); else res.end();
    } catch (e) { if (!res.headersSent) res.writeHead(500); res.end(String(e)); }
  });
  await new Promise((r) => server.listen(PORT, '127.0.0.1', r));
  const browser = await chromium.launch({ args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 480, height: 300 } })).newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push(String(e)));
  await page.addInitScript(() => { window.__norender = true; });
  await page.goto(`http://127.0.0.1:${PORT}/index.html#shot`, { waitUntil: 'load', timeout: 300e3 });
  await page.waitForFunction(() => window.__game && document.getElementById('loading').classList.contains('done'), null, { timeout: 300e3, polling: 500 });
  await page.waitForFunction(() => { const g = window.__game; return g.mom.rig && g.dad.rig; }, null, { timeout: 300e3, polling: 500 });
  await page.evaluate(() => { const g = window.__game; g.start(); window.__freeze = true; g.gfx.setQuality('low', { save: false }); g.P.mode = 'cine'; for (const id of ['title', 'hud', 'mobile']) { const el = document.getElementById(id); if (el) el.style.display = 'none'; } });
  await page.evaluate(auditLib, TOL);
  if (PRELUDE) await page.evaluate(fs.readFileSync(PRELUDE, 'utf8'));
  if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.evaluate(() => { window.__wantShots = true; }); }
  const report = []; let bad = 0, shot = 0;
  for (const [name, run] of Object.entries(SCENES)) {
    if (ONLY && !ONLY.split(',').includes(name)) continue;
    let frames;
    try { frames = await run(page); } catch (e) { console.log(`${name}: could not run: ${String(e).split('\n')[0]}`); bad++; continue; }
    for (const f of frames) {
      report.push({ scene: name, label: f.label, hits: f.hits }); 
      const line = f.hits.length ? f.hits.slice(0, 6).map((h) => (h.depth === 'through' ? `${h.part} through ${h.obj}` : `${h.part} in ${h.obj} ${h.depth} cm (${h.n})`)).join('; ') : 'clear';
      console.log(`${f.hits.length ? 'HIT ' : 'ok  '} ${f.label.padEnd(44)} ${line}`);
      if (f.hits.length) bad++;
    }
    if (SHOTS) for (const f of frames) if (f.img) fs.writeFileSync(path.join(SHOTS, `${String(shot++).padStart(2, '0')}_${f.label.replace(/[^a-z0-9]+/gi, '_')}.jpg`), Buffer.from(f.img.split(',')[1], 'base64'));
  }
  console.log('open meshes (bone lines only):', (await page.evaluate(() => [...window.__contacts.openSeen])).join('; ') || 'none');
  if (JSON_OUT) fs.writeFileSync(JSON_OUT, JSON.stringify({ tol: TOL, report, errors: errs }, null, 1));
  console.log(`${report.length} frames, ${bad} with contacts deeper than ${TOL * 100} cm; page errors: ${errs.length ? errs.slice(0, 3).join(' | ') : 'none'}`);
  await browser.close(); server.close();
  process.exit(bad ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
