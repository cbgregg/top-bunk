// Contact scenes for the night doors (js/doors.js): the thing where the leash puts it, 0.6 m outside each door out of the house (the front
// door, on the step's top; the back door, on the stoop, where it also waits for a kid coming up out of the cellar), facing a player who has
// come out, standing as it stands to be seen (the sight's head tilt, looking at the player), and its skinned body checked over a second
// of that against the walls, the door frames, the steps, the stairwell and the floor.
//   node tests/contacts.js --only leash [--shots dir]
module.exports = {
  leash: async (page) => page.evaluate(async () => {
    const g = window.__game, { V3, check, rec, merge, body } = window.__contacts, nav = await import('/js/nav.js'), out = [], E = g.E;
    // the house's walls are one open shell (the audit gives them bone lines only), so the skin is also held against the colliders that
    // stand for them: a wall box, on the floor range it covers, with a point of the body more than 1.5 cm inside it
    const boxes = () => {
      const hits = new Map();
      for (const s of body(E.root)) for (const c of g.W.colliders) {
        if (c.on === false || !(c.wall || c.door) || s.p.y < (c.minY ?? -0.3) || s.p.y > (c.maxY ?? 3)) continue;
        if (s.p.x <= c.minX || s.p.x >= c.maxX || s.p.z <= c.minZ || s.p.z >= c.maxZ) continue;
        const d = Math.min(s.p.x - c.minX, c.maxX - s.p.x, s.p.z - c.minZ, c.maxZ - s.p.z); if (d <= 0.015) continue;
        const k = s.part + '|' + (c.door ? c.door + ' door strip' : 'wall'), h = hits.get(k); if (!h || d > h.depth) hits.set(k, { part: s.part, obj: c.door ? c.door + ' door strip' : `wall ${c.minX.toFixed(2)}..${c.maxX.toFixed(2)} x ${c.minZ.toFixed(2)}..${c.maxZ.toFixed(2)}`, depth: d, n: 1 });
      }
      return [...hits.values()].map((h) => ({ ...h, depth: +(h.depth * 100).toFixed(1) }));
    };
    g.setPhase('night', true);
    for (const k of ['front', 'back', 'basement']) { const d = g.W.doors[k]; d.target = 0; d.a = 0; d.apply(); }
    g.mom.group.visible = g.dad.group.visible = false;
    // each spot, the way out from its door, and the floor it stands on
    const SPOTS = [['frontOut', [0, -1], 'front door, on the step'], ['backOut', [0, 1], 'back door, on the stoop'], ['backOut', [-1, 0], 'back door, facing the cellar stairs']];
    for (const [id, [ox, oz], label] of SPOTS) {
      const [x, z, y = 0] = nav.NODES[id], px = x + ox * 2.0, pz = z + oz * 2.0;
      const eye = new V3(px, y + 1.32, pz); g.camera.position.copy(eye);
      E.visible = true; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0.35; E.smileScale = 1; E.lookTarget = g.camera.position;
      E.root.position.set(x, y, z); E.faceTowards(px, pz, 1);
      let hits = [];
      for (let i = 0; i < 60; i++) { E.update(1 / 60); g.camera.position.copy(eye); if (i % 15 === 14) { g.scene.updateMatrixWorld(true); hits = merge(merge(hits, check(E.root, { floor: y })), boxes()); } }
      const side = oz ? new V3(1, 0, 0) : new V3(0, 0, 1);   // a level camera out in front and off to the side the house is not on
      out.push(rec({ label: `the leash at the ${label}`, hits, cam: [[x + ox * 3.2 + side.x * 1.6, y + 1.4, z + oz * 3.2 + side.z * 1.6], [x, y + 1.2, z]] }));
    }
    E.visible = false;
    return out;
  }),
};
