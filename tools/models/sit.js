// grandpa's seated pose, baked as a clip ('sit') into his model, because anims.glb only has standing clips.
// fitted to the vigil chair: seat top 0.485 m, back posts and rail with their front face 0.18 m behind the seat centre.
// the clip moves Bip01 too, so the model's origin stays at the chair's origin (on the floor under the seat centre, facing +z).
// the offsets are in model units, so the fit holds at one size only: the game must use setHeight(height) with it.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const wp = (o) => { o.updateWorldMatrix(true, false); return o.getWorldPosition(new THREE.Vector3()); };
const wq = (o) => { o.updateWorldMatrix(true, false); return o.getWorldQuaternion(new THREE.Quaternion()); };
function rotateWorld(b, q) {   // premultiply the bone's world rotation by q
  const p = wq(b.parent).invert(); b.quaternion.copy(p.multiply(q.clone().multiply(wq(b)))); b.updateMatrixWorld(true);
}
function aim(b, child, dir) {   // swing a bone so its child lies along a world direction
  const d = wp(child).sub(wp(b)).normalize(), ang = d.angleTo(dir); if (ang < 1e-6) return;
  const ax = new THREE.Vector3().crossVectors(d, dir); if (ax.lengthSq() < 1e-10) ax.set(1, 0, 0);
  rotateWorld(b, new THREE.Quaternion().setFromAxisAngle(ax.normalize(), ang));
}
function skinned(root, step = 1) {   // the skinned surface in world space
  const pts = []; root.updateMatrixWorld(true);
  root.traverse((o) => { if (!o.isSkinnedMesh) return; const p = o.geometry.attributes.position, v = new THREE.Vector3();
    for (let i = 0; i < p.count; i += step) { o.getVertexPosition(i, v); pts.push(v.clone().applyMatrix4(o.matrixWorld)); } });
  return pts;
}
function ik(B, side, T, pole) {   // two-bone arm: the wrist on T, the elbow toward the pole
  const up = B[side + '_UpperArm'], fo = B[side + '_Forearm'], hand = B[side + '_Hand'];
  const S = wp(up), l1 = S.distanceTo(wp(fo)), l2 = wp(fo).distanceTo(wp(hand));
  const D = T.clone().sub(S), d = Math.min(Math.max(D.length(), 0.05), (l1 + l2) * 0.995); D.normalize();
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  const P = pole.clone().addScaledVector(D, -pole.dot(D)).normalize();
  aim(up, fo, S.clone().addScaledVector(D, a).addScaledVector(P, h).sub(S).normalize());
  aim(fo, hand, S.clone().addScaledVector(D, d).sub(wp(fo)).normalize());
}

