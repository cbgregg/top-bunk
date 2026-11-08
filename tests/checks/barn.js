'use strict';
// The barn as a place (js/barn.js), loaded by tests/smoke.js as a numbered check ("--only barn"), headless (no drawing, the loop frozen and
// the world stepped a frame at a time):
//   - the old block is gone: no collider spans x -69.4..-58.6 z -19.2..-4.8, none is tagged barnBlock
//   - a flood fill of the player's circle over the colliders reaches the barn's inside with the door open, never with it shut, and never
//     with only the doorway stopped up (so the east door is the one way in); nothing free inside is out of reach
//   - the sliding leaf is a collider shut, half open and open; it rolls at 1.0 m/s; it stops against a player in its way opening and
//     closing, and finishes once they step away; the door's prompt and its hand (slideBarn) work
//   - W.barn.post.add() draws a new line in wet pencil above the others (dark on the canvas), and reset() takes it away
//   - W.doors.gate.setState('shut' | 'open') swings the leaf and its strip comes on and off; shut, the gap is closed
//   - W.silo.chute swings when told (the exterior package's pivot; skipped when it is not there)
//   - the rain stays out: W.rainDiscard holds a box over the whole shell, and so does weather's own list where it keeps one
//   - headroom: the door's head, the loft's underside and its edge are in headClear; the thing fits at barnDoor and barnMid
//   - nothing clips: at every cell the player can reach in and round the barn (and round the gate, open and shut) the standing eye is
//     0.13 m or more from the nearest opaque triangle; the player walked in through the door and up the nave is never in anything and
//     the near plane never enters anything; every barn model stands on the floor (0.02 +- 0.05)
module.exports = {
  name: 'barn',
  timeout: 900e3,
  async run(browser, H) {
    const { alone, openGame, ok, clean, sleep, prompt } = H;
    return alone(browser, async (c) => {
      const { page, w } = await openGame(c, '/index.html#shot');
      await page.waitForLoadState('networkidle', { timeout: 120e3 }).catch(() => {});
      await page.waitForFunction(() => { let n = 0; window.__game.scene.traverse((o) => { if (o.userData && o.userData.prop && !o.children.length) n++; }); return n === 0; }, null, { timeout: 180e3, polling: 500 }).catch(() => {});
      await page.waitForFunction(() => { const b = window.__game.W.barn; return b && b.shell && b.shell.children[0] && b.shell.children[0].getObjectByProperty('isMesh', true) && b.shell.children[0].getObjectByProperty('isMesh', true).userData.floorStripped; }, null, { timeout: 60e3, polling: 250 }).catch(() => {});
      await page.evaluate(() => { const g = window.__game; g.start(); window.__freeze = true; g.setPhase('day', true); g.P.mode = 'walk'; g.F.cutscene = false; g.E.visible = false; g.mom.group.visible = g.dad.group.visible = false; });

      const r = await page.evaluate(async () => {
        const THREE = await import('three'), barnM = await import('/js/barn.js');
        const g = window.__game, W = g.W, C = g.collide, P = g.P, PB = g.PB, B = W.barn, out = { fails: [], notes: {} };
        const fail = (m) => out.fails.push(m), note = (k, v) => { out.notes[k] = v; };
        if (!B) { fail('W.barn is missing (js/barn.js did not install)'); return out; }
        const d = W.doors.barn, gate = W.doors.gate, DT = 1 / 60;
        const setA = (door, a) => { door.target = a > 0 ? 1 : 0; door.a = a; door.apply(); door.blocked = null; };
        const tick = (n) => { for (let i = 0; i < n; i++) W.tick(DT); };
        const stand = (x, z, tx, tz) => { P.pos.set(x, W.groundAt(x, z, 0), z); P.vel.set(0, 0, 0); P.mode = 'walk'; P.pitch = 0; if (tx !== undefined) P.yaw = Math.atan2(-(tx - x), -(tz - z)); };
        const park = () => stand(7.63, -0.42, 10, -0.42);
        const clearKeys = () => { for (const k in g.keys) g.keys[k] = false; };
        const frame = () => { g.input.poll(); if (P.mode === 'walk') g.movePlayer(DT); W.tick(DT); g.E.update(DT); g.updateCamera(DT); };

        // ---- the block is gone
        const spans = W.colliders.filter((q) => q.on !== false && (q.id === 'barnBlock' || (q.minX <= -69.39 && q.maxX >= -58.61 && q.minZ <= -19.19 && q.maxZ >= -4.81)));
        if (spans.length) fail(`the old block is still there: ${spans.map((q) => C.describe(q)).join('; ')}`);

        // ---- the flood fill (0.1 m cells over the barn and the field round it)
        const G = 0.1, X0 = -74, X1 = -51, Z0 = -25, Z1 = -2, NX = Math.round((X1 - X0) / G), NZ = Math.round((Z1 - Z0) / G), R = 0.28;
        const cx = (i) => X0 + (i + 0.5) * G, cz = (j) => Z0 + (j + 0.5) * G;
        const free = (i, j) => C.probe(cx(i), cz(j), R, W.groundAt(cx(i), cz(j), 0), 1.6, PB).pen <= 0;
        function fill(sx, sz) {
          const seen = new Uint8Array(NX * NZ), st = [[Math.floor((sx - X0) / G), Math.floor((sz - Z0) / G)]], cells = [];
          seen[st[0][0] * NZ + st[0][1]] = 1;
          while (st.length) {
            const [i, j] = st.pop(); cells.push([i, j]);
            for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const a = i + di, b = j + dj; if (a < 0 || b < 0 || a >= NX || b >= NZ || seen[a * NZ + b]) continue; seen[a * NZ + b] = 1; if (free(a, b)) st.push([a, b]); }
          }
          return { cells, inside: cells.filter(([i, j]) => B.inside(cx(i), cz(j))).length };
        }
        park();
        setA(d, 1); const open = fill(-52, -12);
        let freeInside = 0, pockets = 0; { const reached = new Set(open.cells.map(([i, j]) => i * NZ + j)); for (let i = 0; i < NX; i++) for (let j = 0; j < NZ; j++) if (B.inside(cx(i), cz(j)) && free(i, j)) { freeInside++; if (!reached.has(i * NZ + j)) pockets++; } }
        setA(d, 0); const shut = fill(-52, -12);
        setA(d, 1); const plug = W.plugin((ctx) => ctx.solid(-59.7, -58.6, -13.6, -10.4, { id: 'barnTestPlug', maxY: 3 })); void plug;
        const plugged = fill(-52, -12); W.removeSolid('barnTestPlug');
        note('fill', { openInside: open.inside, freeInside, pockets, shutInside: shut.inside, pluggedInside: plugged.inside });
        if (open.inside < 0.9 * freeInside || open.inside < 3000) fail(`door open: only ${open.inside} of ${freeInside} free cells inside are reached`);
        if (pockets > 30) fail(`door open: ${pockets} free cells inside cannot be reached (a pocket)`);
        if (shut.inside) fail(`door shut: ${shut.inside} cells inside reached`);
        if (plugged.inside) fail(`with only the doorway stopped up, ${plugged.inside} cells inside are still reached: there is another way in`);

        // ---- the leaf: a collider in every state, its pace, and against the player
        park();
        for (const a of [0, 0.5, 1]) {
          setA(d, a); const s = C.leafOf(d), mx = (s.ax + s.bx) / 2, mz = (s.az + s.bz) / 2, pr = C.probe(mx, mz, 0.1, 0, 1.6, PB);
          if (!(pr.pen > 0 && pr.hit && pr.hit.door === d)) fail(`leaf at ${a}: no collider at its middle (${C.describe(pr.hit)})`);
          if (a === 0 && !d.col.on) fail('shut, the doorway strip is off'); if (a === 1 && d.col.on) fail('open, the doorway strip is on');
        }
        setA(d, 0); W.setDoor('barn', true); tick(60);
        const metres = d.a * 3.02; note('rolledIn1s', +metres.toFixed(3));
        if (Math.abs(metres - 1.0) > 0.05) fail(`the leaf rolled ${metres.toFixed(2)} m in 1 s (1.0 m/s wanted)`);
        let t = 1; while (d.a < 1 && t < 6) { tick(1); t += DT; } note('openIn', +t.toFixed(2));
        if (d.a !== 1 || Math.abs(t - 3.02) > 0.1) fail(`the leaf took ${t.toFixed(2)} s to open (3.02 wanted), a ${d.a}`);
        // opening onto a player standing against the wall south of the door
        setA(d, 0); stand(-58.668, -9.0); W.setDoor('barn', true); let worst = 0;
        for (let i = 0; i < 300; i++) { tick(1); worst = Math.max(worst, C.penetration(PB).pen); }
        note('openingOntoPlayer', { a: +d.a.toFixed(3), blocked: !!d.blocked, pen: +worst.toFixed(4) });
        if (!(d.a < 0.95 && d.a > 0.2)) fail(`opening onto a player: the leaf reached ${d.a.toFixed(2)} (it should stop against them)`);
        if (worst > 0.01) fail(`opening onto a player: the leaf stood ${worst.toFixed(3)} m into them`);
        park(); tick(240); if (d.a !== 1) fail(`the leaf did not finish once the player stepped away (a ${d.a.toFixed(2)})`);
        // closing onto a player standing in the doorway
        stand(-59.2, -12.0); W.setDoor('barn', false); worst = 0;
        for (let i = 0; i < 300; i++) { tick(1); worst = Math.max(worst, C.penetration(PB).pen); }
        note('closingOntoPlayer', { a: +d.a.toFixed(3), blocked: !!d.blocked, pen: +worst.toFixed(4), strip: d.col.on });
        if (!(d.a > 0.05 && d.a < 0.95)) fail(`closing onto a player in the doorway: the leaf reached ${d.a.toFixed(2)}`);
        if (worst > 0.01) fail(`closing onto a player: the leaf stood ${worst.toFixed(3)} m into them`);
        if (d.col.on) fail('the doorway strip came on round the player');
        park(); tick(240); if (d.a !== 0 || !d.col.on) fail(`the leaf did not finish shutting once the player left (a ${d.a.toFixed(2)}, strip ${d.col.on})`);
        // by hand: the prompt at the door, and its act
        stand(-58.45, -12.0, -60, -12.0); g.updateCamera(0);
        barnM.slideBarn(); tick(200); if (d.a !== 1) fail(`slideBarn did not open the door (a ${d.a.toFixed(2)})`);
        barnM.slideBarn(); tick(200); if (d.a !== 0) fail(`slideBarn did not shut the door (a ${d.a.toFixed(2)})`);
        if (typeof d.setState !== 'function') fail('W.doors.barn.setState is missing');

        // ---- the measuring post
        const post = B.post, n0 = post.lines.length, top0 = Math.max(...post.lines.map((L) => L.h));
        const L = post.add(undefined, { sound: false }), img = post.mesh.material.map.image, cg = img.getContext('2d');
        const row = Math.round(img.height - L.h * 560), px = cg.getImageData(0, Math.max(0, row - 2), img.width, 5).data;
        let dark = 0; for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 200 && px[i] < 60) dark++;
        note('post', { lines: n0, added: +L.h.toFixed(3), wet: L.wet, darkPixels: dark });
        if (post.lines.length !== n0 + 1 || !L.wet || !(L.h > top0)) fail(`post.add: ${post.lines.length - n0} lines added, wet ${L.wet}, at ${L.h} over ${top0}`);
        if (dark < 30) fail(`post.add: the new line is not drawn dark on the canvas (${dark} dark pixels at its row)`);
        post.reset(); if (post.lines.length !== n0) fail('post.reset did not take the new line away');

        // ---- the gate
        if (!gate || typeof gate.setState !== 'function') fail('W.doors.gate.setState is missing');
        else {
          park();
          gate.setState('shut'); tick(120);
          const shutPen = C.probe(-27.0, -16.0, 0.28, W.groundAt(-27, -16, 0), 1.6, PB).pen;
          note('gateShut', { a: gate.a, strip: gate.col.on, pen: +shutPen.toFixed(3) });
          if (gate.a !== 0 || !gate.col.on || !(shutPen > 0)) fail(`gate shut: a ${gate.a}, strip ${gate.col.on}, gap free ${!(shutPen > 0)}`);
          gate.setState('open'); tick(120);
          const openPen = C.probe(-27.1, -16.0, 0.28, W.groundAt(-27.1, -16, 0), 1.6, PB).pen;
          note('gateOpen', { a: gate.a, strip: gate.col.on, pen: +openPen.toFixed(3) });
          if (gate.a !== 1 || gate.col.on || openPen > 0) fail(`gate open: a ${gate.a}, strip ${gate.col.on}, the gap blocked by ${openPen.toFixed(3)}`);
        }

        // ---- the silo's chute (the exterior package's)
        if (W.silo && W.silo.chute && typeof W.silo.swing === 'function') {
          const q0 = W.silo.chute.quaternion.clone(); W.silo.swing(0.3, 0.2); W.silo.chute.updateMatrixWorld(true);
          const ang = q0.angleTo(W.silo.chute.quaternion); W.silo.swing(0, 0);
          note('chute', +ang.toFixed(3)); if (ang < 0.05) fail(`W.silo.swing did not swing the chute (${ang.toFixed(3)} rad)`);
        } else note('chute', 'skipped: no W.silo.chute here');

        // ---- the rain
        const shellBox = new THREE.Box3().setFromObject(B.shell);
        const covers = (lo, hi) => lo[0] <= shellBox.min.x + 0.01 && hi[0] >= shellBox.max.x - 0.01 && lo[2] <= shellBox.min.z + 0.01 && hi[2] >= shellBox.max.z - 0.01 && hi[1] >= shellBox.max.y - 0.3;
        const discard = (W.rainDiscard || []).find((b) => covers([b.minX, b.minY ?? -10, b.minZ], [b.maxX, b.maxY ?? 3.4, b.maxZ]));
        if (!discard) fail(`no box in W.rainDiscard covers the barn (${shellBox.min.toArray().map((v) => v.toFixed(2))} .. ${shellBox.max.toArray().map((v) => v.toFixed(2))})`);
        if (g.weather && typeof g.weather.roofs === 'function') { const roofs = g.weather.roofs(); note('rainRoofs', roofs.length); if (!roofs.some((q) => covers(q.lo, q.hi))) fail("weather's own list of roofs does not cover the barn"); }
        else note('rainRoofs', 'weather keeps no list of its own here: W.rainDiscard checked');

        // ---- headroom and the thing's nodes
        const hc = { door: C.headClear(-59.2, -12, 0, 0.3), loft: C.headClear(-67.2, -14, 0, 0.3), edge: C.headClear(-66.0, -15, 0, 0.3) };
        note('headClear', hc);
        if (Math.abs(hc.door - 2.37) > 0.02) fail(`headClear at the door ${hc.door}`);
        if (Math.abs(hc.loft - 2.97) > 0.02) fail(`headClear under the loft ${hc.loft}`);
        if (Math.abs(hc.edge - 2.75) > 0.02) fail(`headClear at the loft's edge ${hc.edge}`);
        setA(d, 1); park();
        for (const k of ['barnDoor', 'barnMid']) { const [x, z] = B.nodes[k]; if (!C.fits('idle', x, z)) fail(`the thing does not fit at ${k} (${x}, ${z})`); }

        // ---- the eye against the triangles, at every reachable cell in and round the barn and round the gate
        const EYE = g.EYE, NEAR = C.NEAR;
        function triBins(x0, x1, z0, z1) {
          const BIN = 0.5, bins = new Map(), tris = [], a = new THREE.Vector3(), b = new THREE.Vector3(), cc = new THREE.Vector3();
          const vis = (o) => { for (let n = o; n; n = n.parent) if (!n.visible) return false; return true; };
          g.scene.updateMatrixWorld(true);
          g.scene.traverse((o) => {
            if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || !o.geometry || !o.geometry.attributes.position || !vis(o)) return;
            if (![].concat(o.material).every((m) => m && !m.transparent && m.depthWrite !== false && m.opacity !== 0)) return;
            if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
            const wb = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
            if (wb.max.x < x0 || wb.min.x > x1 || wb.max.z < z0 || wb.min.z > z1 || wb.max.y < 0.8 || wb.min.y > 2.2) return;
            const p = o.geometry.attributes.position, I = o.geometry.index, n = I ? I.count : p.count;
            let name = o.name; for (let q = o; q && !name; q = q.parent) name = q.name || (q.userData && q.userData.prop) || '';
            for (let k = 0; k < n; k += 3) {
              a.fromBufferAttribute(p, I ? I.getX(k) : k).applyMatrix4(o.matrixWorld); b.fromBufferAttribute(p, I ? I.getX(k + 1) : k + 1).applyMatrix4(o.matrixWorld); cc.fromBufferAttribute(p, I ? I.getX(k + 2) : k + 2).applyMatrix4(o.matrixWorld);
              if (Math.max(a.y, b.y, cc.y) < 0.8 || Math.min(a.y, b.y, cc.y) > 2.2) continue;
              const bx0 = Math.floor(Math.min(a.x, b.x, cc.x) / BIN), bx1 = Math.floor(Math.max(a.x, b.x, cc.x) / BIN), bz0 = Math.floor(Math.min(a.z, b.z, cc.z) / BIN), bz1 = Math.floor(Math.max(a.z, b.z, cc.z) / BIN), by0 = Math.floor(Math.min(a.y, b.y, cc.y) / BIN), by1 = Math.floor(Math.max(a.y, b.y, cc.y) / BIN);
              if ((bx1 - bx0 + 1) * (bz1 - bz0 + 1) * (by1 - by0 + 1) > 900) continue;
              const id = tris.length; tris.push([a.x, a.y, a.z, b.x, b.y, b.z, cc.x, cc.y, cc.z, name || ('mat:' + ([].concat(o.material)[0].name || [].concat(o.material)[0].type))]);
              for (let x = bx0; x <= bx1; x++) for (let z = bz0; z <= bz1; z++) for (let y = by0; y <= by1; y++) { const key = x + ',' + y + ',' + z; let l = bins.get(key); if (!l) bins.set(key, l = []); l.push(id); }
            }
          });
          const T = new THREE.Triangle(), Pq = new THREE.Vector3(), Cq = new THREE.Vector3();
          return { count: tris.length, nearest(x, y, z, rad) {
            let best = rad, bt = null; const ix = Math.floor(x / BIN), iy = Math.floor(y / BIN), iz = Math.floor(z / BIN), seen = new Set();
            for (let i = ix - 1; i <= ix + 1; i++) for (let j = iy - 1; j <= iy + 1; j++) for (let k = iz - 1; k <= iz + 1; k++) {
              const l = bins.get(i + ',' + j + ',' + k); if (!l) continue;
              for (const id of l) { if (seen.has(id)) continue; seen.add(id); const q = tris[id]; T.a.set(q[0], q[1], q[2]); T.b.set(q[3], q[4], q[5]); T.c.set(q[6], q[7], q[8]); T.closestPointToPoint(Pq.set(x, y, z), Cq); const dd = Cq.distanceTo(Pq); if (dd < best) { best = dd; bt = id; } }
            }
            return bt === null ? null : { d: best, name: tris[bt][9], at: [(tris[bt][0] + tris[bt][3] + tris[bt][6]) / 3, (tris[bt][1] + tris[bt][4] + tris[bt][7]) / 3, (tris[bt][2] + tris[bt][5] + tris[bt][8]) / 3] };
          } };
        }
        const eyeSweep = (label, cells, tris) => {
          const worst = new Map(); let n = 0;
          for (const [i, j] of cells) {
            const x = cx(i), z = cz(j); if (x < -70 || x > -56 || z < -22 || z > -5) continue; n++;
            const y = W.groundAt(x, z, 0);
            for (const dy of [-0.035, 0, 0.035]) { const h = tris.nearest(x, y + EYE + dy, z, NEAR); if (!h) continue; const key = h.name + '@' + h.at.map((v) => Math.round(v)).join(','); const c0 = worst.get(key); if (!c0 || h.d < c0.d) worst.set(key, { d: h.d, at: [x, y + EYE + dy, z], near: h.at }); }
          }
          for (const [k, v] of worst) fail(`${label}: the eye ${v.d.toFixed(3)} m from ${k} standing at (${v.at.map((q) => q.toFixed(2)).join(', ')})`);
          return n;
        };
        setA(d, 1); park(); const barnTris = triBins(-71, -55, -23, -3); const openCells = fill(-52, -12).cells;
        note('eyeOpen', { cells: eyeSweep('door open', openCells, barnTris), triangles: barnTris.count });
        setA(d, 0); park(); const shutCells = fill(-52, -12).cells;
        note('eyeShut', { cells: eyeSweep('door shut', shutCells, triBins(-71, -55, -23, -3)) });
        setA(d, 0);
        // round the gate, shut and open (its own little fill on both sides of the fence)
        if (gate) {
          for (const st of ['shut', 'open']) {
            gate.setState(st, { now: true }); park();
            const GT = triBins(-31, -23, -21, -11), cells = [];
            for (let x = -30.95; x < -23; x += 0.1) for (let z = -20.95; z < -11; z += 0.1) if (C.probe(x, z, R, W.groundAt(x, z, 0), 1.6, PB).pen <= 0) cells.push([x, z]);
            let worstG = null;
            for (const [x, z] of cells) { const y = W.groundAt(x, z, 0); const h = GT.nearest(x, y + EYE, z, NEAR); if (h && (!worstG || h.d < worstG.d)) worstG = { ...h, x, z }; }
            note('eyeGate_' + st, { cells: cells.length, worst: worstG ? `${worstG.name} ${worstG.d.toFixed(3)} at (${worstG.x.toFixed(2)}, ${worstG.z.toFixed(2)})` : 'clear' });
            if (worstG) fail(`gate ${st}: the eye ${worstG.d.toFixed(3)} m from ${worstG.name} standing at (${worstG.x.toFixed(2)}, ${worstG.z.toFixed(2)})`);
          }
          gate.setState('open', { now: true });
        }

        // ---- walked in: through the door, up the nave to barnMid, round to the crib and back out; nothing in anything on the way
        setA(d, 1); stand(-53, -12, -60, -12); g.updateCamera(0);
        let frames = 0, bodyWorst = 0, eyeWorst = 0, stuck = null;
        for (const [x, z] of [[-58.0, -12.0], [-64.0, -12.0], [-63.0, -10.2], [-60.5, -11.6], [-56.0, -12.0]]) {
          let best = Infinity, still = 0;
          for (let f = 0; f < 900; f++) {
            const dx = x - P.pos.x, dz = z - P.pos.z, dist = Math.hypot(dx, dz); if (dist < 0.15) break;
            P.yaw = Math.atan2(-dx, -dz); g.keys.KeyW = true; frame(); frames++;
            bodyWorst = Math.max(bodyWorst, C.penetration(PB).pen); eyeWorst = Math.max(eyeWorst, C.eyeProbe(g.camera, { mode: 'walk' }).pen);
            if (dist < best - 0.003) { best = dist; still = 0; } else if (++still > 90) { stuck = `stuck ${dist.toFixed(2)} m short of (${x}, ${z}) at (${P.pos.x.toFixed(2)}, ${P.pos.z.toFixed(2)})`; break; }
          }
          if (stuck) break;
        }
        clearKeys(); frame();
        note('walk', { frames, bodyWorst: +bodyWorst.toFixed(4), eyeWorst: +eyeWorst.toFixed(4), stuck });
        if (stuck) fail(`the walk in: ${stuck}`);
        if (bodyWorst > 0.01) fail(`the walk in: the body ${bodyWorst.toFixed(3)} m into something`);
        if (eyeWorst > 0.002) fail(`the walk in: the near plane ${eyeWorst.toFixed(3)} m into something`);
        // and against the shut leaf from outside: the player stops at it
        setA(d, 0); stand(-56.5, -12, -62, -12); g.updateCamera(0); bodyWorst = 0;
        for (let f = 0; f < 240; f++) { P.yaw = Math.PI / 2; g.keys.KeyW = true; frame(); bodyWorst = Math.max(bodyWorst, C.penetration(PB).pen, C.eyeProbe(g.camera, { mode: 'walk' }).pen); }
        clearKeys(); frame();
        note('againstLeaf', { x: +P.pos.x.toFixed(3), pen: +bodyWorst.toFixed(4) });
        if (P.pos.x < -58.935 + 0.28 - 0.01 || bodyWorst > 0.01) fail(`walking into the shut leaf: the player reached x ${P.pos.x.toFixed(3)} (pen ${bodyWorst.toFixed(3)})`);

        // ---- every barn model on the floor
        const models = []; g.scene.traverse((o) => { if (o.userData && o.userData.prop && o.children.length && o.userData.prop !== 'barn') { const bb = new THREE.Box3().setFromObject(o), ctr = bb.getCenter(new THREE.Vector3()); if (B.inside(ctr.x, ctr.z)) models.push({ name: o.userData.prop, bottom: +bb.min.y.toFixed(3) }); } });
        note('models', models);
        for (const m of models) if (Math.abs(m.bottom - B.FLOOR) > 0.05) fail(`${m.name} stands at ${m.bottom}, not on the floor (${B.FLOOR})`);
        if (!models.some((m) => m.name === 'covered_car')) fail('the covered car is not in the barn');

        setA(d, 0); park();
        return out;
      });
      // the door's prompt, with the frame running for a moment (the loop draws nothing here)
      await page.evaluate(() => { const g = window.__game; g.P.pos.set(-58.45, 0, -12.0); g.P.yaw = Math.PI / 2; g.P.pitch = 0; g.P.mode = 'walk'; window.__freeze = false; });
      await sleep(1500);
      const label = await prompt(page);
      await page.evaluate(() => { window.__freeze = true; const g = window.__game; g.P.pos.set(7.63, 0, -0.42); });
      r.notes.prompt = label;
      if (!/Slide the door open/.test(label)) r.fails.push(`standing at the shut door the prompt says "${label}"`);
      if (process.env.BARN_NOTES) console.log(JSON.stringify(r.notes, null, 1));   // every measurement, for a closer look
      ok(r.fails.length === 0, `${r.fails.length} problem(s): ${r.fails.slice(0, 4).join(' | ')}${r.fails.length > 4 ? ' ...' : ''} ${JSON.stringify(r.notes)}`);
      clean(w);
      const n = r.notes;
      return `inside reached ${n.fill.openInside}/${n.fill.freeInside} cells only through the door; leaf ${n.rolledIn1s} m in 1 s, open in ${n.openIn} s, stops against the player both ways; post line at ${n.post.added} m; gate shut/open; chute ${n.chute}; rain roofs ${n.rainRoofs}; eye clear at ${n.eyeOpen.cells}+${n.eyeShut.cells} cells; walk in ${n.walk.frames} frames clean; prompt "${label}"`;
    });
  },
};
