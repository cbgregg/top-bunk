// Contact scenes for the baked body-language clips (assets/models/body.bin, the JOBS of tools/models/body.cjs): each new clip played
// on Dad and on Mom where the game will play it (the kitchen chair, a box in the arms, the wall phone, the parents' bed, the table's
// edge, the open floor), and the skinned body checked on several frames of it against the chair, the table, the box, the bed, the wall
// and the floor; in the bed, the bones are also kept clear of the other sleeper.
//   node tests/contacts.js --only clips [--shots dir]
// A clip that keeps its legs comes with its hips' path (clip.userData.hips, see js/rig.js loadBody): the group is moved by it here,
// as any player of such a clip must, so the legs fold onto the seat, the floor and the bed instead of in the air. The lying start
// of LayToIdle is laid where sleepers() (main.js) lays the standing rig by a group rotation, and a line of the report says how far
// the two poses are apart (the numbers in tools/models/README.md come from here).
module.exports = {
  clips: async (page) => page.evaluate(async () => {
    const g = window.__game, { THREE, V3, check, step, rec, merge, body } = window.__contacts, out = [], UP = new V3(0, 1, 0);
    const people = [[g.dad, 'Dad'], [g.mom, 'Mom']];
    g.setPhase('morning', true);
    const cm = (v) => +(v * 100).toFixed(1), sg = (v) => (v >= 0 ? '+' : '') + v, hs = (who) => (who.group.userData.h || 1.75) / 1.75;
    const bone = (who, n) => { const b = who.rig.bones[n]; b.updateWorldMatrix(true, false); return b.getWorldPosition(new V3()); };
    const reset = (who) => { who.busy = true; who.pose = null; who.sitNow = 0; who.listening = false; who.talk(null); who.eyeHold = null; who.sleeping = false; who.lookAt = null; who.mood = null; who.group.rotation.order = 'XYZ'; who.group.visible = true; };
    // each rig's pelvis height at rest, standing (what the hips' paths are scaled by)
    const PR = {}; for (const [p, n] of people) { reset(p); p.group.position.set(0, 0, 0); p.group.rotation.set(0, 0, 0); p.rig.play('idle', { fade: 0 }); step([p], 6); PR[n] = bone(p, 'Pelvis').y; }
    const K = (who, name) => PR[who === g.dad ? 'Dad' : 'Mom'] / who.rig.clips[name].userData.pelvis;   // the path's scale for this body
    // the clip's hip path at time t: metres, turned by the person's yaw
    const hipsAt = (who, name, t) => {
      const c = who.rig.clips[name], u = c && c.userData, H = u && u.hips; if (!H || !u.pelvis || !u.fps) return new V3();
      const k = K(who, name), f = Math.min(H.length - 1, Math.max(0, t * u.fps)), i = Math.floor(f), s = f - i, a = H[i], b = H[Math.min(H.length - 1, i + 1)];
      return new V3((a[0] + (b[0] - a[0]) * s) * k / 1000, (a[1] + (b[1] - a[1]) * s) * k / 1000, (a[2] + (b[2] - a[2]) * s) * k / 1000).applyAxisAngle(UP, who.group.rotation.y);
    };
    // a person stood at `base` facing `yaw`, settled in the idle, then the clip from its start, played once: frame(t) is called at each
    // time in `times` (seconds, the first one a frame in) with the hips applied and the scene up to date; `after` runs after every step
    const run = (who, name, base, yaw, times, frame, after = null) => {
      reset(who); who.group.position.copy(base); who.group.rotation.set(0, yaw, 0); who.rig.play('idle', { fade: 0 }); step([who], 8);
      const a = who.rig.actions[name]; if (!a) { out.push({ label: `${name}: no such clip`, hits: [{ part: 'clip', obj: 'missing', depth: 'through', n: 1 }], cam: [[0, 1, 0], [0, 0, 0]] }); return; }
      a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; who.rig.play(name, { fade: 0 });
      const one = (t) => { step([who], 1); who.group.position.copy(base).add(hipsAt(who, name, t)); if (after) after(); g.scene.updateMatrixWorld(true); };
      let t = 1 / 60; one(t);
      for (const tt of times) {
        while (t < tt - 1e-6) { t += 1 / 60; one(t); }
        frame(t);
      }
      a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false;
    };
    const span = (d, n) => Array.from({ length: n }, (_, i) => +(d * i / (n - 1)).toFixed(3));
    // a level camera off to one side, at `h` and looking at `at` raised to `h` (a camera pitched down tips every upright in the picture)
    const camAt = (at, yaw, dist = 3.0, h = 1.0, side = 0.9) => [[at.x + Math.sin(yaw) * dist * 0.6 + Math.cos(yaw) * side, h, at.z + Math.cos(yaw) * dist * 0.6 - Math.sin(yaw) * side], [at.x, h, at.z]];
    const other = (who) => (who === g.dad ? g.mom : g.dad), hideOther = (who) => { other(who).group.visible = false; };
    const dur = (who, name) => who.rig.actions[name].getClip().duration;
    // a section that throws is reported as a hit of its own and the others still run
    const part = (what, fn) => { try { fn(); } catch (e) { out.push({ label: `${what}: could not run`, hits: [{ part: 'scene', obj: String(e && e.stack || e).split('\n').slice(0, 2).join(' '), depth: 'through', n: 1 }], cam: [[0, 1, 0], [0, 0, 0]] }); } };

    const C = g.W.chairs, mid = C.reduce((a, c) => a.add(c.holder.getWorldPosition(new V3())), new V3()).multiplyScalar(1 / C.length);
    const ch = C[0], h0 = ch.holder.getWorldPosition(new V3()), cr = Math.atan2(mid.x - h0.x, mid.z - h0.z), fwd = new V3(Math.sin(cr), 0, Math.cos(cr));
    // ---- the kitchen chair: sitting down on it and getting up from it, the chair pulled back from the table as it would be ----
    part('the chair', () => {
      g.W.moveChair(0, ch.holder.position.x - fwd.x * 0.32, ch.holder.position.z - fwd.z * 0.32, ch.rot); g.scene.updateMatrixWorld(true);
      const hp = ch.holder.getWorldPosition(new V3()), seatY = g.seatHeight(ch), seatSpot = hp.clone().addScaledVector(fwd, -0.07);   // (seatOn puts the hips 7 cm behind the holder: the back half of the seat)
      // the seat's front edge: the furthest point along fwd from the holder where a ray down still meets the seat
      const ray = new THREE.Raycaster(); ray.camera = g.camera; let edge = 0;
      for (let d = 0; d <= 0.4; d += 0.01) { ray.set(hp.clone().addScaledVector(fwd, d).setY(0.8), new V3(0, -1, 0)); ray.far = 0.8; if (ray.intersectObject(ch.holder, true).find((x) => x.point.y > 0.3 && x.point.y < 0.7)) edge = d; }
      for (const [who, wn] of people) {
        hideOther(who);
        for (const name of ['Sitting_Enter', 'Sitting_Exit']) {
          // the standing spot: the hips 13 cm in front of the seat's edge, so the calves of the idle's stance (its right foot 5 cm back) stay
          // clear of it; the clip's seated end then lands where its hips' path puts it (28 cm back for the library's rig), reported against
          // seatOn's spot: whoever plays the clip pulls the chair back by that much first, or sits them that far forward
          const H = who.rig.clips[name].userData.hips, k = K(who, name), standH = name === 'Sitting_Enter' ? H[0] : H[H.length - 1], sitH = name === 'Sitting_Enter' ? H[H.length - 1] : H[0], D = dur(who, name);
          const turn = (h) => new V3(h[0] * k / 1000, 0, h[2] * k / 1000).applyAxisAngle(UP, cr);
          const base = hp.clone().addScaledVector(fwd, edge + 0.13).sub(turn(standH)); base.y = 0;
          const fwdOf = base.clone().add(turn(sitH)).sub(seatSpot).dot(fwd), cam = camAt(hp, cr, 3.2, 0.95, 1.3);
          run(who, name, base, cr, span(D, 7), (t) => {
            const seated = name === 'Sitting_Enter' ? t >= D - 1e-3 : t <= 1 / 60 + 1e-3, over = seated ? bone(who, 'Pelvis').y - (seatY + 0.09 * hs(who)) : null;   // (seated: the hip joints a buttock's thickness over the seat, as sit() wants them)
            out.push(rec({ label: `${wn} ${name} at ${t.toFixed(2)} s${seated ? ` (seated hips ${sg(cm(over))} cm vs seat+9, ${sg(cm(fwdOf))} cm forward of seatOn's spot; stood ${cm(edge + 0.13)} cm past the holder, edge at ${cm(edge)})` : ''}`, hits: check(who.group), cam, who: wn.toLowerCase() }));
          });
        }
      }
    });
    // ---- eating at the table: Consume's arms over the seated clip, the chair back at the table, the other hand resting on the thigh ----
    g.W.moveChair(0, ch.x, ch.z, ch.rot); g.scene.updateMatrixWorld(true);
    part('eating', () => { for (const [who, wn] of people) {
      hideOther(who);
      // which hand the library eats with: the one that rises
      let eats = 'R'; run(who, 'Consume', new V3(3.1, 0, -8.5), 0, [0.5], () => { eats = bone(who, 'L_Hand').y > bone(who, 'R_Hand').y + 0.05 ? 'L' : 'R'; });
      const clip = eats === 'L' ? 'Consume_m' : 'Consume';   // (mirrored when the library eats with the left: the right hand eats, the left rests)
      reset(who); who.rig.play('idle', { fade: 0 }); g.seatOn(who, 0, mid); step([who], 60);
      who.pose = { sit: 1, seat: who.seatAt, L: { reachLocal: who.lap.L.clone(), palm: 'down', grip: 0.15 } };
      const sp = who.group.position.clone(), cam = camAt(sp, who.group.rotation.y, 2.6, 0.95, 1.0), a = who.rig.actions[clip]; a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset();
      let worst = []; step([who], 100, (i) => { who.rig.overlay(clip, 0.95, { rate: 60 }); if (i >= 15 && i % 15 === 0) worst = merge(worst, check(who.group)); if (i === 45) out.push(rec({ label: `${wn} eating at the table, mid bite`, hits: check(who.group), cam, who: wn.toLowerCase() })); });
      out.push(rec({ label: `${wn} eating at the table (${clip}, 6 frames)`, hits: worst, cam, who: wn.toLowerCase() }));
      a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.stop(); if (who.rig.ov) who.rig.ov.delete(clip);
      who.pose = null; who.sitNow = 0;
    } });
    // ---- a box in the arms: the carrying walk laid over the walk, out on the drive. The library carries a crate on upturned palms, so a
    // moving box rides on the hands: its bottom on the hands' tops (the fingers held flat under it, as the game's hold pose holds them),
    // its back face at the chest, and it rolls a little with the hands as they rise and fall with the stride ----
    part('the carry', () => { for (const [who, wn] of people) {
      hideOther(who); reset(who);
      const at = new V3(3.1, 0, -8.5), yaw = Math.PI;
      who.group.position.copy(at); who.group.rotation.set(0, yaw, 0); who.rig.play('idle', { fade: 0 }); step([who], 8);
      const w = 0.56, h = 0.4, d = 0.36, box = g.W.cardboardBox(0, 0, 0, w, h, d, 1, 0, who.group); box.name = 'box'; box.traverse((o) => { o.userData.held = true; o.name = 'box'; });   // (a moving box's size; the palms spread to 27 cm each side at the widest of the stride)
      const P = { L: new V3(), R: new V3() }, loc = (v) => who.group.worldToLocal(v.clone()), handBones = { L: [], R: [] };
      const FLAT = [[0.12, 0.18, 0.1], [0.14, 0.2, 0.12], [0.16, 0.22, 0.14], [0.18, 0.24, 0.14], [0.2, 0.15, 0.1]];   // (the hold pose's flat hand, people.js CURL.flat: index to pinky, then the thumb; undone below)
      for (const n in who.rig.bones) { const m = n.match(/^([LR])_(Hand|Finger)/); if (m) handBones[m[1]].push(who.rig.bones[n]); }
      let roll = 0, gap = 0, gapOf = '', frameN = 0, back = 0.21 * hs(who), wristZ = -Infinity, chest = -Infinity;
      const place = () => {
        // the box's back face stands just in front of the wrists' furthest reach (the forearms slope down from the elbows to the wrists,
        // so a box set further back cuts them at its bottom edge), measured over half a loop once the arms have settled; the chest's
        // front at the hands' height (the body's skin samples) is measured alongside, for the record (carryPos in main.js puts a held
        // box's back face 0.21 m out for Dad)
        if (frameN >= 50 && frameN < 110) {
          for (const s of ['L', 'R']) { const b = who.rig.bones[s + '_Hand']; b.updateWorldMatrix(true, false); wristZ = Math.max(wristZ, loc(b.getWorldPosition(new V3())).z); }
          if (frameN % 10 === 0) { const py = (P.L.y + P.R.y) / 2; for (const s of body(who.group)) if (/^(torso|hips|shoulder)$/.test(s.part) && Math.abs(s.p.y - py) < 0.12) chest = Math.max(chest, loc(s.p).z); }
          if (frameN === 109) back = wristZ + 0.01;
        }
        // the hands turned palm up and held flat, as the hold pose holds them (grip), and then the fingers straightened under the box
        // (the hold's flat hand keeps a little curl, which lifts a fingertip 4 cm over the palm); the box's own x axis runs from palm to
        // palm, so it rolls with the hands as they rise and fall with the stride (by no more than 8 degrees: past that the lower hand
        // lets go), and its bottom rests on the higher hand's highest knuckle, a skin's thickness over the bone
        for (const s of ['L', 'R']) { who.grip(who.rig, s, UP, 0, 1, true); who.curl(who.rig, s, who.curlAxis(who.rig, s, who.palmSide(who.rig, s, new V3()), new V3()), FLAT.map((f) => f.map(() => 0)), FLAT, 1); who.palm(s, P[s]); }
        who.rig.root.updateMatrixWorld(true);
        const pl = loc(P.L), pr = loc(P.R), ax = pl.clone().sub(pr), r0 = Math.atan2(ax.y, ax.x), rr = Math.max(-0.14, Math.min(0.14, r0));
        const X = new V3(Math.cos(rr), Math.sin(rr), 0), Y = new V3(-Math.sin(rr), Math.cos(rr), 0), Z = new V3(0, 0, 1), mid = pl.clone().add(pr).multiplyScalar(0.5);
        // (the thumbs are left out: they lie along the box's sides, not under it)
        let top = -Infinity, topOf = ''; for (const s of ['L', 'R']) for (const b of handBones[s]) { if (/Finger0/.test(b.name)) continue; b.updateWorldMatrix(true, false); const t = loc(b.getWorldPosition(new V3())).sub(mid).dot(Y); if (t > top) { top = t; topOf = b.name; } }
        const c = mid.clone().addScaledVector(Y, top + 0.015 + h / 2); c.z = back + d / 2;
        box.position.copy(c); box.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); box.updateMatrixWorld(true);
        if (frameN < 110) return;   // (the arms are still easing from the idle into the carry, or the back face is still being measured)
        roll = Math.max(roll, Math.abs(r0));
        for (const s of ['L', 'R']) { const under = -h / 2 - box.worldToLocal(P[s].clone()).y; if (under > gap) { gap = under; gapOf = `${s} palm at frame ${frameN} (palms ${cm(Math.abs(pl.y - pr.y))} cm apart in height, the bottom set by ${topOf.replace(/^Bip01_/, '')} ${cm(top)} cm over the palms' middle)`; } }   // (how far the lower palm hangs under the bottom)
      };
      // a hand that is not under the box (its palm outside the box's footprint, or more than 6 cm under its bottom) is off it
      // (the palm's centre may sit a little behind the back face: the box's back-bottom edge then rests in the heel of the hand)
      const off = () => ['L', 'R'].map((s) => { const l = box.worldToLocal(P[s].clone()), terms = [['beside', Math.abs(l.x) - w / 2], ['before', l.z - d / 2], ['behind', -d / 2 - 0.02 - l.z], ['up inside', l.y + h / 2], ['under', -h / 2 - 0.06 - l.y]].sort((a, b) => b[1] - a[1]); return terms[0][1] > 0.02 ? { part: s + ' hand', obj: `off the held box (${terms[0][0]} it at frame ${frameN}, palm at ${l.x.toFixed(2)} ${l.y.toFixed(2)} ${l.z.toFixed(2)} in its frame)`, depth: cm(terms[0][1]), n: 1 } : null; }).filter(Boolean);
      who.rig.play('walk', { fade: 0 });
      const cam = [[at.x + 1.3, 1.05, at.z - 2.2], [at.x, 1.05, at.z]];
      // (the legs are the walk's, and the walk clip sinks a heel a little into the floor on its own: the floor is not this clip's to check)
      let worst = [];
      // (a full loop of the walk is checked, every eighth frame, once the box is placed)
      for (let i = 0; i < 230; i++) { frameN = i; step([who], 1, () => who.rig.overlay('Walk_Carry_Loop', 0.97, { rate: 60 })); place(); if (i >= 110 && i % 8 === 1) worst = merge(worst, [...check(who.group, { floorCheck: false }), ...off()]); if (i === 161) out.push(rec({ label: `${wn} Walk_Carry_Loop with a box, mid stride`, hits: check(who.group, { floorCheck: false }), cam, who: wn.toLowerCase() })); }
      out.push(rec({ label: `${wn} Walk_Carry_Loop with a ${Math.round(w * 100)} x ${Math.round(h * 100)} x ${Math.round(d * 100)} cm box on the hands (15 frames)`, hits: worst, cam, who: wn.toLowerCase() }));
      out.push({ label: `${wn} carry numbers: the box's back face ${cm(back)} cm in front of the body's origin (the wrists reach ${cm(wristZ)} cm, the chest's front at the hands' height is at ${cm(chest)} cm); the hands' line rolls up to ${(roll * 180 / Math.PI).toFixed(1)} deg; the lower palm up to ${cm(gap)} cm under the bottom: ${gapOf}`, hits: [] });
      // the overlay is let go the way the game lets one go: not asked for, it eases out (at the slower rate bodyLang sets under a walk)
      // and stops itself; deleting it from the map instead would leave the action running at its overlay weight under every clip after it
      box.parent.remove(box); who.rig.play('idle', { fade: 0 }); step([who], 45);
      if (who.rig.ov && who.rig.ov.has('Walk_Carry_Loop')) out.push({ label: `${wn}: the carry overlay did not stop`, hits: [{ part: 'overlay', obj: 'still on', depth: 'through', n: 1 }], cam });
    } });
    // ---- the wall phone: standing in front of it, the handset hand up, the little table under it clear of the shins ----
    part('the phone', () => { const ph = g.W.phone.pos, stand = new V3(ph.x - 0.62, 0, ph.z), yaw = Math.PI / 2;   // (the phone hangs on the dining room's east wall, facing west)
      for (const [who, wn] of people) {
        hideOther(who); let worst = []; const cam = [[stand.x - 0.6, 1.1, stand.z + 2.2], [stand.x + 0.2, 1.1, stand.z]];
        run(who, 'Idle_TalkingPhone_Loop', stand, yaw, span(dur(who, 'Idle_TalkingPhone_Loop'), 5), (t) => { worst = merge(worst, check(who.group)); if (Math.abs(t - 1.47) < 0.4 && !worst.mid) { worst.mid = true; out.push(rec({ label: `${wn} Idle_TalkingPhone_Loop at ${t.toFixed(2)} s`, hits: check(who.group), cam, who: wn.toLowerCase() })); } });
        out.push(rec({ label: `${wn} Idle_TalkingPhone_Loop at the wall phone (5 frames)`, hits: worst, cam, who: wn.toLowerCase() }));
      } });
    // ---- the table's edge: taking something off it ----
    part('the table', () => { const ray = new THREE.Raycaster(); ray.camera = g.camera; let R = 0.3;   // how far the top reaches from the middle, found by dropping rays outward
      for (let d = 0.3; d < 1.2; d += 0.02) { ray.set(new V3(mid.x - fwd.x * d, 1.2, mid.z - fwd.z * d), new V3(0, -1, 0)); ray.far = 0.7; const hit = ray.intersectObjects(g.scene.children, true).find((h) => h.object.isMesh && !h.object.isSkinnedMesh && h.point.y > 0.55 && h.point.y < 0.9); if (hit) R = d; else if (d > R + 0.05) break; }
      const stand = mid.clone().addScaledVector(fwd, -(R + 0.14)); stand.y = 0;
      g.W.moveChair(0, ch.x - fwd.x * 0.9, ch.z - fwd.z * 0.9, ch.rot); g.scene.updateMatrixWorld(true);   // (the chair out of the way)
      for (const [who, wn] of people) {
        hideOther(who); let worst = []; const cam = camAt(stand, cr, 3.2, 1.0, 1.3), D = dur(who, 'PickUp_Table');
        run(who, 'PickUp_Table', stand, cr, span(D, 6), (t) => { worst = merge(worst, check(who.group)); if (Math.abs(t - D / 2) < D / 10 && !worst.mid) { worst.mid = true; out.push(rec({ label: `${wn} PickUp_Table at ${t.toFixed(2)} s`, hits: check(who.group), cam, who: wn.toLowerCase() })); } });
        out.push(rec({ label: `${wn} PickUp_Table at the table's edge (6 frames)`, hits: worst, cam, who: wn.toLowerCase() }));
      }
      g.W.moveChair(0, ch.x, ch.z, ch.rot); g.scene.updateMatrixWorld(true); });
    // ---- on the open floor: a nod, a shake, calling from a rail, the torch (as held in the library, and mirrored into the right hand), a hand to a switch, a push, kneeling at a repair ----
    part('the open floor', () => { const at = g.DAD_HOME.clone(), yaw = 0;
      for (const [who, wn] of people) {
        hideOther(who);
        for (const name of ['Yes', 'Idle_No_Loop', 'Idle_Rail_Call', 'Idle_Torch_Loop', 'Idle_Torch_Loop_m', 'Interact', 'Push_Loop', 'Fixing_Kneeling']) {
          let worst = [], low = Infinity; const n = name === 'Fixing_Kneeling' ? 9 : 5, cam = camAt(at, yaw, 3.4, 1.0, 1.3), D = dur(who, name);
          run(who, name, at, yaw, span(D, n), (t) => { worst = merge(worst, check(who.group)); for (const b of ['L_Foot', 'R_Foot', 'L_Calf', 'R_Calf']) low = Math.min(low, bone(who, b).y); if (Math.abs(t - D / 2) < D / (2 * n) + 1e-3 && !worst.mid) { worst.mid = true; out.push(rec({ label: `${wn} ${name} at ${t.toFixed(2)} s`, hits: check(who.group), cam, who: wn.toLowerCase() })); } });
          out.push(rec({ label: `${wn} ${name}${name === 'Fixing_Kneeling' ? ` (lowest knee or ankle joint ${cm(low)} cm up)` : ''} (${n} frames)`, hits: worst, cam, who: wn.toLowerCase() }));
        }
      } });
    // ---- the parents' bed: lying to standing, laid where sleepers() lays the standing rig down (main.js), the quilt thrown back; the
    // clip (or its mirror) that pushes up on the arm away from the other sleeper ----
    part('the bed', () => {
      // which arm the library's sit-up pushes up on: the hand that is lower a third of a second in
      let push = 'L'; run(g.dad, 'LayToIdle', new V3(3.1, 0, -8.5), 0, [0.3], () => { push = bone(g.dad, 'L_Hand').y < bone(g.dad, 'R_Hand').y ? 'L' : 'R'; });
      for (const [who, wn] of people) {
        g.setPhase('morning', true); g.sleepers(true); step([g.mom, g.dad], 30); g.scene.updateMatrixWorld(true);
        // where the sleeper's bones are, with the tipped group
        const ref = Object.fromEntries(['Head', 'Pelvis', 'L_Foot', 'R_Foot', 'L_Hand', 'R_Hand'].map((n) => [n, bone(who, n)]));
        const spot = wn === 'Dad' ? g.W.parentsBed.dad : g.W.parentsBed.mom, yaw = spot.yaw ?? Math.PI / 2, o = other(who);
        // the clip's lying start: the same yaw with no tip (its first frame lies the body down itself, on its back with the head toward the
        // rig's -z, as the tip does), and the group placed so the clip's pelvis starts where the sleeper's is
        reset(who); who.group.rotation.set(0, yaw, 0); who.group.position.set(0, 0, 0); g.scene.updateMatrixWorld(true);
        const otherSide = bone(o, 'Pelvis').sub(ref.Pelvis).applyAxisAngle(UP, -yaw).x > 0 ? 'L' : 'R', name = push === otherSide ? 'LayToIdle_m' : 'LayToIdle';   // (the other sleeper on this one's left: push up on the right)
        const h0 = hipsAt(who, name, 0), clipK = K(who, name);
        g.W.bedSleepers.group.visible = false;   // (the quilt: thrown back by whoever gets up (W.bedSleepers.one); it is a sheet the bone lines would otherwise cross)
        // the two sleep 44 cm apart with the idle's wide stance, so their inner feet and hands all but touch as they lie: the clip is laid
        // out toward its own edge of the bed (over the crossfade from the sleeping pose) as far as the quilt's rolled edge allows the
        // lying start, up to 10 cm, so the knees drawing up and the free hand stay off the other's limbs
        let AWAY = 0.10, base = null;
        for (; AWAY >= 0; AWAY = +(AWAY - 0.01).toFixed(2)) {
          base = ref.Pelvis.clone().sub(new V3(0, PR[wn], 0)).sub(h0).add(new V3(otherSide === 'L' ? -AWAY : AWAY, 0, 0).applyAxisAngle(UP, yaw));
          let hit = false; run(who, name, base, yaw, [0], () => { hit = check(who.group, { floorCheck: false }).length > 0; });
          if (!hit) break;
        }
        const SEG = /Thigh|Calf|Foot|UpperArm|Forearm|Hand|Spine|Neck|Head|Pelvis/, oSegs = [];
        o.group.traverse((b) => { if (b.isBone && b.parent && b.parent.isBone && SEG.test(b.name)) oSegs.push([b.parent.getWorldPosition(new V3()), b.getWorldPosition(new V3()), b.name.replace(/^Bip01_/, '')]); });
        // the nearest this body's bones come to the other's bone lines, and which pair
        const nearOther = () => { let d = Infinity, pair = ''; const l = new THREE.Line3(), p = new V3(); who.group.traverse((b) => { if (!b.isBone || !b.parent || !b.parent.isBone || !SEG.test(b.name)) return; const q = b.getWorldPosition(new V3()); for (const [s0, s1, n] of oSegs) { l.set(s0, s1); l.closestPointToPoint(q, true, p); const e = p.distanceTo(q); if (e < d) { d = e; pair = `${b.name.replace(/^Bip01_/, '')} / ${n}`; } } }); return { d, pair }; };
        const cam = [[spot.x + Math.cos(yaw) * 1.6 + Math.sin(yaw) * 0.6, 1.5, spot.z - Math.sin(yaw) * 1.6 + Math.cos(yaw) * 0.6], [ref.Pelvis.x, 0.95, ref.Pelvis.z]];
        let residual = null, closest = { d: Infinity, pair: '' }, closestT = 0, upAt = {}, rest = null;
        const D = dur(who, name);
        run(who, name, base, yaw, span(D, 7), (t) => {
          const hits = check(who.group, { floorCheck: false }), near = nearOther(); if (near.d < closest.d) { closest = near; closestT = t; }
          // a limb into the other sleeper: closer than 4 cm between the bones, or closer than the two already lie (the sleepers' own
          // layout puts their inner hands and feet a few centimetres apart before anything moves) by more than a centimetre
          if (rest === null) rest = near;
          if (near.d < Math.min(0.04, rest.d - 0.01)) hits.push({ part: near.pair.split(' / ')[0], obj: `the other sleeper's ${near.pair.split(' / ')[1]} (${cm(near.d)} cm between the bones; ${cm(rest.d)} as they lie)`, depth: 'through', n: 1 });
          if (residual === null) residual = Object.fromEntries(Object.entries(ref).map(([n, v]) => [n, cm(bone(who, n).distanceTo(v))]));
          const up = bone(who, 'Head').sub(bone(who, 'Pelvis')).normalize(); upAt[t.toFixed(2)] = Math.round(Math.asin(Math.max(-1, Math.min(1, up.y))) * 180 / Math.PI);   // (how far the torso is up off the bed)
          out.push(rec({ label: `${wn} ${name} in the bed at ${t.toFixed(2)} s (torso ${upAt[t.toFixed(2)]} deg up)`, hits, cam, who: wn.toLowerCase() }));
        });
        out.push({ label: `${wn} ${name} numbers (the other sleeper on the ${otherSide === 'L' ? 'left' : 'right'}, the push on the ${name.endsWith('_m') ? (push === 'L' ? 'right' : 'left') : (push === 'L' ? 'left' : 'right')}): lying start vs the sleeper ${Object.entries(residual || {}).map(([n, d]) => n + ' ' + d).join(', ')} cm; group (0, yaw, 0) at ${base.x.toFixed(3)} ${base.y.toFixed(3)} ${base.z.toFixed(3)} = sleeper pelvis - (0, ${PR[wn].toFixed(3)}, 0) - hips[0] x ${clipK.toFixed(3)} + ${cm(AWAY)} cm away from the other; torso up ${Object.entries(upAt).map(([t, a]) => a + ' deg at ' + t).join(', ')}; the feet end ${cm(base.y + hipsAt(who, name, D).y)} cm over the floor; nearest the other sleeper ${cm(closest.d)} cm (${closest.pair}) at ${closestT.toFixed(2)} s, ${cm(rest.d)} cm (${rest.pair}) as they lie`, hits: [] });
        g.W.bedSleepers.group.visible = true; g.sleepers(false); reset(who); who.rig.play('idle', { fade: 0 });
      }
    });
    g.setPhase('day', true); for (const [p] of people) { reset(p); p.busy = false; p.rig.play('idle', { fade: 0 }); }
    return out;
  }),
};