export function sitClip(g, { height = 1.70, seatTop = 0.485, backFront = -0.18, clear = 0.02, curl = 0.3, neck = 0.1, chin = 0.25, breath = 4.4 } = {}) {
  const B = {}, rest = new Map();
  g.traverse((o) => { if (o.isBone) { B[o.name.replace(/^Bip01_?/, '') || 'Root'] = o; rest.set(o, [o.position.clone(), o.quaternion.clone()]); } });
  const pos0 = g.position.clone(), scale0 = g.scale.clone();
  g.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(g), s = height / (box.max.y - box.min.y);   // the same measure Rig.setHeight uses
  g.scale.multiplyScalar(s); g.updateMatrixWorld(true);
  const info = { height, scale: +s.toFixed(6) };

  // an old man's back: rounded through the chest, the neck jutting forward, the head tipped back up so he looks only a little down
  // (Spine is left alone: the thighs hang from it in this skeleton)
  for (const [n, k] of [['Spine1', 0.5], ['Spine2', 0.5]]) rotateWorld(B[n], new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), curl * k));
  rotateWorld(B.Neck, new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), neck));
  rotateWorld(B.Head, new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -chin));

  const flat = { L: wq(B.L_Foot), R: wq(B.R_Foot) };
  const footFlat = (sd, toe) => {   // the foot as it stands (flat), then the toes down by toe radians
    const f = B[sd + '_Foot']; f.quaternion.copy(wq(f.parent).invert().multiply(flat[sd])); f.updateMatrixWorld(true);
    if (toe) rotateWorld(f, new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), toe));
  };
  const legs = (lift, shin) => {
    for (const k of ['L_Thigh', 'R_Thigh', 'L_Calf', 'R_Calf']) { B[k].quaternion.copy(rest.get(B[k])[1]); B[k].updateMatrixWorld(true); }
    for (const [sd, sx] of [['L', 1], ['R', -1]]) {
      aim(B[sd + '_Thigh'], B[sd + '_Calf'], V(0.1 * sx, lift, 1).normalize());
      aim(B[sd + '_Calf'], B[sd + '_Foot'], V(0.03 * sx, -1, shin).normalize());
      footFlat(sd, 0);
    }
  };
  // drop him onto the seat, clear of the backrest (and fwd further forward)
  const place = (fwd) => {
    g.position.set(0, 0, 0); g.updateMatrixWorld(true);
    const pel = wp(B.Pelvis), pts = skinned(g, 2);
    const L = ['L', 'R'].map((sd) => { const h = wp(B[sd + '_Thigh']), d = wp(B[sd + '_Calf']).sub(h); const len = d.length(); return { h, d: d.divideScalar(len), len }; });
    let minZ = Infinity; for (const p of pts) if (p.y > pel.y - 0.15 && p.y < pel.y + 0.6 && Math.abs(p.x) < 0.24) minZ = Math.min(minZ, p.z);
    const dz = backFront + clear - minZ + fwd;
    let butt = Infinity, thigh = Infinity, foot = Infinity;
    for (const p of pts) {
      if (p.y < pel.y - 0.3) { foot = Math.min(foot, p.y); continue; }
      if (p.y > pel.y + 0.02 || Math.abs(p.x) > 0.25) continue;
      const l = L[p.x > 0 ? 0 : 1], u = p.clone().sub(l.h).dot(l.d) / l.len;
      if (u < 0.15) butt = Math.min(butt, p.y); else if (u < 0.95 && p.z + dz < 0.23) thigh = Math.min(thigh, p.y);
    }
    // the seat of the trousers sinks 2 cm into the wood (hidden inside the 5 cm seat), the thighs 1 cm at the front edge
    const dy = Math.max(seatTop - 0.02 - butt, seatTop - 0.01 - thigh);
    g.position.set(0, dy, dz); g.updateMatrixWorld(true);
    return { dy, dz, foot: foot + dy };
  };
  // the seat is high for him: find the flattest thighs (down to about 17 degrees) that put his soles on the floor, sliding him
  // forward on the seat a centimetre at a time (4 at most) only when they cannot, as a short man perches. what is still left
  // is made up by the toes pointing down (the heels lift); and the shins swing forward if the soles would go into the floor
  let fit = null, best = null;
  for (let fwd = 0; fwd <= 0.04 + 1e-9 && !fit; fwd += 0.01) {
    for (let th = -0.05; th >= -0.3 - 1e-9; th -= 0.025) {
      legs(th, 0); const f = { ...place(fwd), lift: th, fwd };
      if (!best || f.foot < best.foot - 0.002) best = f;
      if (f.foot <= 0.003) { fit = f; break; }
    }
  }
  fit ||= best;
  let shin = 0; legs(fit.lift, 0); Object.assign(fit, place(fit.fwd));
  while (fit.foot < -0.002 && shin < 0.5) { shin += 0.01; legs(fit.lift, shin); Object.assign(fit, place(fit.fwd)); }
  const footMin = () => { let m = Infinity; for (const p of skinned(g, 2)) if (p.y < 0.25) m = Math.min(m, p.y); return m; };
  let toe = 0, fm = footMin();
  while (fm > 0.004 && toe < 0.4) { toe += 0.02; for (const sd of ['L', 'R']) footFlat(sd, toe); fm = footMin(); }
  Object.assign(info, { thigh: +fit.lift.toFixed(3), shin: +shin.toFixed(2), fwd: +fit.fwd.toFixed(2), dy: +fit.dy.toFixed(4), dz: +fit.dz.toFixed(4), toe: +toe.toFixed(2), footMin: +fm.toFixed(4) });

  // hands resting on the thighs, palms down, fingers loosely curled over the front
  const thighTop = (sd, u) => {
    const h = wp(B[sd + '_Thigh']), c = h.clone().lerp(wp(B[sd + '_Calf']), u); let top = -Infinity;
    for (const p of skinned(g, 1)) if (Math.abs(p.x - c.x) < 0.035 && Math.abs(p.z - c.z) < 0.035 && p.y > c.y && p.y < c.y + 0.2) top = Math.max(top, p.y);
    return V(c.x, top, c.z);
  };
  info.hands = {};
  for (const [sd, sx] of [['L', 1], ['R', -1]]) {
    const up = B[sd + '_UpperArm'], fo = B[sd + '_Forearm'], hand = B[sd + '_Hand'];
    const reach = wp(up).distanceTo(wp(fo)) + wp(fo).distanceTo(wp(hand));
    let u = 0.5, T;
    for (; u >= 0.1; u -= 0.05) { T = thighTop(sd, u).add(V(-0.012 * sx, 0.03, 0)); if (T.distanceTo(wp(up)) < reach * 0.9) break; }
    info.hands[sd] = +u.toFixed(2);
    const pole = V(0.4 * sx, -0.1, -1).normalize();   // elbows back and only a little out: his left side is near the hall wall
    ik(B, sd, T, pole); ik(B, sd, T, pole);
    const thighDir = wp(B[sd + '_Calf']).sub(wp(B[sd + '_Thigh'])).normalize();
    aim(hand, B[sd + '_Finger2'], thighDir.clone().add(V(0, -0.22, 0)).normalize());
    const fa = wp(B[sd + '_Finger2']).sub(wp(hand)).normalize();
    const lat = wp(B[sd + '_Finger4']).sub(wp(B[sd + '_Finger1'])); lat.addScaledVector(fa, -lat.dot(fa)).normalize();
    const want = new THREE.Vector3().crossVectors(V(0, 1, 0), fa).multiplyScalar(sx); want.addScaledVector(fa, -want.dot(fa)).normalize();
    rotateWorld(hand, new THREE.Quaternion().setFromAxisAngle(fa, Math.atan2(new THREE.Vector3().crossVectors(lat, want).dot(fa), lat.dot(want))));
    const fa2 = wp(B[sd + '_Finger2']).sub(wp(hand)).normalize(), ax = new THREE.Vector3().crossVectors(fa2, V(0, -1, 0)).normalize();
    for (const f of ['1', '2', '3', '4']) ['Finger' + f, 'Finger' + f + '1', 'Finger' + f + '2'].forEach((n, i) => rotateWorld(B[sd + '_' + n], new THREE.Quaternion().setFromAxisAngle(ax, [0.12, 0.18, 0.12][i])));
  }

  // the clip: every bone the pose moved, held still, plus a slow breath in the chest (the head and shoulders held level against it)
  // the seat offset moves from the group onto Bip01, so the model's origin can stay at the chair's
  const root = B.Root, seated = wp(root); g.position.copy(pos0); g.updateMatrixWorld(true);
  const rootPos = root.parent.worldToLocal(seated);
  const posed = [...rest.keys()].filter((b) => b !== root && rest.get(b)[1].angleTo(b.quaternion) > 1e-5);
  const pose = new Map(posed.map((b) => [b, b.quaternion.clone()]));
  const breathers = [B.Spine1, B.Spine2, B.Head, B.L_Clavicle, B.R_Clavicle], n = Math.round(breath * 30), times = [], vals = new Map(breathers.map((b) => [b, []]));
  for (let i = 0; i <= n; i++) {
    const t = (i / n) * breath, a = Math.sin((i / n) * Math.PI * 2) * 0.008; times.push(t);
    for (const b of breathers) { b.quaternion.copy(pose.get(b) || rest.get(b)[1]); } root.updateMatrixWorld(true);
    const hq = wq(B.Head), cq = [wq(B.L_Clavicle), wq(B.R_Clavicle)];
    rotateWorld(B.Spine1, new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -a)); rotateWorld(B.Spine2, new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), -a));
    for (const [b, q] of [[B.Head, hq], [B.L_Clavicle, cq[0]], [B.R_Clavicle, cq[1]]]) { b.quaternion.copy(wq(b.parent).invert().multiply(q)); b.updateMatrixWorld(true); }
    for (const b of breathers) vals.get(b).push(...b.quaternion.toArray());
  }
  const tracks = [new THREE.VectorKeyframeTrack(root.name + '.position', [0, breath], [...rootPos.toArray(), ...rootPos.toArray()])];
  for (const b of new Set([...posed, ...breathers])) {
    if (vals.has(b)) tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', times, vals.get(b)));
    else tracks.push(new THREE.QuaternionKeyframeTrack(b.name + '.quaternion', [0, breath], [...pose.get(b).toArray(), ...pose.get(b).toArray()]));
  }
  info.tracks = tracks.length;

  // back to the T-pose at the original size and place: the model itself must not change
  for (const [b, [p, q]] of rest) { b.position.copy(p); b.quaternion.copy(q); }
  g.position.copy(pos0); g.scale.copy(scale0); g.updateMatrixWorld(true);
  return { clip: new THREE.AnimationClip('sit', breath, tracks), info };
}
