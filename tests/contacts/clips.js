// Contact scenes for the baked body-language clips (assets/models/body.bin, the JOBS of tools/models/body.cjs): each new clip played
// on Dad and on Mom where the game will play it (the kitchen chair, a box in the arms, the wall phone, the parents' bed, the table's
// edge, the open floor), and the skinned body checked on several frames of it against the chair, the table, the box, the bed, the wall
// and the floor; in the bed, the bones are also kept clear of the other sleeper.
//   node tests/contacts.js --only clips [--shots dir]
// A clip that keeps its legs comes with its hips' path (clip.userData.hips, see js/rig.js loadBody): the group is moved by it here,
// as any player of such a clip must, so the legs fold onto the seat, the floor and the bed instead of in the air. The lying start
// of LayToIdle is laid where sleepers() (main.js) lays the standing rig by a group rotation, and the frame's label reports how far
// the two poses are apart (the numbers in tools/models/README.md come from here).
module.exports = {
  clips: async (page) => page.evaluate(async () => {
    const g = window.__game, { THREE, V3, check, step, rec, merge } = window.__contacts, out = [], UP = new V3(0, 1, 0);
    const people = [[g.dad, 'Dad'], [g.mom, 'Mom']];
    g.setPhase('morning', true);
    const cm = (v) => +(v * 100).toFixed(1), hs = (who) => (who.group.userData.h || 1.75) / 1.75;
    // the clip's hip path at time t: metres, turned by the person's yaw
    const hipsAt = (who, name, t) => {
      const c = who.rig.clips[name], u = c && c.userData, H = u && u.hips; if (!H) return new V3();
      const k = (who.group.userData.h || 1.75) / u.height, f = Math.min(H.length - 1, Math.max(0, t * u.fps)), i = Math.floor(f), s = f - i, a = H[i], b = H[Math.min(H.length - 1, i + 1)];
      return new V3((a[0] + (b[0] - a[0]) * s) * k / 1000, (a[1] + (b[1] - a[1]) * s) * k / 1000, (a[2] + (b[2] - a[2]) * s) * k / 1000).applyAxisAngle(UP, who.group.rotation.y);
    };
    const bone = (who, n) => { const b = who.rig.bones[n]; b.updateWorldMatrix(true, false); return b.getWorldPosition(new V3()); };
    const reset = (who) => { who.busy = true; who.pose = null; who.sitNow = 0; who.listening = false; who.talk(null); who.sleeping = false; who.lookAt = null; who.mood = null; who.group.rotation.order = 'XYZ'; who.group.visible = true; };
    for (const [p] of people) reset(p);
    // a person stood at `base` facing `yaw`, settled in the idle, then the clip from its start, played once: frame(t) is called at each
    // time in `times` (seconds) with the hips applied and the scene up to date
    const run = (who, name, base, yaw, times, frame, each = null) => {
      reset(who); who.group.position.copy(base); who.group.rotation.set(0, yaw, 0); who.rig.play('idle', { fade: 0 }); step([who], 8);
      const a = who.rig.actions[name]; if (!a) { out.push({ label: `${name}: no such clip`, hits: [{ part: 'clip', obj: 'missing', depth: 'through', n: 1 }], cam: [[0, 1, 0], [0, 0, 0]] }); return; }
      a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; who.rig.play(name, { fade: 0 }); who.update(0, 0);   // (a step of no time: the first frame's pose)
      let t = 0;
      for (const tt of times) {
        while (t < tt - 1e-6) { step([who], 1, each); t += 1 / 60; }
        who.group.position.copy(base).add(hipsAt(who, name, t)); g.scene.updateMatrixWorld(true);
        frame(t);
      }
      a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false;
    };
    const span = (d, n) => Array.from({ length: n }, (_, i) => +(d * i / (n - 1)).toFixed(3));
    const camAt = (at, yaw, dist = 1.9, h = 1.25, side = 0.9, look = 0.8) => [[at.x + Math.sin(yaw) * dist * 0.6 + Math.cos(yaw) * side, h, at.z + Math.cos(yaw) * dist * 0.6 - Math.sin(yaw) * side], [at.x, look, at.z]];
    const other = (who) => (who === g.dad ? g.mom : g.dad), hideOther = (who) => { other(who).group.visible = false; };
    const dur = (who, name) => who.rig.actions[name].getClip().duration;

    // ---- the kitchen chair: sitting down on it and getting up from it, the chair pulled back from the table as it would be ----
    const C = g.W.chairs, mid = C.reduce((a, c) => a.add(c.holder.getWorldPosition(new V3())), new V3()).multiplyScalar(1 / C.length);
    const ch = C[0], h0 = ch.holder.getWorldPosition(new V3()), cr = Math.atan2(mid.x - h0.x, mid.z - h0.z), fwd = new V3(Math.sin(cr), 0, Math.cos(cr));
    g.W.moveChair(0, ch.holder.position.x - fwd.x * 0.32, ch.holder.position.z - fwd.z * 0.32, ch.rot); g.scene.updateMatrixWorld(true);
    const hp = ch.holder.getWorldPosition(new V3()), seatY = g.seatHeight(ch), seat = hp.clone().addScaledVector(fwd, -0.07);   // (the hips over the back half of the seat, as seatOn puts them)
    for (const [who, wn] of people) {
      hideOther(who);
      const k = (who.group.userData.h || 1.75) / who.rig.clips.Sitting_Exit.userData.height;
      for (const name of ['Sitting_Enter', 'Sitting_Exit']) {
        // the seated end of the clip has the hips behind and below the standing rest (0.28 m back, 0.38 m down for the library's
        // 1.83 m body): the standing spot is that far in front of the seat, so the seated hips land on it, and the feet are on the floor at both ends
        const H = who.rig.clips[name].userData.hips, sh = name === 'Sitting_Enter' ? H[H.length - 1] : H[0], D = dur(who, name);
        const base = seat.clone().sub(new V3(sh[0] * k / 1000, 0, sh[2] * k / 1000).applyAxisAngle(UP, cr)); base.y = 0;
        let worst = [], over = null, midT = null;
        run(who, name, base, cr, span(D, 7), (t) => {
          worst = merge(worst, check(who.group));
          if (name === 'Sitting_Enter' ? t >= D - 1e-3 : t <= 1e-3) over = bone(who, 'Pelvis').y - (seatY + 0.09 * hs(who));   // (seated: the hip joints a buttock's thickness over the seat, as sit() wants them)
          if (midT === null && t > 0.3 && t < D - 0.3) midT = t;
        });
        out.push(rec({ label: `${wn} ${name} at the kitchen chair (7 frames; seated hips ${over === null ? '?' : (over >= 0 ? '+' : '') + cm(over) + ' cm vs seat+9'})`, hits: worst, cam: camAt(seat, cr, 2.0, 1.2, 1.1, 0.7), who: wn.toLowerCase() }));
        // and the middle of the clip on its own: the picture of Dad half up out of the chair
        if (midT !== null) run(who, name, base, cr, [midT], (t) => out.push(rec({ label: `${wn} ${name} at ${t.toFixed(2)} s`, hits: check(who.group), cam: camAt(seat, cr, 2.0, 1.2, 1.1, 0.7), who: wn.toLowerCase() })));
      }
    }
    // ---- eating at the table: Consume's arms over the seated clip, the chair back at the table, the other hand resting on the thigh ----
    g.W.moveChair(0, ch.x, ch.z, ch.rot); g.scene.updateMatrixWorld(true);
    for (const [who, wn] of people) {
      hideOther(who);
      // which hand the library eats with: the one that rises
      let eats = 'R'; run(who, 'Consume', new V3(3.1, 0, -8.5), 0, [0.5], () => { eats = bone(who, 'L_Hand').y > bone(who, 'R_Hand').y + 0.05 ? 'L' : 'R'; });
      const clip = eats === 'L' ? 'Consume_m' : 'Consume';   // (mirrored when the library eats with the left: the right hand eats, the left rests)
      reset(who); who.rig.play('idle', { fade: 0 }); g.seatOn(who, 0, mid); step([who], 60);
      who.pose = { sit: 1, seat: who.seatAt, L: { reachLocal: who.lap.L.clone(), palm: 'down', grip: 0.15 } };
      const sp = who.group.position.clone(), a = who.rig.actions[clip]; a.setLoop(THREE.LoopOnce, 1); a.clampWhenFinished = true; a.reset();
      let worst = []; step([who], 110, (i) => { who.rig.overlay(clip, 0.95, { rate: 60 }); if (i >= 20 && i % 15 === 0) worst = merge(worst, check(who.group)); });
      out.push(rec({ label: `${wn} eating at the table (${clip}, 6 frames)`, hits: worst, cam: camAt(sp, who.group.rotation.y, 2.0, 1.25, 1.0, 0.8), who: wn.toLowerCase() }));
      a.setLoop(THREE.LoopRepeat, Infinity); a.clampWhenFinished = false; a.stop(); if (who.rig.ov) who.rig.ov.delete(clip);
      who.pose = null; who.sitNow = 0;
    }
    // ---- a box in the arms: the carrying walk laid over the walk, out on the drive, the box made to fit the hands ----
    for (const [who, wn] of people) {
      hideOther(who); reset(who);
      const at = new V3(3.1, 0, -8.5), yaw = Math.PI;
      who.group.position.copy(at); who.group.rotation.set(0, yaw, 0); who.rig.play('idle', { fade: 0 }); step([who], 8);
      who.rig.play('walk', { fade: 0 }); step([who], 50, () => who.rig.overlay('Walk_Carry_Loop', 0.97, { rate: 60 }));
      const pL = who.palm('L', new V3()), pR = who.palm('R', new V3()), nL = who.palm('L', null, new V3()), nR = who.palm('R', null, new V3());
      const left = new V3(1, 0, 0).applyAxisAngle(UP, yaw), sideGrip = Math.abs(nL.dot(left)) > 0.5 && Math.abs(nR.dot(left)) > 0.5;
      const w = sideGrip ? Math.max(0.2, pL.distanceTo(pR) - 0.03) : 0.42, c = pL.clone().add(pR).multiplyScalar(0.5);
      const box = g.W.cardboardBox(0, 0, 0, w, 0.36, 0.4, 1, 0, g.scene); box.name = 'box'; box.traverse((o) => { o.userData.held = true; o.name = 'box'; });
      box.position.copy(c); if (!sideGrip) { box.position.y = c.y + 0.012 + 0.18; box.position.addScaledVector(new V3(0, 0, 1).applyAxisAngle(UP, yaw), 0.06); } box.rotation.set(0, yaw, 0);
      g.scene.updateMatrixWorld(true);
      const off = () => ['L', 'R'].map((s) => { const l = box.worldToLocal(who.palm(s, new V3())), h = box.geometry.parameters, o = Math.hypot(Math.max(0, Math.abs(l.x) - h.width / 2), Math.max(0, Math.abs(l.y) - h.height / 2), Math.max(0, Math.abs(l.z) - h.depth / 2)); return o > 0.045 ? { part: s + ' hand', obj: 'off the held box', depth: cm(o), n: 1 } : null; }).filter(Boolean);
      let worst = []; step([who], 120, (i) => { who.rig.overlay('Walk_Carry_Loop', 0.97, { rate: 60 }); if (i % 8 === 7) worst = merge(worst, [...check(who.group), ...off()]); });
      out.push(rec({ label: `${wn} Walk_Carry_Loop, a ${sideGrip ? 'box between the palms' : 'box on the hands'} (15 frames)`, hits: worst, cam: [[at.x + 0.9, 1.35, at.z - 1.0], [at.x, 1.05, at.z - 0.3]], who: wn.toLowerCase() }));
      box.parent.remove(box); if (who.rig.ov) who.rig.ov.delete('Walk_Carry_Loop'); who.rig.play('idle', { fade: 0 }); step([who], 4);
    }
    // ---- the wall phone: standing in front of it, the handset hand up ----
    { const ph = g.W.phone.pos, stand = new V3(ph.x - 0.42, 0, ph.z), yaw = Math.PI / 2;   // (the phone hangs on the dining room's east wall, facing west)
      for (const [who, wn] of people) {
        hideOther(who); let worst = [];
        run(who, 'Idle_TalkingPhone_Loop', stand, yaw, span(dur(who, 'Idle_TalkingPhone_Loop'), 5), () => { worst = merge(worst, check(who.group)); });
        out.push(rec({ label: `${wn} Idle_TalkingPhone_Loop at the wall phone (5 frames)`, hits: worst, cam: [[stand.x - 0.4, 1.45, stand.z + 1.6], [stand.x + 0.1, 1.2, stand.z]], who: wn.toLowerCase() }));
      } }
    // ---- the table's edge: taking something off it ----
    { const ray = new THREE.Raycaster(); let R = 0.3;   // how far the top reaches from the middle, found by dropping rays outward
      for (let d = 0.3; d < 1.2; d += 0.02) { ray.set(new V3(mid.x - fwd.x * d, 1.2, mid.z - fwd.z * d), new V3(0, -1, 0)); ray.far = 0.7; const hit = ray.intersectObjects(g.scene.children, true).find((h) => h.object.isMesh && !h.object.isSkinnedMesh && h.point.y > 0.55 && h.point.y < 0.9); if (hit) R = d; else if (d > R + 0.05) break; }
      const stand = mid.clone().addScaledVector(fwd, -(R + 0.14)); stand.y = 0;
      g.W.moveChair(0, ch.x - fwd.x * 0.9, ch.z - fwd.z * 0.9, ch.rot); g.scene.updateMatrixWorld(true);   // (the chair out of the way)
      for (const [who, wn] of people) {
        hideOther(who); let worst = [];
        run(who, 'PickUp_Table', stand, cr, span(dur(who, 'PickUp_Table'), 6), () => { worst = merge(worst, check(who.group)); });
        out.push(rec({ label: `${wn} PickUp_Table at the table's edge (6 frames)`, hits: worst, cam: camAt(stand, cr, 2.2, 1.3, 1.2, 0.9), who: wn.toLowerCase() }));
      }
      g.W.moveChair(0, ch.x, ch.z, ch.rot); g.scene.updateMatrixWorld(true); }
    // ---- on the open floor: a nod, a shake, calling from a rail, the torch (as held in the library, and mirrored into the right hand), a hand to a switch, a push, kneeling at a repair ----
    { const at = g.DAD_HOME.clone(), yaw = 0;
      for (const [who, wn] of people) {
        hideOther(who);
        for (const name of ['Yes', 'Idle_No_Loop', 'Idle_Rail_Call', 'Idle_Torch_Loop', 'Idle_Torch_Loop_m', 'Interact', 'Push_Loop', 'Fixing_Kneeling']) {
          let worst = [], low = Infinity; const n = name === 'Fixing_Kneeling' ? 9 : 5;
          run(who, name, at, yaw, span(dur(who, name), n), () => { worst = merge(worst, check(who.group)); for (const b of ['L_Foot', 'R_Foot', 'L_Calf', 'R_Calf']) low = Math.min(low, bone(who, b).y); });
          out.push(rec({ label: `${wn} ${name}${name === 'Fixing_Kneeling' ? ` (lowest knee or ankle bone ${cm(low)} cm up)` : ''} (${n} frames)`, hits: worst, cam: camAt(at, yaw, 2.3, 1.3, 1.2, 0.9), who: wn.toLowerCase() }));
        }
      } }
    // ---- the parents' bed: lying to standing, laid where sleepers() lays the standing rig down (main.js) ----
    for (const [who, wn] of people) {
      g.setPhase('morning', true); g.sleepers(true); step([g.mom, g.dad], 30); g.scene.updateMatrixWorld(true);
      // where the sleeper's bones are, with the tipped group
      const ref = Object.fromEntries(['Head', 'Pelvis', 'L_Foot', 'R_Foot', 'L_Hand', 'R_Hand'].map((n) => [n, bone(who, n)]));
      const spot = wn === 'Dad' ? g.W.parentsBed.dad : g.W.parentsBed.mom, yaw = spot.yaw ?? Math.PI / 2;
      // the clip's lying start: the same yaw with no tip (its first frame lies the body down itself, head toward the rig's -z, as
      // the tip does), and the group placed so the clip's pelvis starts where the sleeper's is
      reset(who); who.group.rotation.set(0, 0, 0); who.group.position.set(0, 0, 0); who.rig.play('idle', { fade: 0 }); step([who], 4);
      const pelvisRest = bone(who, 'Pelvis').y, h0 = hipsAt(who, 'LayToIdle', 0).applyAxisAngle(UP, yaw), clipK = (who.group.userData.h || 1.75) / who.rig.clips.LayToIdle.userData.height;
      const base = ref.Pelvis.clone().sub(new V3(0, pelvisRest, 0)).sub(h0);
      g.W.bedSleepers.one(wn.toLowerCase(), false); for (let i = 0; i < 12; i++) g.W.bedSleepers.update(0.5);   // (that side of the quilt down, as it would be once they move)
      const o = other(who), SEG = /Thigh|Calf|Foot|UpperArm|Forearm|Hand|Spine|Neck|Head|Pelvis/, oSegs = [];
      o.group.traverse((b) => { if (b.isBone && b.parent && b.parent.isBone && SEG.test(b.name)) oSegs.push([b.parent.getWorldPosition(new V3()), b.getWorldPosition(new V3())]); });
      const nearOther = () => { let d = Infinity; const l = new THREE.Line3(), p = new V3(); who.group.traverse((b) => { if (!b.isBone || !b.parent || !b.parent.isBone || !SEG.test(b.name)) return; const q = b.getWorldPosition(new V3()); for (const [s0, s1] of oSegs) { l.set(s0, s1); l.closestPointToPoint(q, true, p); d = Math.min(d, p.distanceTo(q)); } }); return d; };
      const cam = [[spot.x + Math.cos(yaw) * 1.3 + Math.sin(yaw) * 0.4, 1.7, spot.z - Math.sin(yaw) * 1.3 + Math.cos(yaw) * 0.4], [ref.Pelvis.x, 0.9, ref.Pelvis.z]];
      let worst = [], residual = null, closest = Infinity;
      const D = dur(who, 'LayToIdle');
      run(who, 'LayToIdle', base, yaw, span(D, 7), (t) => {
        const hits = check(who.group, { floorCheck: false }); worst = merge(worst, hits); closest = Math.min(closest, nearOther());
        if (t === 0) residual = Object.fromEntries(Object.entries(ref).map(([n, v]) => [n, cm(bone(who, n).distanceTo(v))]));
        if (t === 0 || Math.abs(t - D / 2) < 0.15 || t >= D - 1e-3) out.push(rec({ label: `${wn} LayToIdle at ${t.toFixed(2)} s`, hits, cam, who: wn.toLowerCase() }));
      });
      if (closest < 0.1) worst = merge(worst, [{ part: 'bones', obj: `the other sleeper (${cm(closest)} cm)`, depth: 'through', n: 1 }]);
      out.push(rec({ label: `${wn} LayToIdle from the bed (7 frames; lying start vs the sleeper: ${Object.entries(residual || {}).map(([n, d]) => n + ' ' + d).join(', ')} cm; group (0, yaw, 0) at ${base.x.toFixed(3)} ${base.y.toFixed(3)} ${base.z.toFixed(3)} = sleeper pelvis - (0, ${pelvisRest.toFixed(3)}, 0) - hips[0] x ${clipK.toFixed(3)}; the feet end ${cm(base.y + hipsAt(who, 'LayToIdle', D).y)} cm over the floor; nearest the other sleeper ${cm(closest)} cm)`, hits: worst, cam, who: wn.toLowerCase() }));
      g.W.bedSleepers.one(wn.toLowerCase(), true); g.sleepers(false); reset(who); who.rig.play('idle', { fade: 0 });
    }
    g.setPhase('day', true); for (const [p] of people) { reset(p); p.busy = false; p.rig.play('idle', { fade: 0 }); }
    return out;
  }),
};
