// Contact scenes for the parents at night (js/parents.js): every pose the night gives Mom and Dad, checked against the bed, the bunk,
// the door, the floor, what they hold and each other.
//   node tests/contacts.js --only parents [--shots dir]
//     Dad walking down the hall with his torch lit, sitting up in bed, a roll-over halfway and all the way, his arm out on the quilt,
//     getting out of bed (the legs swung over the edge, sat on it, half stood), his hand on the barn door's pull; Mom standing in the
//     hall with no light, and sat on the bottom bunk
//   node tests/contacts.js --only parentsLive
//     three minutes of the two of them asleep as the night animates them (at 60 frames a second, checked every ten frames): no limb
//     through the headboard, the mattress or the frame, nor through the other body, except the arm that is out, which lies on the quilt
//     (its bones cross the quilt where it comes out from under it: that is the one contact allowed); and in those three minutes each of
//     them turns over at least once and Dad's arm comes out once
// The frame is stopped (tests/contacts.js); the parents module is stepped by hand with the people and the quilt.
const lib = () => {
  const g = window.__game, C = window.__contacts, V3 = C.V3;
  // the bones of a body as capsules: [a, b, radius]
  const SEG = [['Pelvis', 'Spine1', 0.12], ['Spine1', 'Spine2', 0.12], ['Spine2', 'Neck', 0.11], ['Neck', 'Head', 0.06], ['L_UpperArm', 'L_Forearm', 0.045], ['L_Forearm', 'L_Hand', 0.035], ['L_Hand', 'L_Finger2', 0.025],
    ['R_UpperArm', 'R_Forearm', 0.045], ['R_Forearm', 'R_Hand', 0.035], ['R_Hand', 'R_Finger2', 0.025], ['L_Thigh', 'L_Calf', 0.07], ['L_Calf', 'L_Foot', 0.05], ['R_Thigh', 'R_Calf', 0.07], ['R_Calf', 'R_Foot', 0.05]];
  const caps = (who) => { const r = who.rig, out = []; for (const [a, b, rad] of SEG) { const A = r.bones[a], B = r.bones[b]; if (A && B) out.push([A.getWorldPosition(new V3()), B.getWorldPosition(new V3()), rad, a]); } return out; };
  const segDist = (p, a, b) => { const ab = b.clone().sub(a), t = Math.max(0, Math.min(1, p.clone().sub(a).dot(ab) / Math.max(1e-9, ab.lengthSq()))); return p.distanceTo(a.clone().addScaledVector(ab, t)); };
  // one body's skin inside the other's flesh (its bones' capsules), deeper than a centimetre
  const others = (a, b, skip = []) => {
    const hits = new Map(), cb = caps(b), names = a === g.dad ? 'Dad' : 'Mom', other = b === g.dad ? 'Dad' : 'Mom';
    for (const s of C.body(a.group)) {
      if (skip.some((re) => re.test(s.part))) continue;
      for (const [p0, p1, rad, bn] of cb) { const d = rad - segDist(s.p, p0, p1); if (d > 0.01) { const k = s.part + '|' + bn; const h = hits.get(k); if (!h || h.depth < d) hits.set(k, { part: `${names} ${s.part}`, obj: `${other}'s ${bn}`, depth: d, n: (h ? h.n : 0) + 1 }); } }
    }
    return [...hits.values()].map((h) => ({ ...h, depth: +(h.depth * 100).toFixed(1) }));
  };
  // the audit keeps every geometry's triangles from the first time it sees it, and the quilt changes shape every frame: each check is
  // given fresh copies of its two sheets (put back after)
  const sheets = () => { const out = []; g.W.bedSleepers.group.traverse((o) => { if (o.isMesh) out.push(o); }); return out; };
  const check = (root, opts) => { const ss = sheets(), keep = ss.map((m) => m.geometry); ss.forEach((m) => { m.geometry = m.geometry.clone(); m.geometry.computeBoundingBox(); });
    try { return C.check(root, opts); } finally { ss.forEach((m, i) => { m.geometry.dispose(); m.geometry = keep[i]; }); } };
  return { g, C, V3, others, check };
};
module.exports = {
  parents: async (page) => page.evaluate(async (libSrc) => {
    const { g, C, V3, others, check } = (new Function(`return (${libSrc})()`))();
    const par = (await import('/js/hooks.js')).hooks.parents, t = par.test, out = [];
    t.force = true; g.setPhase('night', true); g.F.phase = 'night';
    let T = 0;
    const step = (n, fn) => { for (let i = 0; i < n; i++) { T += 1 / 60; if (fn) fn(i); par.update(1 / 60); for (const p of [g.mom, g.dad]) if (p.group.visible) p.update(T, 1 / 60); g.W.bedSleepers.update(1 / 60); } g.scene.updateMatrixWorld(true); t.follow('dad'); g.scene.updateMatrixWorld(true); };
    const bedAt = g.W.bedSleepers.group.getWorldPosition(new V3());
    const bedCam = [[bedAt.x + 0.3, 1.5, bedAt.z - 1.7], [bedAt.x, 0.75, bedAt.z]];
    const frame = (label, root, hits, cam) => out.push(C.rec({ label, hits, cam }));
    const bedFrame = (label, who, fn, opts = {}) => {
      step(60, fn); const other = who === g.dad ? g.mom : g.dad;
      let hits = check(who.group, { floorCheck: false });
      if (opts.allow) hits = hits.filter((h) => !opts.allow(h));
      hits = hits.concat(others(who, other, opts.skipOther || []), others(other, who, opts.skipOther || []));
      frame(label, who.group, hits, opts.cam || bedCam);
    };
    // ---- in bed ----
    g.lights.set('parents', true, { silent: true });
    g.mom.group.visible = g.dad.group.visible = true;
    t.bedPose('mom', {}); t.bedPose('dad', {});
    bedFrame('Dad and Mom asleep, at rest', g.dad, () => { t.bedPose('dad', {}); t.bedPose('mom', {}); });
    bedFrame('Dad sitting up in bed', g.dad, () => { t.bedPose('dad', { sit: 1 }); t.bedPose('mom', {}); });
    bedFrame('Dad sitting up halfway', g.dad, () => { t.bedPose('dad', { sit: 0.5 }); t.bedPose('mom', {}); });
    bedFrame('Both rolling over, halfway', g.dad, () => { t.bedPose('dad', { roll: 0.28 }); t.bedPose('mom', { roll: -0.28 }); });
    bedFrame('Mom rolling over, halfway', g.mom, () => { t.bedPose('dad', { roll: 0.28 }); t.bedPose('mom', { roll: -0.28 }); });
    bedFrame('Both on their sides', g.dad, () => { t.bedPose('dad', { roll: 0.55 }); t.bedPose('mom', { roll: -0.55 }); });
    bedFrame('Mom on her side', g.mom, () => { t.bedPose('dad', { roll: 0.55 }); t.bedPose('mom', { roll: -0.55 }); });
    // the arm out: its bones cross the quilt where it comes out from under it (the one contact the design allows)
    const outArm = (h) => /^L (upper arm|forearm|hand)/.test(h.part) && /^plane /.test(h.obj);   // (the quilt is an unnamed sheet: 'plane <size> at <where>')
    bedFrame("Dad's arm out on the quilt", g.dad, () => { t.bedPose('dad', { arm: 1 }); t.bedPose('mom', {}); }, { allow: outArm });
    // getting out of bed: from sitting up, the legs swung out over his side, sat on the edge, half stood
    t.bedPose('dad', { sit: 1 }); step(30, () => t.bedPose('dad', { sit: 1 })); t.swing('dad', 0);
    for (const u of [0.25, 0.5, 0.75, 1]) bedFrame(`Dad getting out of bed (${u})`, g.dad, () => t.swing('dad', u), { cam: [[bedAt.x + 0.4, 1.4, bedAt.z - 2.0], [bedAt.x, 0.7, bedAt.z - 0.3]] });
    for (const h of [0, 0.5, 1]) { step(30, () => t.seated('dad', h)); frame(h ? `Dad standing up from the edge of the bed (${h})` : 'Dad sat on the edge of the bed', g.dad.group, check(g.dad.group, { floorCheck: true }).concat(others(g.dad, g.mom)), [[bedAt.x + 0.4, 1.4, bedAt.z - 2.0], [bedAt.x, 0.7, bedAt.z - 0.3]]); }
    step(20, () => t.stepOut('dad', 1)); frame('Dad stepped out from the bed', g.dad.group, check(g.dad.group, {}), [[bedAt.x + 0.4, 1.4, bedAt.z - 2.0], [bedAt.x, 0.7, bedAt.z - 0.3]]);
    // ---- up and about ----
    g.lights.set('parents', false, { silent: true });
    t.bedPose('mom', {});
    // Dad walking down the hall, his torch lit, its beam on the floor ahead: a walk cycle's worth of frames
    t.standAt('dad', 8.6, -0.5, -Math.PI / 2, { walk: true });
    let walkHits = [];
    for (let i = 0; i < 8; i++) { step(9, () => { g.dad.group.position.x -= 0.017; }); walkHits = C.merge(walkHits, check(g.dad.group, {})); }
    frame('Dad walking with his torch', g.dad.group, walkHits, [[g.dad.group.position.x - 2.2, 1.4, -0.9], [g.dad.group.position.x, 1.0, -0.5]]);
    if (!g.W.dadTorch.visible || !g.W.dadTorch.held) frame('Dad walking with his torch: the torch is not lit in his hand', g.dad.group, [{ part: 'torch', obj: 'not lit', depth: 'through', n: 1 }], [[0, 1, 0], [0, 0, 0]]);
    // his left hand on the barn door's pull, from inside their room, the torch in the right
    { const d = g.W.doors.parents, c = d.col; t.standAt('dad', c.minX - 0.42, 0.85, Math.PI / 2, { walk: false });
      step(40, () => t.hand('dad', 'L', { x: c.minX - 0.03, y: 1.08, z: d.hz - (d.slide.half - 0.16) }));
      frame("Dad's hand on the barn door's pull", g.dad.group, check(g.dad.group, {}), [[c.minX - 1.6, 1.5, 0.2], [c.minX, 1.0, 0.85]]); t.hand('dad', 'L', null); }
    // Mom in the hall with no light (and Dad's torch on his nightstand, dark)
    t.standAt('dad', -20, -20, 0, { torchLit: false }); g.dad.group.visible = false;
    t.standAt('mom', 8.2, -0.45, -Math.PI / 2, { walk: false }); step(40);
    frame('Mom standing in the hall without a light', g.mom.group, check(g.mom.group, {}).concat(g.W.dadTorch.visible ? [{ part: 'torch', obj: 'lit', depth: 'through', n: 1 }] : []), [[6.2, 1.4, -0.7], [8.2, 1.0, -0.45]]);
    // Mom sat on the front of the bottom bunk, under the top one
    step(40, () => t.onBunk(1));
    frame('Mom sitting on the bottom bunk', g.mom.group, check(g.mom.group, {}), [[7.0, 1.3, 2.6], [8.3, 1.0, 3.4]]);
    return out;
  }, lib.toString()),

  parentsLive: async (page) => page.evaluate(async (libSrc) => {
    const { g, C, V3, others, check } = (new Function(`return (${libSrc})()`))();
    const par = (await import('/js/hooks.js')).hooks.parents, t = par.test, out = [];
    t.force = true; g.F.night = 2; g.setPhase('night', true); g.F.phase = 'night';
    g.mom.group.visible = g.dad.group.visible = true;
    const bedAt = g.W.bedSleepers.group.getWorldPosition(new V3());
    let T = 0, all = [], checks = 0, worstOther = 0;
    const armOut = () => t.PAR.dad.armOut.L > 0.02 || t.PAR.mom.armOut.R > 0.02;
    const outArm = (h) => /^(L|R) (upper arm|forearm|hand)/.test(h.part) && /^plane /.test(h.obj) && armOut();
    for (let f = 0; f < 180 * 60; f++) {
      T += 1 / 60; par.update(1 / 60); g.mom.update(T, 1 / 60); g.dad.update(T, 1 / 60); g.W.bedSleepers.update(1 / 60);
      if (f % 10) continue;
      g.scene.updateMatrixWorld(true); checks++;
      for (const who of [g.dad, g.mom]) {
        let hits = check(who.group, { floorCheck: false }).filter((h) => !outArm(h));
        hits = hits.concat(others(who, who === g.dad ? g.mom : g.dad, armOut() ? [/^(L|R) (upper arm|forearm|hand)/] : []));
        if (hits.length) all = C.merge(all, hits.map((h) => ({ ...h, part: (who === g.dad ? 'Dad ' : 'Mom ') + h.part })));
      }
    }
    const s = t.stats;
    if (s.rolls.dad < 1) all.push({ part: 'Dad', obj: 'never turned over in three minutes', depth: 'through', n: 1 });
    if (s.rolls.mom < 1) all.push({ part: 'Mom', obj: 'never turned over in three minutes', depth: 'through', n: 1 });
    if (s.armOuts.dad < 1) all.push({ part: 'Dad', obj: 'his arm never came out in three minutes', depth: 'through', n: 1 });
    out.push(C.rec({ label: `Three minutes asleep (${checks} checks; rolls Dad ${s.rolls.dad}, Mom ${s.rolls.mom}; Dad's arm out ${s.armOuts.dad})`, hits: all, cam: [[bedAt.x + 0.3, 1.5, bedAt.z - 1.7], [bedAt.x, 0.75, bedAt.z]] }));
    void worstOther;
    return out;
  }, lib.toString()),
};
