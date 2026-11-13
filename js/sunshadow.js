// The sun's shadow map, kept. The house, the yard and the trees stand still, and they are most of what the sun's map draws (five hundred
// draws, every third frame). So the map of what stands still is drawn once and kept in a target of its own, and each time the map is
// due it is copied back (the depth with it) and only what moves is drawn over it: the people, the thing, the doors, a passing car,
// anything that has moved lately. The picture is the same map as drawing it all.
//
// What stands still is checked every time the map is due: a thing that moves, turns up, goes, is shown or hidden, or changes its shape or
// its material, and the kept map is drawn again from scratch that time (a thing that has moved is drawn with the moving ones until it
// has held still a while). So is a change of the sun, its box or its map. Without WebGL 2 (no copying depth) it draws everything, as the
// library would.
import * as THREE from 'three';

export function createSunShadow({ renderer, scene, light }) {
  const sm = renderer.shadowMap, gl = renderer.getContext(), props = renderer.properties, state = renderer.state;
  const self = { enabled: typeof WebGL2RenderingContext !== 'undefined' && gl instanceof WebGL2RenderingContext, stats: { full: 0, kept: 0, moving: 0, still: 0 } };
  const reg = new Map();   // a caster: { m (its matrix last time), v (shape), mat, shown, moves }
  let kept = null, valid = false, seen = 0;
  const key = new Float64Array(16 * 3 + 3), keyNow = new Float64Array(key.length);
  let keyMap = null;

  // the casters as the library's shadow pass will find them: shown all the way up and casting; each one's state compared with last time
  const still = [], moving = [];
  const shapeOf = (o) => {
    const g = o.geometry; if (!g) return 0;
    const ver = (a) => (a ? (a.isInterleavedBufferAttribute ? a.data.version : a.version) || 0 : 0);   // (a model's attributes are interleaved: the version is its buffer's)
    let v = ver(g.attributes.position) + ver(g.index) * 7 + g.id * 131;
    if (o.isInstancedMesh) v += o.instanceMatrix.version * 4099 + o.count * 65537;
    return v;
  };
  // (what the depth pass reads of a material, not its version: the library bumps that twice a draw for every two-sided see-through one)
  const tex = (t, cut) => (t ? t.id * 131 + (cut ? t.version : 0) : 0);
  const matOne = (m) => {
    if (!m) return 0;
    const cut = m.alphaTest > 0 || m.alphaHash;
    return m.id * 8191 + tex(m.map, cut) * 17 + tex(m.alphaMap, cut) * 524287 + tex(m.displacementMap, true) * 65599 + (m.displacementScale || 0) * 7919 + (m.displacementBias || 0) * 3571
      + m.alphaTest * 1e6 + (m.alphaHash ? 3 : 0) + (m.visible ? 0 : 5) + (m.wireframe ? 11 : 0) + m.side * 13 + (m.shadowSide ?? 7) * 19 + (m.clippingPlanes ? m.clippingPlanes.length * 23 : 0) + (m.clipShadows ? 29 : 0);
  };
  const matOf = (o) => {
    let v = (o.customDepthMaterial ? matOne(o.customDepthMaterial) * 37 : 0);
    if (!Array.isArray(o.material)) return v + matOne(o.material);
    for (const m of o.material) v = v * 31 + matOne(m); return v;
  };
  // (a caster that has moved goes back to standing still once it has held still for CALM of the map's updates: the kept map is drawn
  // again with it then; skinned and morphing ones always move)
  const CALM = 40;
  function scan() {
    still.length = moving.length = 0; let changed = false; seen++;
    const walk = (o) => {
      if (!o.visible) return;
      if ((o.isMesh || o.isLine || o.isPoints) && o.castShadow && o.layers.test(light.shadow.camera.layers)) {
        let e = reg.get(o);
        const fresh = !e;
        if (fresh) { e = { m: new Float64Array(16), v: 0, mat: 0, always: !!(o.isSkinnedMesh || o.morphTargetInfluences || o.onBeforeShadow !== THREE.Object3D.prototype.onBeforeShadow), moves: false, calm: 0, seen: 0 }; e.moves = e.always; reg.set(o, e); }
        const a = o.matrixWorld.elements; let moved = false;
        for (let i = 0; i < 16 && !moved; i++) if (a[i] !== e.m[i]) moved = true;
        const v = shapeOf(o), mat = matOf(o);
        if (fresh) { if (!e.moves) changed = true; }
        else if (moved || v !== e.v) { e.calm = 0; if (!e.moves) { e.moves = true; changed = true; } }
        else if (mat !== e.mat && !e.moves) changed = true;   // (a material changed, as every one does with the graphics settings: drawn again, it has not moved)
        else if (e.moves && !e.always && ++e.calm >= CALM) { e.moves = false; changed = true; }
        if (!e.moves && e.seen !== seen - 1 && !fresh) changed = true;   // shown again
        e.m.set(a); e.v = v; e.mat = mat; e.seen = seen;
        (e.moves ? moving : still).push(o);
      }
      for (const c of o.children) walk(c);
    };
    walk(scene);
    for (const [o, e] of reg) if (e.seen !== seen) {   // hidden, or gone: the kept map is drawn again the first time it is missed
      if (!e.moves && e.seen === seen - 1) changed = true;
      if (!o.parent || seen - e.seen > 100) reg.delete(o);   // (gone, or not seen in a long while: forgotten, and new again if it comes back)
    }
    self.stats.moving = moving.length; self.stats.still = still.length;
    return changed;
  }
  function sameKey() {
    const s = light.shadow; let i = 0;
    for (const m of [light.matrixWorld, light.target.matrixWorld, s.camera.projectionMatrix]) for (let k = 0; k < 16; k++) keyNow[i++] = m.elements[k];
    keyNow[i++] = s.mapSize.x; keyNow[i++] = s.mapSize.y; keyNow[i++] = sm.type;
    let same = keyMap === s.map;
    for (let k = 0; k < key.length && same; k++) if (key[k] !== keyNow[k]) same = false;
    key.set(keyNow); keyMap = s.map;
    return same;
  }
  const blit = (from, to) => {
    const w = to.width, h = to.height;
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, props.get(from).__webglFramebuffer);
    state.bindFramebuffer(gl.DRAW_FRAMEBUFFER, props.get(to).__webglFramebuffer);
    gl.blitFramebuffer(0, 0, w, h, 0, 0, w, h, gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT, gl.NEAREST);
    state.bindFramebuffer(gl.READ_FRAMEBUFFER, null);
  };
  // draw the sun's map with only these casting (the others' castShadow off for the one pass), over what `clear` puts there
  function pass(render, ctx, args, only, clear) {
    const off = only === moving ? still : moving;
    for (const o of off) o.castShadow = false;
    const c = renderer.clear;
    if (clear) renderer.clear = clear;
    try { light.shadow.needsUpdate = true; sm.needsUpdate = true; render.call(ctx, [light], args[1], args[2]); } finally { renderer.clear = c; for (const o of off) o.castShadow = true; }
  }

  const render = sm.render;
  sm.render = function (lights, sc, cam) {
    const s = light.shadow;
    if (sc === scene && kept && (!sm.enabled || !light.castShadow || !s.map)) { kept.dispose(); kept = null; valid = false; }   // (shadows off: the kept map is let go)
    if (!self.enabled || sc !== scene || !sm.enabled || !(sm.autoUpdate || sm.needsUpdate) || sm.type === THREE.VSMShadowMap || !lights.includes(light) || !(s.autoUpdate || s.needsUpdate)) return render.call(this, lights, sc, cam);
    const others = lights.filter((l) => l !== light), was = sm.needsUpdate, target = renderer.getRenderTarget(), face = renderer.getActiveCubeFace(), level = renderer.getActiveMipmapLevel();
    if (others.length) { render.call(this, others, sc, cam); sm.needsUpdate = was; }
    const moved = scan(), same = sameKey();
    if (!valid || moved || !same || !s.map || !kept || kept.width !== s.map.width || kept.height !== s.map.height) {
      // what stands still, drawn and kept; then what moves over it
      pass(render, this, arguments, still, null);
      if (!kept || kept.width !== s.map.width || kept.height !== s.map.height) {
        if (kept) kept.dispose();
        kept = new THREE.WebGLRenderTarget(s.map.width, s.map.height, { minFilter: THREE.NearestFilter, magFilter: THREE.NearestFilter });
        renderer.setRenderTarget(kept);
      }
      blit(s.map, kept);
      valid = true; self.stats.full++;
      if (moving.length) pass(render, this, arguments, moving, () => {});
      keyMap = s.map;
    } else {
      pass(render, this, arguments, moving, () => blit(kept, s.map));
      self.stats.kept++;
    }
    s.needsUpdate = false; sm.needsUpdate = false;
    renderer.setRenderTarget(target, face, level);   // (the copies bound targets of their own: the draw goes back where it was)
  };
  self.invalidate = () => { valid = false; };
  return self;
}
