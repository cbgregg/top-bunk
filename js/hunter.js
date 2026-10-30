// The thing that lives in the house. It spawns out of sight, shows itself, creeps toward you, hunts you through the house (opening doors on the way),
// loses you when you break line of sight, searches, and checks the places you might hide. States:
//   away    not in the world
//   sight   standing somewhere you can see it for a few seconds (then gone)
//   stalk   walks toward you, frozen while you look at it
//   hunt    runs at you
//   search  creeps around the last place it saw you, looking in hiding places
//   loom    stands over your hiding place while you hold your breath
//   leave   walks away and fades from the world
import * as THREE from 'three';
import { NODES, path as navPath, nearestNode, dist as navDist, edgeDoor, pathLength } from './nav.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;

export function createHunter(ctx) {
  const { E, W, sfx, P, F, camera } = ctx;
  const S = {
    state: 'away', path: [], pi: 0, node: 'hallE', speed: 0, level: 1, cool: 0,
    lastSeen: null, lostT: 0, replan: 0, doorWait: 0, doorName: null,
    sightT: 0, sightDur: 4, seenT: 0, sightOpts: {}, frozen: false, lookT: 0,
    searchList: [], searchWait: 0, searchT: 0, forcePod: null, heard: 0, checks: {},
    loomT: 0, loomDur: 5, loomPod: null, stepAcc: 0, hb: 0, leaveT: 0, startedAt: 0,
  };
  const tmp = new V3(), dirv = new V3();

  // ---- sight lines ----
  function los(ax, az, bx, bz) {
    for (const c of W.colliders) {
      if (!c.on || !(c.wall || c.door)) continue;
      let t0 = 0, t1 = 1;
      const dx = bx - ax, dz = bz - az;
      for (const [o, d, lo, hi] of [[ax, dx, c.minX, c.maxX], [az, dz, c.minZ, c.maxZ]]) {
        if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { t1 = -1; break; } continue; }
        let a = (lo - o) / d, b = (hi - o) / d; if (a > b) [a, b] = [b, a];
        t0 = Math.max(t0, a); t1 = Math.min(t1, b); if (t0 > t1) break;
      }
      if (t1 >= t0 && t1 > 0) return false;
    }
    return true;
  }
  const ep = () => E.root.position;
  const gap = () => Math.hypot(P.pos.x - ep().x, P.pos.z - ep().z);
  const sees = (maxD = 14) => !hidden() && gap() < maxD && los(ep().x, ep().z, P.pos.x, P.pos.z);
  const hidden = () => ctx.hidden();
  const playerNode = () => nearestNode(P.pos.x, P.pos.z, (k) => los(P.pos.x, P.pos.z, NODES[k][0], NODES[k][1])) || nearestNode(P.pos.x, P.pos.z);
  const doorClosed = (name) => W.doors[name] && W.doors[name].target === 0;
  // is the player looking toward a point (cos threshold) with nothing in between?
  function looking(x, z, cos = 0.8, y = 1.2) {
    camera.getWorldDirection(dirv);
    tmp.set(x - camera.position.x, y - camera.position.y, z - camera.position.z); const d = tmp.length(); if (d < 0.1) return true;
    return tmp.divideScalar(d).dot(dirv) > cos && los(camera.position.x, camera.position.z, x, z);
  }
  const inView = (x, z, cos = 0.55) => looking(x, z, cos);

  // ---- placing and moving ----
  function place(node) {
    const [x, z] = NODES[node]; E.root.position.set(x, 0, z); S.node = node; E.visible = true;
    E.lookTarget = camera.position; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0.3; E.smileScale = 1; E.speed = 1;
  }
  function planTo(node, from = null) {
    const start = from || S.node || nearestNode(ep().x, ep().z);
    const p = navPath(start, node, doorClosed); if (!p) return false;
    S.path = p; S.pi = p[0] === nearestNode(ep().x, ep().z) && p.length > 1 && Math.hypot(NODES[p[0]][0] - ep().x, NODES[p[0]][1] - ep().z) < 0.2 ? 1 : 0; return true;
  }
  // walk along S.path at `spd`; returns true on arrival
  function follow(dt, spd) {
    if (S.doorWait > 0) {   // opening a door in the way
      S.doorWait -= dt; E.mode = 'idle'; if (S.doorWait <= 0 && S.doorName) { W.setDoor(S.doorName, true); S.doorName = null; S.doorWait = 0.45; return false; }
      return false;
    }
    let remaining = spd * dt, moved = false;
    while (remaining > 1e-4 && S.pi < S.path.length) {
      const id = S.path[S.pi], [tx, tz] = NODES[id];
      if (S.pi > 0) {   // a closed door on the way into this node?
        const d = edgeDoor(S.path[S.pi - 1], id);
        if (d && doorClosed(d)) { S.doorName = d; S.doorWait = 1.1; E.faceTowards(tx, tz, 1); sfx.knock(ctx.panFor(tmp.set(W.doors[d].mid.x, 1.2, W.doors[d].mid.z)), 0.12); return false; }
      }
      const dx = tx - ep().x, dz = tz - ep().z, d = Math.hypot(dx, dz);
      if (S.pi < S.path.length - 1 && d < 0.32) { S.node = id; S.pi++; continue; }   // cut the corner: head for the next node before reaching this one
      if (d > 0.04) E.faceTowards(tx, tz, Math.min(1, dt * (spd > 2.6 ? 8 : 4.5)));
      if (d <= remaining) { ep().x = tx; ep().z = tz; remaining -= d; S.node = id; S.pi++; moved = true; }
      else { ep().x += dx / d * remaining; ep().z += dz / d * remaining; remaining = 0; moved = true; }
    }
    E.mode = !moved ? 'idle' : spd > 2.6 ? 'run' : 'walk'; E.speed = spd / 3;
    if (moved) {
      S.stepAcc += spd * dt;
      if (S.stepAcc > (E.mode === 'run' ? 1.05 : 0.85)) { S.stepAcc = 0; sfx.heavyStep(clamp(1.3 / (1 + gap() * 0.28), 0.06, 1), ctx.panFor(ep())); }
    }
    return S.pi >= S.path.length;
  }
  function setState(s) { S.state = s; S.startedAt = ctx.now(); }
  const huntSpeed = () => clamp(2.95 + S.level * 0.14, 3.0, 4.15);

  // ---- public actions ----
  function vanish(flicker = true) {
    if (S.state === 'away') return;
    E.visible = false; E.mode = 'idle'; E.lookTarget = null; E.lean = 0; E.tilt = 0;
    setState('away'); F.breathCheck = false; ctx.onVanish && ctx.onVanish(flicker);
    S.path = []; S.cool = Math.max(S.cool, 8);
  }
  // it is simply there, somewhere you can see (or soon will)
  function sight(node, opts = {}) {
    place(node); setState('sight');
    S.sightT = 0; S.sightDur = opts.dur ?? 4; S.seenT = 0; S.sightOpts = opts; E.tilt = opts.tilt ?? 0.4; S.turned = false; S.stung = false;
    if (opts.facing) { E.lookTarget = null; E.faceTowards(opts.facing[0], opts.facing[1], 1); }
    // the sting lands the instant it is in front of you, not when it appears somewhere behind a wall (see update); until then, a small wrongness
    if (opts.stab !== false && inView(ep().x, ep().z, 0.7) && gap() < 18) sting(); else sfx.creak(0.12, ctx.panFor(ep()));
    F.fear = Math.max(F.fear, 0.5);
  }
  function sting() {
    if (S.stung) return; S.stung = true;
    sfx.stab(); ctx.flicker && ctx.flicker(0.5); ctx.addShake && ctx.addShake(0.6); F.fear = Math.max(F.fear, 0.85);
  }
  // the jolt of a hunt: when it comes into view, not when it starts somewhere out of sight
  function huntJolt() {
    if (S.jolted) return; S.jolted = true;
    sfx.jolt(0.85); ctx.flicker && ctx.flicker(0.6); ctx.addShake && ctx.addShake(0.9);
  }
  function stalk(node) {
    place(node); setState('stalk'); S.frozen = false; S.lookT = 0; S.replan = 0;
    sfx.tension(0.04, 2); F.fear = Math.max(F.fear, 0.4);
  }
  function hunt(node = null) {
    if (S.state === 'away' || node) place(node || pickSpawn(8) || 'hallW');
    setState('hunt'); S.lostT = 0; S.lastSeen = { x: P.pos.x, z: P.pos.z }; S.replan = 0;
    E.tilt = 0.2; E.smileScale = 1.1; S.jolted = false;
    sfx.violins(0.7, 0.3); sfx.bed('music/chase', 0.55, 0.6); sfx.bed('music/night', 0, 1.5); sfx.drone(0.17, 0.5);
    F.fear = 1; F.chase = true;
    if (inView(ep().x, ep().z, 0.6) && sees()) huntJolt();
    ctx.onHunt && ctx.onHunt();
  }
  function startSearch(fromHunt = true) {
    setState('search'); S.searchT = 0; S.searchWait = 0; S.heard = 0; S.forcePod = null;
    const ls = S.lastSeen ? nearestNode(S.lastSeen.x, S.lastSeen.z) : S.node;
    S.searchList = [ls]; const near = Object.keys(NODES).filter((k) => navDist(k, ls) < 6 && k !== ls);
    for (let i = 0; i < 2 + (S.level > 4 ? 1 : 0) && near.length; i++) S.searchList.push(near.splice((Math.random() * near.length) | 0, 1)[0]);
    F.chase = false; sfx.bed('music/chase', 0, 1.5); sfx.bed('music/night', 0.35, 2);
    planTo(S.searchList[0]); E.tilt = 0.45;
  }
  function pickSpawn(minPath = 7, prefer = null) {
    const pn = playerNode(), c = [];
    for (const k of Object.keys(NODES)) {
      if (los(P.pos.x, P.pos.z, NODES[k][0], NODES[k][1]) && Math.hypot(NODES[k][0] - P.pos.x, NODES[k][1] - P.pos.z) < 16) continue;   // never pop into view
      const p = navPath(pn, k, doorClosed); if (!p || pathLength(p) < minPath) continue;
      c.push([k, 1 + (prefer && prefer.includes(k) ? 3 : 0)]);
    }
    if (!c.length) return null;
    let t = 0; for (const [, w] of c) t += w; let x = Math.random() * t; for (const [k, w] of c) { if ((x -= w) <= 0) return k; }
    return c[0][0];
  }
  // it came to the place you are hiding
  function loom(podId) {
    S.loomPod = podId; setState('loom'); S.loomT = 0;
    S.loomDur = clamp(4.4 + S.level * 0.3, 4.4, 6.8);
    const pod = ctx.pods[podId]; place(pod.node); E.mode = 'idle';
    E.root.position.x = NODES[pod.node][0]; E.root.position.z = NODES[pod.node][1]; E.faceTowards(pod.look[0], pod.look[1], 1);
    sfx.violins(1, 0.4); sfx.tension(0.05, 1); sfx.whisper(ctx.panFor(ep()), 0.16);
    F.breathCheck = true; F.grace = 1.3; ctx.hint && ctx.hint();
  }
  function notifyPod(podId) {   // you just got into a hiding place: did it see you do it?
    if ((S.state === 'hunt' || S.state === 'stalk') && gap() < 9 && los(ep().x, ep().z, P.pos.x, P.pos.z)) {
      startSearch(); S.forcePod = podId; planTo(ctx.pods[podId].node);
    }
  }
  // it arrives already looking for you (you are hiding when it begins)
  function searchFrom(node) {
    place(node); S.lastSeen = { x: P.pos.x, z: P.pos.z };
    sfx.violins(0.5, 1.5); F.fear = Math.max(F.fear, 0.7);
    startSearch();
  }
  function dismiss() { if (S.state !== 'away') vanish(false); F.chase = false; F.breathCheck = false; S.cool = 30; }

  // ---- per frame ----
  function update(dt) {
    if (S.cool > 0) S.cool -= dt;
    if (S.state === 'away') return;
    const g = gap(), podId = hidden();
    // heartbeat, fear and light stutter grow with closeness
    if (E.visible && S.state !== 'sight') {
      F.fear = Math.max(F.fear, clamp(1 - g / 11, 0, 0.95));
      S.hb -= dt; if (S.hb <= 0) { sfx.heartbeat(clamp(0.3 + (1 - g / 12) * 0.5, 0.3, 0.8)); S.hb = clamp(0.28 + g * 0.05, 0.3, 0.9); }
    }
    switch (S.state) {
      case 'sight': {
        S.sightT += dt;
        if (S.sightOpts.facing && !S.turned) {   // it has its back to you, watching something else, until you come close
          if (S.sightOpts.stab !== false && inView(ep().x, ep().z, 0.7) && g < 18) sting();
          if (g < (S.sightOpts.turnDist ?? 3.4) && !podId) { S.turned = true; E.lookTarget = camera.position; sfx.giggle(ctx.panFor(ep())); ctx.onTurn && ctx.onTurn(); if (S.sightOpts.chase) { hunt(); break; } }
          else if (S.sightT > S.sightDur) { vanish(); break; }
          else break;
        }
        E.faceTowards(P.pos.x, P.pos.z, Math.min(1, dt * 4));
        const seen = inView(ep().x, ep().z, 0.7) && g < 18;
        if (seen) { if (S.sightOpts.stab !== false) sting(); S.seenT += dt; }
        if (S.sightOpts.chase && g < (S.sightOpts.chaseDist ?? 4)) { hunt(); break; }
        if ((S.sightOpts.vanishOnLook !== false && S.seenT > (S.sightOpts.lookTime ?? 0.9)) || S.sightT > S.sightDur) {
          if (S.sightOpts.then === 'hunt') hunt(); else vanish();
        }
        break;
      }
      case 'stalk': {
        const watched = inView(ep().x, ep().z, 0.72) && g < 16 && !podId;
        S.frozen = watched && (S.level < 6 || g > 3.2);
        if (S.frozen) { E.mode = 'idle'; E.faceTowards(P.pos.x, P.pos.z, Math.min(1, dt * 6)); S.lookT += dt; if (S.lookT > 7) vanish(); break; }
        S.replan -= dt; if (S.replan <= 0) { S.replan = 0.7; planTo(playerNode()); }
        const arrived = follow(dt, 0.95 + S.level * 0.05);
        if (!podId && g < 4.2 && sees()) { if (S.level >= 3 || S.sightOpts.chase) hunt(); else vanish(); }
        else if (podId && g < 3.5) { startSearch(); S.forcePod = podId; planTo(ctx.pods[podId].node); }
        else if (arrived) vanish();
        break;
      }
      case 'hunt': {
        if (!S.jolted && inView(ep().x, ep().z, 0.6) && sees()) huntJolt();
        if (sees()) { S.lastSeen = { x: P.pos.x, z: P.pos.z }; S.lostT = 0; } else S.lostT += dt;
        S.replan -= dt;
        if (S.replan <= 0) { S.replan = 0.35; planTo(S.lostT < 0.6 ? playerNode() : nearestNode(S.lastSeen.x, S.lastSeen.z)); }
        const arrived = follow(dt, huntSpeed());
        if (sees(2.0) && g < 0.95 && !podId) ctx.caught();
        else if (S.lostT > (podId ? 1.2 : 4.5) || (arrived && S.lostT > 0.8)) startSearch();
        break;
      }
      case 'search': {
        S.searchT += dt;
        // it can hear you if you are close and not holding your breath
        if (podId && g < 3.6) { if (!ctx.holding()) S.heard += dt; else S.heard = Math.max(0, S.heard - dt * 0.5); }
        if (!podId && sees(5.5)) { hunt(); break; }
        if (S.searchWait > 0) {   // looking around where it stands
          S.searchWait -= dt; E.mode = 'idle'; E.tilt = 0.45 + Math.sin(S.searchT * 1.7) * 0.4;
          E.faceTowards(ep().x + Math.sin(S.searchT * 0.8) * 3, ep().z + Math.cos(S.searchT * 0.6) * 3, Math.min(1, dt * 2));
          if (S.searchWait <= 0) { S.searchList.shift(); if (!S.searchList.length) { endSearch(); break; } planTo(S.searchList[0]); }
          break;
        }
        const arrived = follow(dt, 1.55 + S.level * 0.05);
        if (arrived) {
          const here = S.searchList[0];
          // is this the door to the place you are hiding?
          if (podId && ctx.pods[podId].node === here) {
            const chance = clamp(0.3 + S.level * 0.07 + (S.checks[podId] || 0) * 0.25 + S.heard * 0.35, 0.3, 0.97);
            if (S.forcePod === podId || S.heard > 1.4 || Math.random() < chance) { S.checks[podId] = (S.checks[podId] || 0) + 1; loom(podId); break; }
          }
          S.searchWait = 1.6 + Math.random() * 1.6;
        }
        if (S.searchT > 26) endSearch();
        // sometimes it walks over to check the place you are hiding even though it never saw you go in
        if (podId && !S.searchList.includes(ctx.pods[podId].node) && Math.random() < dt * 0.05 * (1 + S.level * 0.2) && navDist(S.node, ctx.pods[podId].node) < 9) { S.searchList.splice(1, 0, ctx.pods[podId].node); }
        break;
      }
      case 'loom': {
        S.loomT += dt; E.tilt = -0.4 + Math.sin(S.loomT * 2.2) * 0.7; E.lean = Math.min(0.35, S.loomT * 0.2); E.smileScale = 1 + Math.min(0.35, S.loomT * 0.08);
        E.faceTowards(ctx.pods[S.loomPod].look[0], ctx.pods[S.loomPod].look[1], Math.min(1, dt * 6));
        F.fear = 1;
        if (S.loomT > 2.2 && !S.giggled) { S.giggled = true; sfx.giggle(ctx.panFor(ep())); }
        if (S.loomT > S.loomDur) {
          F.breathCheck = false; S.giggled = false; E.lean = 0;
          sfx.violins(0, 0.05); sfx.ceilingThump(); ctx.survived && ctx.survived();
          setState('leave'); S.leaveT = 0; E.smileScale = 1;
          const far = pickSpawn(9) || 'hallW'; planTo(far);
        }
        break;
      }
      case 'leave': {
        S.leaveT += dt; E.tilt = 0.2;
        const arrived = follow(dt, 1.4);
        if (arrived || S.leaveT > 14 || (S.leaveT > 3 && !los(ep().x, ep().z, P.pos.x, P.pos.z) && g > 5)) vanish();
        break;
      }
    }
  }
  function endSearch() {   // gave up: walks off
    setState('leave'); S.leaveT = 0; sfx.bed('music/chase', 0, 2); sfx.violins(0, 2); sfx.drone(0.085, 3);
    const far = pickSpawn(9) || 'hallW'; planTo(far);
  }

  return {
    S, update, sight, stalk, hunt, vanish, dismiss, notifyPod, loom, pickSpawn, los, looking, playerNode, startSearch, searchFrom, place,
    get state() { return S.state; }, get busy() { return S.state !== 'away'; }, get cool() { return S.cool; },
    setLevel(n) { S.level = n; }, reset() { vanish(false); S.cool = 0; S.checks = {}; F.chase = false; },
    gap, sees,
  };
}
