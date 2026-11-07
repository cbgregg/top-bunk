// Nights two to ten: you are in your bunk at night with the whole house to explore, a clock that runs toward dawn, a seeded plan of what happens,
// something hunting you through the house, and places to hide.
import * as THREE from 'three';
import { createHunter } from './hunter.js';
import { createNightmares } from './nightmares.js';
import { createDirector, makePlan, PLAN_VERSION, PROOF_FROM, proofSources, TYPE_NAMES } from './director.js';
import { NODES, nearestNode } from './nav.js';
import { pick } from './rng.js';
import { achievements } from './achievements.js';
import { createGaze } from './gaze.js';
import { createWindowScares } from './windowscares.js';
import { makePerson } from './people.js';
import * as events from './events.js';
import * as log from './log.js';
import { hooks } from './hooks.js';

const DAWN = 360;   // minutes after midnight

export function createNights(env) {
  const { P, F, W, E, sfx, UI, camera, mom, dad, L } = env;
  const { clamp, lerp, lerpAngle, tween, wait, waitFor, later } = env;
  const V3 = THREE.Vector3, tmp = new V3();
  let rnd = Math.random, tok = 0;
  const alive = (t) => t === tok && F.live && !F.dead;

  // ---------- the places you can hide ----------
  const PODS = {
    closet_kid: { label: 'Hide in the closet', stand: [8.14, 1.73], cam: [7.99, 1.05, 0.68], yaw: Math.PI, overlay: 'louvers', node: 'kidCloset', look: [7.99, 0.86], front: [7.99, 1.0, 1.15] },
    closet_spare: { label: "Hide in the spare room's closet", stand: [10.46, -3.16], cam: [10.46, 1.05, -4.07], yaw: Math.PI, overlay: 'louvers', node: 'sClos', look: [10.46, -3.94], front: [10.46, 1.0, -3.49] },
    closet_parents: { label: "Hide in Mom and Dad's closet", stand: [-3.95, -2.32], cam: [-3.13, 1.05, -2.32], yaw: Math.PI / 2, overlay: 'louvers', node: 'pClos', look: [-4.5, -2.32], front: [-3.75, 1.0, -2.32] },
    closet_room2: { label: 'Hide in the closet', stand: [6.76, -2.26], cam: [6.76, 1.05, -1.57], yaw: 0, overlay: 'louvers', node: 'r2Closet', look: [6.76, -1.64], front: [6.76, 1.0, -1.9] },
    tub: { label: 'Hide behind the shower curtain', stand: [6.11, 3.27], cam: [5.74, 0.85, 4.13], yaw: 0, overlay: 'curtain', node: 'bathTub', look: [5.74, 4.11], front: [5.92, 1.0, 3.49] },
    bunk: { node: 'kidBunk', look: [8.28, 4.0] },
  };
  const hidden = () => (P.mode === 'hide' ? (P.pod || 'bunk') : null);
  for (const [id, pod] of Object.entries(PODS)) {
    if (id === 'bunk') continue;
    env.addI({ p: new V3(...pod.front), r: 1.55, label: pod.label, when: () => F.live && P.mode === 'walk' && !P.carrying && !F.cutscene && hunter.state !== 'loom', act: () => enterPod(id) });
  }
  async function enterPod(id) {
    const pod = PODS[id]; if (F.cutscene) return;
    F.cutscene = true; P.mode = 'cine'; P.cam.copy(camera.position);
    const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch, to = new V3(...pod.cam);
    sfx.creak(0.18, 0, 0); sfx.click();
    await tween(0.75, (k) => { P.cam.lerpVectors(from, to, k); P.yaw = lerpAngle(y0, pod.yaw, k); P.pitch = lerp(p0, 0, k); });
    P.pos.set(to.x, 0, to.z); P.pod = id; P.podYaw = pod.yaw;
    F.cutscene = false; P.mode = 'hide'; hiddenAt = env.time(); env.enteredHide(); UI.pod(pod.overlay); if (id === 'tub') W.curtainSee(true);
    sfx.whoosh(0);
    hunter.notifyPod(id);
  }
  async function exitHide() {
    if (F.cutscene) return;
    const id = P.pod;
    if (!id) {   // under the covers of your bunk
      UI.blanket(false); P.mode = 'bunk'; sfx.whoosh(0); return;
    }
    const pod = PODS[id]; F.cutscene = true; P.mode = 'cine'; P.cam.copy(camera.position);
    const from = P.cam.clone(), y0 = P.yaw, to = new V3(pod.stand[0], env.EYE, pod.stand[1]);
    UI.pod(null); if (id === 'tub') W.curtainSee(false);
    sfx.creak(0.18, 0, 0);
    await tween(0.6, (k) => { P.cam.lerpVectors(from, to, k); });
    P.pos.set(to.x, 0, to.z); P.vel.set(0, 0, 0); P.pod = null; P.mode = 'walk'; F.cutscene = false;
  }
  // you can always come out unless it is standing over you (loom), or it is searching right beside where you hide; stalking or far off never holds you in
  let hiddenAt = 0;
  const canComeOut = () => {
    if (!hunter.busy) return true;
    if (hunter.state === 'loom') return false;
    if (hunter.state === 'search' || hunter.state === 'hunt') return hunter.gap() > 7 || env.time() - hiddenAt > 25;
    return true;
  };

  // ---------- the thing ----------
  const hunter = createHunter({
    E, W, sfx, P, F, camera, pods: PODS, hidden, holding: env.holding, caught: env.caught, panFor: env.panFor, now: env.time, addShake: env.addShake,
    flicker: (s) => D.flicker(s),
    onVanish: () => { UI.hint(null); },
    onHunt: () => { UI.hint(`Hold <b>${L('sprint')}</b> to run. Break its line of sight. Hide.`, 5); },
    onTurn: () => { F.fear = 1; env.addShake(0.5); },
    survived: () => { UI.hint(null); F.fear = 0.3; env.addShake(0.2); },
    hint: () => { UI.hint(`Hold <b>${L('breath')}</b> to hold your breath (tap it once to keep holding)`, 8); },
    lit: (x, z, y) => (env.lights ? env.lights.levelAt(x, z, y) : 0),
    onEdge: (t, x, z) => lightEdge(t, x, z),
  });
  // it waits at the edge of a lit room while you watch it. The first time, the kid works out why; after a few seconds the bulb browns out
  // and dies (lights.js flickers it as it stands near), and then it comes in
  let edgeKill = 0;
  function lightEdge(t, x, z) {
    if (t < 0.1) edgeKill = (F.night >= 6 ? 2.5 : 3.6) + rnd() * 3;
    if (t > 1.2 && !(env.RUN.rules && env.RUN.rules.lights)) UI.hint("It won't come into the light while you're looking at it.", 5);
    if (edgeKill && t > edgeKill) { const room = env.roomAt(x, z); env.lights.kill(room === 'dining' ? 'kitchen' : room); edgeKill = 0; }
  }
  // what the house's own use of the lights needs to know (lights.js house())
  const lightCtx = () => ({
    n: F.night || 1, quiet: !F.live || F.dead || F.script || F.cutscene || !F.plan || ['poltergeist', 'vigil', 'car'].includes(F.plan.type),
    calm: D.calm(), hunting: hunter.busy,
    looking: (x, z, cos) => hunter.looking(x, z, cos), los: (ax, az, bx, bz) => hunter.los(ax, az, bx, bz),
    revealCool: () => D.revealCool() || events.RES.isHeld('E'), revealed: () => revealed(),
    show: (x, z) => { E.root.position.set(x, 0, z); E.visible = true; E.mode = 'idle'; E.lean = 0; E.reach = 0; E.tilt = 0.25; E.lookTarget = camera.position; E.faceTowards(P.pos.x, P.pos.z, 1); },
    hide: () => { if (!hunter.busy) { E.visible = false; E.lookTarget = null; } },
    sting: () => { sfx.pianoSlam(1); env.addShake(0.5); },
    fear: (v) => { F.fear = Math.max(F.fear, v); },
    near: hunter.busy && E.visible && ['hunt', 'search', 'stalk', 'leave'].includes(hunter.state) ? E.root.position : null,
  });
  if (env.lights) env.lights.onFlip = (name, on, by) => { gaze.noteFlip(name, on, by); env.lights.flipped(name, on, by, F.live ? lightCtx() : null); };

  // ---------- helpers every event can use (see director.js and js/events.js) ----------
  // a wall or a shut door between two points on the plan, and whether a spot is inside something solid at the player's height
  const blocked = (ax, az, bx, bz) => W.colliders.some((c) => {
    if (!(c.wall || (c.door && c.on))) return false;
    let t0 = 0, t1 = 1; const dx = bx - ax, dz = bz - az;
    for (const [p0, d, lo, hi] of [[ax, dx, c.minX, c.maxX], [az, dz, c.minZ, c.maxZ]]) {
      if (Math.abs(d) < 1e-6) { if (p0 < lo || p0 > hi) return false; continue; }
      let u = (lo - p0) / d, v = (hi - p0) / d; if (u > v) [u, v] = [v, u]; t0 = Math.max(t0, u); t1 = Math.min(t1, v); if (t0 > t1) return false;
    }
    return true;
  });
  const solidAt = (x, z) => W.colliders.some((c) => c.on !== false && !c.dressing && x > c.minX - 0.25 && x < c.maxX + 0.25 && z > c.minZ - 0.25 && z < c.maxZ + 0.25 && (c.minY === undefined || (P.pos.y + 1 >= c.minY && P.pos.y + 1 <= c.maxY)));
  // the nearest point of the nearest wall at the player's height: where a creak or a knock in the wall belongs
  const nearestWall = () => {
    const c = W.colliders.filter((q) => q.wall && (q.minY === undefined || (P.pos.y + 1 >= q.minY && P.pos.y + 1 <= q.maxY)))
      .map((q) => { const x = Math.max(q.minX, Math.min(q.maxX, P.pos.x)), z = Math.max(q.minZ, Math.min(q.maxZ, P.pos.z)); return { x, z, d: Math.hypot(x - P.pos.x, z - P.pos.z) }; })
      .sort((a, b) => a.d - b.d)[0];
    return c ? { x: c.x, y: P.pos.y + 1.1, z: c.z } : { x: P.pos.x + 2, y: P.pos.y + 1.1, z: P.pos.z };
  };
  const D = {
    r: () => rnd(), P, F, W, E, sfx, UI, camera, hunter,
    now: env.time, wait, waitFor, later, say: env.say,
    shake: (v) => env.addShake(v),
    node: (id) => ({ x: NODES[id][0], z: NODES[id][1] }),
    playerRoom: () => env.roomAt(P.pos.x, P.pos.z),
    onBunk: () => P.mode === 'bunk' || (P.mode === 'hide' && !P.pod),
    pan: (x, z, y = 1.2) => env.panFor(tmp.set(x, y, z)),
    // every sound has a place: the nearest wall, just behind the head, the ceiling over the room, the nearest shut door, the nearest tap
    wallPan: () => { const w = nearestWall(); return D.pan(w.x, w.z, w.y); },
    behindPan: () => { camera.getWorldDirection(tmp); const l = Math.hypot(tmp.x, tmp.z) || 1; return env.panFor(tmp.set(camera.position.x - tmp.x / l * 0.6, camera.position.y, camera.position.z - tmp.z / l * 0.6)); },
    ceilingPan: () => D.pan(P.pos.x, P.pos.z, P.pos.y + 2.6),
    doorPan: () => { let best = null, bd = 99; for (const k in W.doors) { const d = W.doors[k], dd = Math.hypot(d.mid.x - P.pos.x, d.mid.z - P.pos.z); if (dd > 1.5 && dd < bd) { bd = dd; best = d; } } return best ? D.pan(best.mid.x, best.mid.z) : D.wallPan(); },
    tapPan: () => (Math.hypot(P.pos.x - 6.42, P.pos.z - 1.64) < Math.hypot(P.pos.x - 2.54, P.pos.z - 4.33) ? D.pan(6.42, 1.64, 1.0) : D.pan(2.54, 4.33, 1.0)),
    nearestWall, blocked, solidAt,
    dist: (v) => Math.hypot(P.pos.x - v.x, P.pos.z - v.z),
    flicker(sec = 1) { F.flicker = true; later(sec, () => { if (!F.dead) { F.flicker = false; env.nlMult(1, false); } }); sfx.click(); },
    killNightLight(sec = 40) {
      const near = W.nightLights.filter((n) => !n.dead && Math.hypot(n.pos.x - P.pos.x, n.pos.z - P.pos.z) > 2.5).sort((a, b) => Math.hypot(a.pos.x - P.pos.x, a.pos.z - P.pos.z) - Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z))[0];
      if (!near) return; near.dead = true; sfx.click(); later(sec, () => { near.dead = false; });
    },
    glimpse() {
      const c = visibleNodes(6, 16, 'front'); if (!c.length) return;
      hunter.sight(pick(rnd, c), { dur: 0.9, stab: false, vanishOnLook: false, tilt: 0.15 }); sfx.whisper(0, 0.09); F.fear = Math.max(F.fear, 0.45);
    },
    mirror(kind) {
      const m = new V3(6.59, 1.5, 1.64); if (Math.hypot(P.pos.x - m.x, P.pos.z - m.z) > 2.8) return;
      W.mirrorFx.show(kind); if (kind === 'figure') { sfx.stab(); env.addShake(0.6); F.fear = 1; } else sfx.whisper(0.5, 0.12);
      later(kind === 'figure' ? 0.7 : 3.5, () => W.mirrorFx.hide());
    },
    tvBlip() { W.tvFx.set(true); sfx.staticBurst(D.pan(4.22, -3.04), 2.2); later(2.2, () => { if (!tvHeld) W.tvFx.set(false); }); },
    clockGlitch() { F.clockGlitch = env.time() + 7; },
    // the grandfather clock struck, heard from wherever you are
    chime(n) { const d = Math.hypot(P.pos.x - W.clock.pos.x, P.pos.z - W.clock.pos.z); sfx.chime(n, 0.32 / (1 + d * d * 0.09), D.pan(W.clock.pos.x, W.clock.pos.z)); },
    drawingChange() { F.drawingLevel = (F.drawingLevel || 0) + 1; sfx.whisper(D.pan(7.63, 0.3), 0.1); },
    // Mom and Dad awake behind their door, in their own voices
    mutter() {
      if (Math.hypot(P.pos.x + 5.0, P.pos.z - 0.75) > 12) return;
      const [a, b] = pick(rnd, [['dad/talk_a', 'mom/talk_a'], ['mom/talk_b', 'dad/talk_b'], ['dad/talk_c', 'mom/talk_c'], ['dad/mutter_a', 'mom/mutter_a'], ['mom/mutter_b', 'dad/mutter_b']]);
      const d = env.say(a, { muffle: true }); later((d || 3) + 0.9, () => { if (F.live) env.say(b, { muffle: true }); });
    },
    lurk() { sfx.lurk(D.behindPan(), 0.25 + rnd() * 0.6, 2 + rnd() * 2.5); F.fear = Math.max(F.fear, 0.5); },
    phoneTalk() { env.say('dad/phone_a', { muffle: true }); F.fear = Math.max(F.fear, 0.6); },
    nightmare(kind) { F.nmDone = true; return nm[kind](tok).catch((e) => console.warn('nightmare failed', kind, e)); },
    encounter(kind, plan) { return encounter(kind, plan); },
    // the night engine's gates for the director's budget (js/events.js)
    engineHas: (id) => { const d = events.get(id), n = F.night || 1; return !!d && (!d.minN || n >= d.minN) && (!d.maxN || n <= d.maxN); }, mayFire: (tier, reveal) => events.mayFire(tier, { reveal }), firedLegacy: (id, tier) => events.noteLegacy(id, tier),
    mayEncounter: () => events.mayEncounter(), notedEncounter: (kind) => events.noteEncounter(kind),
    events, log, RES: events.RES, NIGHT: events.NIGHT, finish: (id, opts) => events.finish(id, opts), get N1() { return N1; },
    holding: () => env.holding(), hallLit: () => !!(env.lights && env.lights.isOn('hall')),
    // nothing else going on: it is not out, the night's scene is not asking anything of you (F.objective, set by UI.objective), the phone and the TV are quiet
    calm: () => !hunter.busy && hunter.cool <= 0 && !F.objective && !W.phone.ringing && !W.tvFx.on,
    // in your room, or somewhere with a clear view of its window (the end wall, past the foot of the bunk); not under the covers or in a closet
    seesKidWindow: () => P.mode !== 'hide' && (env.roomAt(P.pos.x, P.pos.z) === 'bed' || (Math.hypot(P.pos.x - 11.06, P.pos.z - 3.83) < 9 && hunter.los(P.pos.x, P.pos.z, 11.06, 3.83))),
    carPass: () => { env.carPass(); if (ws) ws.carFlash(); }, faceAtWindow: () => env.faceAtWindow(),
    blackout(on) { F.blackout = on; env.nlMult(on ? 0 : 1, false); },
    startHunt, visibleNodes, objective: (t) => UI.objective(t),
    fired: (id) => proofFire(id),
    dropped: () => { if (F.plan && F.plan.n === pr.n) { pr.kinds = proofKinds(F.plan); proofLine(); } },
  };
  let tvHeld = false;
  const nm = createNightmares({ ...env, P, F, W, E, sfx, UI, camera, hunter, D, wait, tween, lerp, alive, proofFire: (id) => proofFire(id) });
  D.holdTv = (v) => { tvHeld = v; };

  // ---------- the blind spot: things put where you just were looking, shown by your own turn, gone when you look away ----------
  const gaze = createGaze({ camera, P, los: hunter.los, roomAt: env.roomAt, colliders: W.colliders, F, W });
  D.gaze = gaze;
  let LINES = {}; if (typeof fetch === 'function') fetch('assets/audio/lines.json').then((r) => r.json()).then((j) => { LINES = j; }).catch(() => {});
  const sub = (id, sec) => { const l = LINES[id]; if (l) UI.subtitle(l.html, sec); };
  // a voice somewhere in the house: placed, quieter with distance, through the walls when there are walls in the way, with its words
  function voiceAt(id, x, z, gain = 1.3) {
    const d = Math.hypot(P.pos.x - x, P.pos.z - z), seen = hunter.los(P.pos.x, P.pos.z, x, z);
    const dur = sfx.play('vo/' + id, { gain: gain / (1 + d * 0.1), pan: D.pan(x, z), wet: 0.4, muffle: !seen }) || 2.2;
    sub(id, Math.max(2.4, dur + 0.6)); return dur;
  }
  // doubles of Mom and Dad for the things that look like them (the real ones stay asleep in their bed); built the first time they are needed
  const doubles = {};
  function double(who) {
    if (!doubles[who]) {
      const p = makePerson(who === 'mom' ? { model: 'mom', height: 1.66 } : { model: 'dad', height: 1.84 });
      p.group.visible = false; env.scene.add(p.group); p.setNight(true); p.busy = true; doubles[who] = p;
    }
    return doubles[who];
  }
  const standDouble = (p, x, z, yaw) => { p.pose = null; p.lookAt = null; p.group.rotation.order = 'XYZ'; p.group.rotation.set(0, yaw, 0); p.group.position.set(x, 0, z); p.group.visible = true; if (p.rig) p.rig.play('idle', { fade: 0, speed: 0.4 }); };
  // the stage: one scare at a time, put where you are not looking. The night engine (js/events.js) decides when one is staged, through
  // the bridge registered below (registerStageBridge); the stage itself only runs the scare and takes it down
  const ST = { on: null, lastReveal: -99, cancel: [], it: null }; let ws = null;
  const freeE = () => !E.visible && !hunter.busy && hunter.cool <= 0 && !events.RES.isHeld('E', 'stage');
  const hideE = () => { E.visible = false; E.mode = 'idle'; E.leanSide = 0; E.lean = 0; E.snap = 0; E.lookTarget = null; E.root.scale.setScalar(1); E.standUp(); };
  function endStage() {
    for (const c of ST.cancel) c(); ST.cancel = [];
    if (ST.it) { env.removeI(ST.it); ST.it = null; }
    const st = ST.on; ST.on = null; if (st && st.end) st.end();
    // the scare took itself down: if its own look test had found it (st.seen; the street light's st.out) that look was its reveal, and
    // either way the engine's table lets it go
    if (st && st.kind) { const id = 'stage:' + st.kind; if (st.seen || st.out) events.noteReveal(id, STAGE_TIER[st.kind] || 'wrong'); events.finish(id, { undo: false }); }
    sfx.unhush();
  }
  const STAGE_TIER = { crumple: 'presence', stand: 'presence', peek: 'presence', mom: 'presence', reflect: 'presence', yard: 'presence', glass: 'presence', tap: 'whisper', curtains: 'whisper' };
  const revealed = () => { ST.lastReveal = env.time(); const k = ST.on && ST.on.kind; events.noteReveal(k ? 'stage:' + k : null, (k && STAGE_TIER[k]) || 'wrong'); };
  // one of these is tried whenever the house has been quiet long enough; each says no unless you are placed right for it
  const SCARES = {
    // on the floor where you were just looking: folded up on its knees, collapsed over them, its head bent too far, staring at you and muttering
    crumple: { minN: 3, w: 3, run() {
      if (!freeE() || P.mode !== 'walk') return false;
      const room = env.roomAt(P.pos.x, P.pos.z); if (!room || room === 'bath') return false;
      const p = gaze.behind(1.8, 3.4); if (!p) return false;
      E.root.scale.setScalar(1); E.root.position.set(p.x, P.pos.y, p.z); E.faceTowards(P.pos.x, P.pos.z, 1); E.mode = 'crumple'; E.side = rnd() < 0.5 ? -1 : 1; E.snap = 0;
      E.lookTarget = camera.position; E.visible = true; sfx.holdHush();
      if (sfx.libLoad) { sfx.libLoad('bone_crack'); sfx.libLoad('crawl'); }   // ready before the flash
      const st = { kind: 'crumple', p, t0: env.time(), mum: 0, end: () => { if (!st.caught) hideE(); } }; ST.on = st;
      ST.cancel.push(gaze.whenLookAt(p, () => {
        st.seen = env.time(); revealed(); sfx.unhush(); sfx.pianoSlam(1.25); env.addShake(0.35); F.fear = 1;
        ST.it = env.addI({ p: new V3(p.x, 0.6, p.z), r: 5.5, label: 'Take a photo', when: () => ST.on === st && !st.crawl && gaze.inView(p) && P.mode === 'walk', act: () => crawlAt(st) });
        ST.cancel.push(gaze.whenLookAway(p, () => { if (!st.crawl) endStage(); }, 0.3));
      }, 0.72));
      return true;
    } },
    // standing at the far end of where you were looking, facing you; gone the next time you turn
    stand: { minN: 2, w: 3, run() {
      if (!freeE() || P.mode !== 'walk') return false;
      const p = gaze.behind(4.2, 7.5); if (!p) return false;
      E.root.scale.setScalar(1); E.root.position.set(p.x, P.pos.y, p.z); E.faceTowards(P.pos.x, P.pos.z, 1); E.mode = 'idle'; E.lookTarget = camera.position; E.visible = true; sfx.holdHush();
      const st = { kind: 'stand', p, t0: env.time(), end: hideE }; ST.on = st;
      ST.cancel.push(gaze.whenLookAt(p, () => {
        st.seen = env.time(); revealed(); sfx.unhush(); sfx.pianoSlam(0.95); F.fear = Math.max(F.fear, 0.85);
        ST.cancel.push(gaze.whenLookAway(p, () => endStage(), 0.25));
      }, 0.7));
      return true;
    } },
    // a head leaning out from a doorway at the edge of sight; it pulls back the moment you look straight at it
    peek: { minN: 2, w: 2.5, run() {
      if (!freeE() || P.mode !== 'walk') return false;
      for (const name of ['kid', 'bath', 'room2', 'spare', 'parents']) {
        const d = W.doors[name]; if (!d || d.a < 0.85 || d.target !== 1) continue;
        const m = d.mid, dist = Math.hypot(m.x - P.pos.x, m.z - P.pos.z); if (dist < 3 || dist > 9) continue;
        const mp = { x: m.x, z: m.z, y: 0 }; if (gaze.onScreen(mp, 1.15) || !hunter.los(P.pos.x, P.pos.z, m.x, m.z)) continue;
        // along the wall, toward your side of the opening, and through it (away from you). It stands in the room behind the near jamb,
        // where the wall hides it from down the hall, and leans its head and shoulder out into the doorway
        let ax = m.x - d.hx, az = m.z - d.hz; const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
        if (ax * (P.pos.x - m.x) + az * (P.pos.z - m.z) < 0) { ax = -ax; az = -az; }
        let nx = -az, nz = ax; if (nx * (m.x - P.pos.x) + nz * (m.z - P.pos.z) < 0) { nx = -nx; nz = -nz; }
        const x = m.x + nx * 0.28 + ax * 0.6, z = m.z + nz * 0.28 + az * 0.6;
        E.root.scale.setScalar(0.72); E.root.position.set(x, P.pos.y, z); E.faceTowards(x - nx * 3, z - nz * 3, 1); E.mode = 'idle'; E.lookTarget = camera.position;
        const ry = E.root.rotation.y, lx = Math.cos(ry), lz = -Math.sin(ry);   // its left, in the world
        E.leanSide = ((-ax) * lx + (-az) * lz > 0 ? -1 : 1) * 0.85; E.lean = 0.3; E.visible = true;
        const st = { kind: 'peek', p: mp, t0: env.time(), end: hideE }; ST.on = st;
        ST.cancel.push(gaze.whenLookAt(mp, () => { revealed(); sfx.whoosh(D.pan(m.x, m.z)); sfx.lurk(D.pan(m.x, m.z), 0.5, 0.8); F.fear = Math.max(F.fear, 0.7); endStage(); }, 0.93));
        return true;
      }
      return false;
    } },
    // the door to your room, that you shut, is open again when you turn round
    door: { minN: 1, w: 1.5, run() {
      const d = W.doors.kid; if (!d || d.target !== 0) return false;
      const m = { x: d.mid.x, z: d.mid.z, y: 0 }; if (Math.hypot(m.x - P.pos.x, m.z - P.pos.z) > 7 || gaze.onScreen(m, 1.15) || !gaze.sawRecently(m, 4)) return false;
      W.setDoor('kid', true, true);
      const st = { kind: 'door', p: m, t0: env.time() }; ST.on = st;
      ST.cancel.push(gaze.whenLookAt(m, () => { st.seen = env.time(); sfx.creak(0.1, D.pan(m.x, m.z)); F.fear = Math.max(F.fear, 0.4); endStage(); }, 0.6));
      return true;
    } },
    // your bear, turned round to face you
    bear: { minN: 1, w: 1.5, run() {
      const b = W.teddy; if (!b || !b.visible || b.sim) return false;
      const p = { x: b.position.x, z: b.position.z, y: b.position.y }; if (Math.hypot(p.x - P.pos.x, p.z - P.pos.z) > 6 || gaze.onScreen(p, 1.15) || !gaze.sawRecently(p, 4)) return false;
      b.rotation.y = Math.atan2(P.pos.x - p.x, P.pos.z - p.z);
      const st = { kind: 'bear', p, t0: env.time() }; ST.on = st;
      ST.cancel.push(gaze.whenLookAt(p, () => { st.seen = env.time(); sfx.whisper(D.pan(p.x, p.z), 0.08); endStage(); }, 0.8));
      return true;
    } },
    // the faces in the photographs in the hall, gone while you were not looking; back when you look away
    faces: { minN: 1, w: 1.2, run() {
      if (pr.shown.has('PHOTO') || pr.pending.has('PHOTO') || env.roomAt(P.pos.x, P.pos.z) !== 'hall') return false;
      const p = { x: 6.48, z: -1.02, y: 1.0 }; if (gaze.onScreen(p, 1.15) || !gaze.sawRecently(p, 4)) return false;
      nm.blackenPhotos(true);
      const st = { kind: 'faces', p, t0: env.time(), end: () => nm.blackenPhotos(false) }; ST.on = st;
      ST.cancel.push(gaze.whenLookAt(p, () => { st.seen = env.time(); F.fear = Math.max(F.fear, 0.5); sfx.whisper(D.pan(p.x, p.z), 0.07); ST.cancel.push(gaze.whenLookAway(p, () => endStage(), 0.4)); }, 0.55));
      return true;
    } },
    // Mom, in the dark kitchen with her back to you; when you come close she walks into the wall and is not there
    mom: { minN: 4, w: 1.5, run() {
      const room = env.roomAt(P.pos.x, P.pos.z); if (P.mode !== 'walk' || !['living', 'dining', 'hall'].includes(room)) return false;
      const k = { x: 1.9, z: 3.4, y: 0 }, dm = double('mom'); if (!dm.rig || gaze.onScreen(k, 1.15) || Math.hypot(k.x - P.pos.x, k.z - P.pos.z) < 4) return false;
      standDouble(dm, k.x, k.z, 0);   // facing the window over the sink, her back to the room
      const st = { kind: 'mom', p: k, t0: env.time(), d: dm, end: () => { dm.group.visible = false; } }; ST.on = st;
      ST.cancel.push(gaze.whenLookAt(k, () => { st.seen = env.time(); F.fear = Math.max(F.fear, 0.6); sfx.tension(0.04, 1.5); ST.cancel.push(gaze.whenLookAway(k, () => endStage(), 0.6)); }, 0.75));
      return true;
    } },
  };
  // the windows (windowscares.js): their scares join the same schedule, under the same gaps and the same quiet between reveals
  ws = createWindowScares({ W, E, P, F, camera, sfx, env, gaze, D, hunter, rnd: () => rnd(), later,
    stage: { start: (st) => { ST.on = st; }, on: () => ST.on, end: () => endStage(), revealed, hideE, freeE } });
  Object.assign(SCARES, ws.scares);
  // every stage scare on the engine's table: the engine decides when (the quiet curve, the tier caps, the resources), the scare stages
  // itself out of view with its own gaze test (or declines), the engine watches for the look that reveals it, and the stage takes it down
  const quietTypes = new Set(['vigil', 'car', 'finale', 'poltergeist']);   // night one is scripted end to end
  // the ones that are heard, not seen (taps on a pane, a curtain stirring): the reveal is the sound reaching you where you stand
  const HEARD = new Set(['tap', 'curtains']);
  const stageSetup = { door: () => { if (W.doors.kid) W.setDoor('kid', false, true); } };   // the house as the scare needs it, for the tests
  function registerStageBridge() {
    for (const [k, s] of Object.entries(SCARES)) {
      const tier = STAGE_TIER[k] || 'wrong', id = 'stage:' + k;
      events.register({
        id, tier, minN: Math.max(2, s.minN || 1), maxN: 9, w: s.w || 1, once: false,
        anchor: 'behindPlayer', uses: tier === 'presence' ? ['E', 'stage'] : ['stage'], noise: 0,
        pre: () => !ST.on && !!F.plan && !quietTypes.has(F.plan.type) && !F.script && !F.cutscene && P.mode === 'walk' && !hunter.busy && hunter.cool <= 0,
        arm: () => {
          const door = W.doors.kid && { a: W.doors.kid.a, target: W.doors.kid.target }, bear = W.teddy && W.teddy.rotation.y;
          const ok = s.run(); if (!ok || !ST.on) return null; const st = ST.on; st.kind ||= k;
          if (HEARD.has(k) && st.p) gaze.notePlaced(st.p, id);
          return { st, p: st.p, t0: env.time(), door, bear };
        },
        // the scare's own look test is the authority on whether it was found (it knows its window, its doorway, the glass); a scare without
        // one is found by the engine's look at its spot, and a heard one by the sound reaching you
        reveal: HEARD.has(k)
          ? { by: 'hold', hold: 0.1, when: (D, h) => !!(h.st && h.st.p && gaze.heard(h.st.p, 7, 6)) }
          : { by: 'look', at: (D, h) => (h && h.st ? h.st.p : null), minDot: 0.55, when: (D, h) => !!(h.st && (h.st.seen || h.st.out || (h.st.p && gaze.inView({ x: h.st.p.x, z: h.st.p.z, y: 0 }, 0.8) && gaze.facing(h.st.p) > 0.55))) },
        payoff: () => {},   // the scare's own look test made the sound: the engine only writes it down
        after: { keep: true, log: true, journal: id },
        while: (D, h) => ST.on === h.st,
        max: s.max || 60,
        undo: (h) => {
          if (ST.on === h.st) endStage();
          if (k === 'door' && h.door && W.doors.kid) { const d = W.doors.kid; d.a = h.door.a; d.target = h.door.target; d.apply(); }
          if (k === 'bear' && W.teddy && h.bear !== undefined) W.teddy.rotation.y = h.bear;
        },
        test: stageSetup[k] ? { setup: stageSetup[k] } : undefined,
      });
    }
  }
  registerStageBridge();
  // the flash in its face: its head snaps up, and it comes for you on all fours, faster if you run
  async function crawlAt(st) {
    if (st.crawl) return; st.crawl = { t0: 0 }; if (ST.it) { env.removeI(ST.it); ST.it = null; }
    for (const c of ST.cancel) c(); ST.cancel = [];
    if (env.photo) env.photo();
    F.fear = 1; await tween(0.14, (k) => { E.snap = k; });
    await wait(0.35); if (ST.on !== st) return;
    E.mode = 'crawl'; E.speed = 1; E.lookTarget = camera.position; st.crawl.t0 = env.time(); st.crawl.k = 0;
    { const e = E.root.position, at = { x: e.x, y: 0.4, z: e.z };   // it unfolds: joints going back the wrong way, then it comes
      if (!sfx.pick('bone_crack', { gain: 0.8, at, wet: 0.1 })) sfx.heavyStep(0.5, D.pan(e.x, e.z));
      sfx.pick('bone_crack', { gain: 0.55, at, wet: 0.1, delay: 0.18 }); }
  }
  // it reaches you: the low piano and nothing else, black, and under
  async function crawlCatch(st) {
    st.caught = true; revealed(); sfx.pianoSlam(1.9); UI.fade(1, 0.02); env.addShake(1.2);
    endStage(); hideE(); F.nmDone = true;
    await wait(0.9); if (F.live && !F.dead) nm.crawled(tok).catch((e) => console.warn('nightmare failed', e));
  }
  // a photo was taken (here, or of a piece of proof): with the folded one in view, it is the flash that sets it off
  function photoTaken() { const st = ST.on; if (st && st.kind === 'crumple' && st.seen && !st.crawl && gaze.inView(st.p)) crawlAt(st); }
  // the crawler's head: the face reaches well forward of the root on all fours
  const crawlHead = () => { const e = E.root.position, ry = E.root.rotation.y; return { x: e.x + Math.sin(ry) * 0.75, z: e.z + Math.cos(ry) * 0.75 }; };
  function stageTick(dt) {
    gaze.update(dt); if (ws) ws.tick(dt);
    if (env.lights && F.live && !F.dead) env.lights.house(dt, lightCtx());
    for (const k in doubles) { const d = doubles[k]; if (d.group.visible) d.update(env.time(), dt); }
    if (F.dead || !F.live) { if (ST.on) endStage(); return; }
    const st = ST.on, now = env.time();
    if (st) {
      const d = Math.hypot(st.p.x - P.pos.x, st.p.z - P.pos.z);
      if (st.kind === 'crumple') {
        if (st.crawl && st.crawl.t0) {
          // the chase. No stopwatch anywhere in it: it catches you by contact (its head within 0.9 m with a line to you) or not at all;
          // break its line of sight for two seconds and it stops where it is, holds a moment facing where you were, and is gone on the flicker
          const c = st.crawl;
          if (!c.started) { c.started = true; c.lost = 0; c.via = typeof hunter.crawl === 'function' && hunter.crawl(st.p, { free: false }) !== false; }
          if (c.via) { if (!hunter.busy) endStage(); return; }   // the hunter paths it on the graph and catches by contact
          // until the hunter can crawl: straight at you, a step at a time, stopped by furniture and walls
          const e = E.root.position, dx = P.pos.x - e.x, dz = P.pos.z - e.z, dd = Math.hypot(dx, dz) || 1, v = (P.sprinting ? 7.2 : 4.8) * dt;
          const seen = hunter.sees(14);
          if (seen) {
            const nx = e.x + dx / dd * Math.min(v, dd - 0.5), nz = e.z + dz / dd * Math.min(v, dd - 0.5);
            if (dd > 0.5 && !solidAt(nx, nz) && !blocked(e.x, e.z, nx, nz)) { e.x = nx; e.z = nz; }
            E.faceTowards(P.pos.x, P.pos.z, Math.min(1, dt * 12)); E.speed = 1.6; c.lost = 0;
            c.k -= dt; if (c.k <= 0) { c.k = 0.28 + Math.random() * 0.1; const at = { x: e.x, y: 0.2, z: e.z }; sfx.pick('crawl', { gain: 0.7, at, wet: 0.12, jitter: 0.08 }); if (Math.random() < 0.35) sfx.pick('bone_crack', { gain: 0.4, at, wet: 0.1 }); }
            const h = crawlHead(); if (Math.hypot(h.x - P.pos.x, h.z - P.pos.z) < 0.9) crawlCatch(st);
          } else {
            c.lost += dt; E.speed = 0.3;
            if (c.lost > 2) { E.mode = 'idle'; F.fear = 1; D.flicker(0.6); endStage(); }
          }
          return;
        }
        if (!st.crawl) E.faceTowards(P.pos.x, P.pos.z, dt * 2);
        if (st.seen && !st.crawl) { st.mum -= dt; if (st.mum <= 0) { sfx.mumble('lurker', 1.5, { gain: 0.42 / (1 + d * 0.25), pan: D.pan(st.p.x, st.p.z) }); st.mum = 1.6; } }
        if ((!st.seen && (now - st.t0 > 25 || d > 9)) || (st.seen && now - st.seen > 14)) { if (st.seen) D.flicker(0.6); endStage(); }
        return;
      }
      if (st.kind === 'stand') {
        if (st.seen && d < 2.6) { D.flicker(0.6); sfx.pianoSlam(0.7); endStage(); return; }
        if (!st.seen && (now - st.t0 > 25 || d > 12)) endStage();
        return;
      }
      if (st.kind === 'mom') {
        if (st.seen && d < 3.4 && !st.walking) {   // she walks forward into the wall, and is not there
          st.walking = true; const g = st.d.group, z0 = g.position.z; if (st.d.rig) st.d.rig.play('walk', { fade: 0.2, speed: 0.6 });
          tween(1.1, (k) => { g.position.z = z0 + k * 0.9; }).then(() => { sfx.thump(); endStage(); });
        }
        if (!st.seen && now - st.t0 > 30) endStage();
        return;
      }
      if (st.tick) { if (st.tick(dt) === false || now - st.t0 > (st.max || 30)) endStage(); return; }
      if (now - st.t0 > 30) endStage();
    }
    // a new one is the engine's call (js/events.js update: the quiet curve, the tier caps, the resources), through registerStageBridge
  }
  // fifteen seconds between reveals, and nothing else: what is staged holds the stage resource, which the engine's table respects
  D.revealCool = () => events.sinceReveal() < 15;
  D.revealed = revealed;

  // the late news, on the TV or the kitchen radio, in a small speaker's voice. Early nights it is about the town; later it is about this house,
  // and what you did tonight; on the last of them the reader stops and breathes. Each bulletin plays once a run.
  D.news = () => {
    const R = env.RUN, heard = (R.news ||= []), n = F.night || 2, room = env.roomAt(P.pos.x, P.pos.z);
    let pool = n <= 5 ? ['n1', 'n2', 'n3', 'n4', 'n5'] : n <= 7 ? ['n6', 'n7', 'n5', 'n4'] : ['n8', 'n7', 'n6'];
    pool = pool.filter((k) => !heard.includes(k) && (k !== 'n7' || room === 'living'));
    if (!pool.length) return;
    const id = pool[0], onTv = room === 'living' || rnd() < 0.55, x = onTv ? 4.22 : 1.6, z = onTv ? -3.04 : 4.35;
    heard.push(id); env.saveRun();
    if (onTv) { W.tvFx.set(true); D.holdTv(true); }
    sfx.staticBurst(D.pan(x, z), 0.7);
    later(0.7, () => {
      if (!F.live) return;
      const dist = Math.hypot(P.pos.x - x, P.pos.z - z), dur = sfx.speaker('vo/news/' + id, { pan: D.pan(x, z), gain: 1.4 / (1 + dist * 0.12) }) || 8;
      sub('news/' + id, dur + 0.5); F.fear = Math.max(F.fear, n >= 6 ? 0.6 : 0.3);
      const late = id === 'n7' || id === 'n8';
      later(dur + (late ? 0.4 : 0), () => {
        if (late) for (let i = 0; i < 4; i++) later(i * 1.6, () => sfx.breath(i % 2 === 0, 0.22 / (1 + dist * 0.12)));   // the reader stops, and breathes
        later(late ? 7 : 1.2, () => { sfx.staticBurst(D.pan(x, z), 0.4); if (onTv) { W.tvFx.set(false); D.holdTv(false); } });
      });
    });
  };

  // nodes the player could see right now (line of sight, within a range, in front of or behind them)
  function visibleNodes(min, max, where = 'front') {
    camera.getWorldDirection(tmp); const fx = tmp.x, fz = tmp.z, fl = Math.hypot(fx, fz) || 1, out = [];
    for (const k in NODES) {
      const dx = NODES[k][0] - P.pos.x, dz = NODES[k][1] - P.pos.z, d = Math.hypot(dx, dz);
      if (d < min || d > max) continue;
      const cos = (dx * fx + dz * fz) / (d * fl);
      if (where === 'front' ? cos < 0.55 : cos > -0.2) continue;
      if (!hunter.los(P.pos.x, P.pos.z, NODES[k][0], NODES[k][1])) continue;
      out.push(k);
    }
    return out;
  }

  // an encounter with the thing. Returns true if it began. Law 2: it is never put inside your view; a sight stands at a node behind you
  // (with a line to you, so your turn finds it) and you reveal it by turning round
  function encounter(kind) {
    if (ST.on) return false;   // something is already staged in the blind spot
    if (kind === 'sight') {
      if (hidden()) return false;
      const c = visibleNodes(5, 15, 'behind').filter((k) => !gaze.onScreen({ x: NODES[k][0], z: NODES[k][1], y: NODES[k][2] || 0 }, 1.15) && !gaze.sawRecently({ x: NODES[k][0], z: NODES[k][1], y: NODES[k][2] || 0 }, 2));
      if (!c.length) return false;
      hunter.sight(pick(rnd, c), { dur: 3 + rnd() * 2.5, lookTime: 0.8 }); return true;
    }
    if (kind === 'stalk') {
      const node = hunter.pickSpawn(10); if (!node) return false; hunter.stalk(node);
      return true;
    }
    const node = hunter.pickSpawn(9); if (!node) return false;
    startHunt(node); return true;
  }
  // the hunt's warning is the house, not a clock: the room's bulb browns, the clock stops, and it is there the same moment
  function startHunt(node) {
    if (F.dead || !F.live) return;
    D.flicker(1.2); W.clock.silent = true; F.fear = Math.max(F.fear, 0.6);
    if (hidden()) hunter.searchFrom(node); else hunter.hunt(node);
  }

  // ---------- the night ----------
  const clockText = (m) => {
    if (F.clockGlitch && env.time() < F.clockGlitch) return pick(() => Math.random(), ['3:33 AM', '3:33 AM', '13:00', '--:--', '6:66 AM']);
    const t = Math.floor(m) % 1440, h = Math.floor(t / 60), mm = t % 60; return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  let lastMin = -1, lastHr = -1;
  function tick(dt) {   // called every frame by the game while the night is live
    if (!(F.script && F.clock >= DAWN - 1) && !(F.holdDawn && F.clock >= DAWN - 3)) F.clock += dt * (F.clockRateNow || env.clockRate) * (window.__clockMul || 1);   // a scene that is playing holds the dawn back
    const m = Math.floor(F.clock); if (m !== lastMin || F.clockGlitch) { lastMin = m; UI.clock(clockText(F.clock), `night ${F.night}`); }
    // the grandfather clock: it strikes the hour, and it stops dead while the thing hunts you
    const hr = Math.floor(F.clock / 60); if (hr !== lastHr) { if (lastHr >= 0 && F.live && !W.clock.silent) D.chime(hr % 12 || 12); lastHr = hr; }
    W.clock.silent = hunter.state === 'hunt';
    director.update(); hunter.update(dt); proofTick(); stageTick(dt);
    // the breath meter shows whenever something is near enough to hear you
    if (F.live) F.breathUI = F.breathUI || (P.mode === 'hide' && hunter.busy && hunter.gap() < 14 && hunter.state !== 'leave');
    if (F.live && P.mode === 'hide' && !(hunter.busy && hunter.gap() < 14)) F.breathUI = F.breathCheck;
  }
  const director = createDirector(D);

  // ---------- proof: what a night leaves behind, photographed with the kid's disposable camera, to show Mom and Dad ----------
  // Each kind comes from the night's own events or its type (PROOF_FROM in director.js says which). It shows only after one of them has fired,
  // at a moment you are not looking at the spot; then a sound gives it away every so often, and up close it catches the light.
  // RUN.evidence holds the kinds photographed in this run, RUN.evidenceAt the night each was taken on, RUN.photos the prints (small jpegs).
  const WP = W.proof || {};
  const prop = (k) => (on) => { if (WP[k]) WP[k].show(on); };
  // cap: the caption written on the print; clue: what the photo board says about one not taken yet; snd: the sound that gives it away
  const PROOF = {
    SCRATCHES: { from: PROOF_FROM.SCRATCHES, keep: true, at: [8.44, 1.45, 1.14], p: [8.44, 1.35, 1.25], show: prop('SCRATCHES'), cap: 'closet door', clue: 'something in my room', snd: 'scratch',
      tell: 'Come look at my closet door. Something clawed it.' },
    FOOTPRINTS: { from: PROOF_FROM.FOOTPRINTS, at: [7.49, 0, -0.4], show: prop('FOOTPRINTS'), cap: 'wet footprints', clue: 'the hall floor', snd: 'drip',
      tell: 'There were wet footprints in the hall last night. Bare feet. Bigger than yours, Dad.' },
    CABINETS: { from: PROOF_FROM.CABINETS, at: [4.2, 1.9, 3.55], p: [3.88, 1.85, 3.55], show: prop('CABINETS'), cap: 'the cups', clue: 'the kitchen', snd: 'cabinet',
      tell: 'A cabinet in the kitchen was open, and all the cups were upside down.' },
    STATIC: { from: PROOF_FROM.STATIC, at: [4.04, 0.815, -3.11], p: [4.03, 0.85, -3.11], show: (on) => W.tvFx.set(on), still: () => W.tvFx.on, took: () => { W.tvFx.set(false); sfx.click(); }, cap: 'the TV', clue: 'the TV', snd: 'hiss',
      tell: 'The TV was on again last night. Nobody was watching it.' },
    DRAWING: { from: PROOF_FROM.DRAWING, keep: true, at: [7.1, 0.45, 0.19], p: [7.19, 0.6, 0.08], show: prop('DRAWING'), cap: 'black crayon', clue: 'my drawing', snd: 'crayon',
      tell: "Somebody drew on the wall under the drawing. In black crayon. I don't have a black one." },
    CHAIR: { from: PROOF_FROM.CHAIR, at: [0.5, 0.5, 0.66], show: (on) => { const c = W.chairs[2]; if (on) W.moveChair(2, 0.5, 0.66, Math.PI); else if (c) W.moveChair(2, c.x, c.z, c.rot); }, cap: 'the chair', clue: 'the kitchen table', snd: 'chair',
      tell: 'Somebody turned a kitchen chair to face the wall. Right up against it.' },
    PHONE: { from: PROOF_FROM.PHONE, at: [-0.82, 1.15, 1.63], p: [-0.78, 1.3, 1.64], show: (on) => (on ? W.phone.pickUp() : W.phone.hangUp()), still: () => W.phone.off, took: () => { W.phone.hangUp(); sfx.click(); }, cap: 'off the hook', clue: 'the phone', snd: 'dial',
      tell: 'The phone was off the hook. Somebody was still breathing on it.' },
    HANDPRINT: { from: PROOF_FROM.HANDPRINT, keep: true, at: [-9.65, 1.47, -7.24], p: [-9.65, 1.45, -7.0], show: prop('HANDPRINT'), cap: 'handprint', clue: 'the garage', snd: 'metal',
      tell: 'There is a handprint on the breaker box. Go look at the fingers.' },
    TEDDY: { from: PROOF_FROM.TEDDY, at: [0, 0, 0], show: prop('TEDDY'), place: (s) => { PROOF.TEDDY.at = [s[0], s[1], s[2]]; if (WP.TEDDY) WP.TEDDY.at(s[0], s[1], s[2]); }, cap: 'my bear', clue: 'my bear', snd: 'tear',
      tell: 'Somebody pulled the stuffing out of my bear. Look at him.' },
    PHOTO: { from: PROOF_FROM.PHOTO, at: [6.48, 1.5, -1.02], p: [6.48, 1.45, -0.9], show: (on) => nm.blackenPhotos(on), cap: 'no faces', clue: 'the pictures in the hall', snd: 'frame',
      tell: 'Every picture in the hall went black. The frames are fine. It is only the faces that are gone.' },
    WASHER: { from: PROOF_FROM.WASHER, at: [-7.62, 0.95, 2.45], p: [-7.32, 0.9, 2.43], show: (on) => { if (W.laundry) W.laundry.washer.open(on ? 1 : 0); }, cap: 'the washer', clue: 'the basement', snd: 'lid',
      tell: 'The washing machine lid was open in the middle of the night. Something was drumming inside it.' },
    CANDLE: { from: PROOF_FROM.CANDLE, at: [7.07, 0.03, -0.48], show: () => {}, cap: 'the candle', clue: 'the hall floor at night', snd: 'match',   // the vigil's own tea light, left on the floor until dawn
      tell: 'There was a candle burning in the hall last night. None of us lit it.' },
  };
  const found = () => (env.RUN.evidence ||= []), foundAt = () => (env.RUN.evidenceAt ||= {}), photos = () => (env.RUN.photos ||= {});
  const isFound = (k) => found().includes(k);
  const pr = { n: 0, kinds: [], pending: new Map(), shown: new Set(), its: {}, hud: false, next: {}, glints: {} };
  // what a night can leave (see proofSources: an event the director gave up on drops out of the total)
  function proofKinds(plan) {
    if (!plan || plan.n < 2 || plan.n > 9) return [];
    const src = proofSources(plan);
    return Object.keys(PROOF).filter((k) => PROOF[k].from.some((s) => src.has(s)) && (!isFound(k) || foundAt()[k] === plan.n));
  }
  // the glint: a faint sparkle on the spot, seen only from close by and only when you face it
  const glintTex = (() => {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d');
    const g = x.createRadialGradient(32, 32, 0, 32, 32, 32); g.addColorStop(0, 'rgba(255,255,240,1)'); g.addColorStop(0.18, 'rgba(255,250,220,0.55)'); g.addColorStop(1, 'rgba(255,250,220,0)');
    x.fillStyle = g; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = 'rgba(255,255,240,0.7)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(32, 6); x.lineTo(32, 58); x.moveTo(6, 32); x.lineTo(58, 32); x.stroke();
    return new THREE.CanvasTexture(c);
  })();
  function glintOn(k) {
    if (pr.glints[k] || !glintTex || !env.scene) return;
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glintTex, color: 0xfff6dc, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
    const [x, y, z] = PROOF[k].at; s.position.set(x, Math.max(y, 0.06), z); s.scale.setScalar(0.13); s.userData.noAO = true; s.renderOrder = 3;
    env.scene.add(s); pr.glints[k] = s;
  }
  function glintOff(k) { const s = pr.glints[k]; if (!s) return; s.parent && s.parent.remove(s); s.material.dispose(); delete pr.glints[k]; }
  // the house goes back to how it was, apart from what you found that stays (claw marks do not wash off)
  function proofSync() {
    for (const k of pr.shown) PROOF[k].show(false);
    for (const k in PROOF) if (PROOF[k].keep) PROOF[k].show(isFound(k));
    pr.shown.clear(); pr.pending.clear(); pr.next = {};
    for (const k in pr.its) env.removeI(pr.its[k]);
    for (const k of Object.keys(pr.glints)) glintOff(k);
    pr.its = {};
  }
  function proofStart(plan) { proofSync(); pr.n = plan.n; pr.kinds = proofKinds(plan); proofLine(); }
  function proofFire(src, at) {
    if (!F.live) return;
    for (const k of pr.kinds) {
      const d = PROOF[k];
      if (isFound(k) || pr.pending.has(k) || pr.shown.has(k) || !d.from.includes(src)) continue;
      if (at && d.place) d.place(at);
      pr.pending.set(k, env.time());
    }
  }
  // the sound that gives a spot away: faint from across the house, plain within six metres
  function cueFor(k) {
    const d = PROOF[k], [x, y, z] = d.at, dist = Math.hypot(camera.position.x - x, camera.position.z - z);
    const gain = dist < 6 ? 0.9 : 0.4 * clamp(1 - (dist - 6) / 22, 0.25, 1);
    sfx.proofCue(d.snd, D.pan(x, z, Math.max(y, 0.4)), gain);
  }
  function proofTick() {
    const now = env.time(), quiet = !F.script && !F.cutscene && !hunter.busy;
    for (const [k, t0] of pr.pending) {
      const d = PROOF[k], [x, y, z] = d.at;
      if (now - t0 < 2.5 || (Math.hypot(camera.position.x - x, camera.position.z - z) < 10 && hunter.looking(x, z, 0.3, y))) continue;
      pr.pending.delete(k); pr.shown.add(k); d.show(true); glintOn(k);
      if (quiet) cueFor(k);
      pr.next[k] = now + 20 + Math.random() * 15;
      const p = d.p || [x, Math.max(y + 0.25, 0.7), z];
      pr.its[k] = env.addI({ p: new V3(...p), r: 1.4, label: 'Take a photo', act: () => proofLook(k),
        when: () => F.live && P.mode === 'walk' && !F.cutscene && pr.shown.has(k) && !isFound(k) && hunter.state !== 'hunt' && hunter.state !== 'loom' });
    }
    // something else put it back (the TV switched off, the phone hung up): it turns up again later
    for (const k of pr.shown) {
      const d = PROOF[k];
      if (d.still && !isFound(k) && !d.still()) { pr.shown.delete(k); env.removeI(pr.its[k]); delete pr.its[k]; glintOff(k); pr.pending.set(k, now); continue; }
      if (isFound(k)) continue;
      // it calls again every so often until it is photographed
      if (now >= (pr.next[k] || 0)) { if (quiet) cueFor(k); pr.next[k] = now + 20 + Math.random() * 15; }
      const s = pr.glints[k]; if (!s) continue;
      const [x, , z] = d.at, dx = s.position.x - camera.position.x, dy = s.position.y - camera.position.y, dz = s.position.z - camera.position.z, dist = Math.hypot(dx, dy, dz);
      camera.getWorldDirection(tmp); const facing = (tmp.x * dx + tmp.y * dy + tmp.z * dz) / Math.max(dist, 0.01);
      const vis = dist < 3 && facing > 0.55 ? (1 - dist / 3) * smooth(facing, 0.55, 0.85) : 0;
      s.material.opacity += ((vis * (0.45 + 0.35 * Math.sin(now * 2.3 + x + z))) - s.material.opacity) * 0.15;
    }
  }
  const smooth = (v, a, b) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  // take a photo: the view leans in, the flash goes, the print slides out and is kept. Saved first, so getting caught right after still counts it.
  async function proofLook(k) {
    const d = PROOF[k]; if (F.cutscene || isFound(k)) return;
    found().push(k); foundAt()[k] = pr.n; env.saveRun(); proofLine();
    env.removeI(pr.its[k]); delete pr.its[k]; glintOff(k);
    // the camera comes up to the eye where you stand (no stepping in): the view turns to the spot, the viewfinder frames it, the flash
    F.cutscene = true; F.photoHold = true; P.mode = 'cine'; P.cam.copy(camera.position);
    const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch, at = new V3(...d.at);
    const h = Math.hypot(at.x - from.x, at.z - from.z), yaw = h > 0.05 ? Math.atan2(-(at.x - from.x), -(at.z - from.z)) : y0, pitch = clamp(Math.atan2(at.y - from.y, h), -1.3, 1.3);
    if (env.hands) env.hands.raiseCamera();
    await tween(0.6, (q) => { P.yaw = lerpAngle(y0, yaw, q); P.pitch = lerp(p0, pitch, q); });
    await wait(0.3);
    const url = env.photo ? env.photo() : null;
    if (url) { photos()[k] = url; env.saveRun(); }
    UI.print && UI.print(url, d.cap); photoTaken();
    if (d.took) d.took();
    await wait(0.9);
    if (env.hands) env.hands.lowerCamera();
    F.photoHold = false;
    await tween(0.4, (q) => { P.pitch = lerp(pitch, clamp(pitch, -0.5, 0.5), q); });
    P.cam.copy(from);
    if (P.mode === 'cine' && !F.dead) { P.mode = 'walk'; F.cutscene = false; }
  }
  // the line under the objective: a camera, and a print for each piece of proof tonight can leave (filled once it is taken); no numbers.
  // On a touch screen it opens the photo board.
  const proofEl = (() => {
    const o = typeof document !== 'undefined' && document.getElementById('objective'); if (!o) return null;
    const el = document.createElement('div'); el.id = 'proof'; o.after(el);
    let pressT = 0, longed = false;   // a tap opens the photo board; a long press brings the camera up
    el.addEventListener('pointerdown', () => { longed = false; clearTimeout(pressT); pressT = setTimeout(() => { longed = true; if (env.hands) env.hands.toggleCamera(); }, 450); });
    el.addEventListener('pointerup', () => clearTimeout(pressT)); el.addEventListener('pointerleave', () => clearTimeout(pressT));
    el.addEventListener('click', () => { if (longed) { longed = false; return; } if (env.openPhotos) env.openPhotos(); });
    // under the objective while there is one, in its place while there is none
    const place = () => { const on = o.classList.contains('show'); el.classList.toggle('alone', !on); el.style.top = `${on ? o.offsetTop + o.offsetHeight + 10 : o.offsetTop}px`; };
    new MutationObserver(place).observe(o, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
    addEventListener('resize', place); place();
    return el;
  })();
  function proofLine() {
    if (!proofEl) return;
    proofEl.innerHTML = `<i class="cam" aria-hidden="true"></i>${pr.kinds.map((k) => `<b class="print${isFound(k) ? ' taken' : ''}"></b>`).join('')}`;
    proofEl.setAttribute('aria-label', `Photos tonight: ${pr.kinds.filter(isFound).length} of ${pr.kinds.length}`);
  }
  // main.js, every frame: shown while a night that can leave proof is being played
  function proofHud(on) {
    on = !!on && pr.kinds.length > 0 && F.stage === 'n' + pr.n;
    if (on !== pr.hud && proofEl) { pr.hud = on; proofEl.classList.toggle('show', on); }
  }
  // the photo board (the pause menu's Photos): every print of the run pinned up, and an empty frame with a clue for each one tonight can still leave
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function board(body) {
    const tilt = (i) => ((i * 37) % 9) - 4;
    const pins = found().filter((k) => PROOF[k]).map((k, i) => {
      const src = photos()[k];
      return `<figure class="pin" style="--r:${tilt(i)}deg">${src ? `<img src="${src}" alt="">` : '<div class="blank"></div>'}<figcaption>${esc(PROOF[k].cap)}</figcaption></figure>`;
    });
    const open = F.stage === 'n' + pr.n ? pr.kinds.filter((k) => !isFound(k)) : [];
    const blanks = open.map((k, i) => `<figure class="pin empty" style="--r:${tilt(i + 5)}deg"><div class="blank"></div><figcaption>${esc(PROOF[k].clue)}</figcaption></figure>`);
    body.innerHTML = `<div class="board">${pins.length || blanks.length ? `<div class="pins">${pins.join('')}${blanks.join('')}</div>` : '<p class="board-none">No photos yet.</p>'}`
      + '<p class="board-note">Mom and Dad will believe me if I show them enough.</p></div>';
  }
  proofSync();
  const proof = {
    defs: PROOF, total: Object.keys(PROOF).length, count: () => found().length, on: (n) => found().filter((k) => foundAt()[k] === n), tell: (k) => PROOF[k] && PROOF[k].tell,
    cap: (k) => PROOF[k] && PROOF[k].cap, photo: (k) => photos()[k] || null, board,
    near: (pos) => { for (const k of pr.shown) { if (isFound(k)) continue; const a = PROOF[k].at; if (Math.hypot(pos.x - a[0], pos.z - a[2]) < 3.2) return true; } return false; },
    kinds: () => pr.kinds.slice(), pending: () => [...pr.pending.keys()], shown: () => [...pr.shown], kindsFor: proofKinds, start: proofStart, fire: proofFire, sync: proofSync, hud: proofHud, look: proofLook,
  };

  // night n of this run. A run that has not reached night two (or one made from #seed=) takes the current planner and saves which it was; a
  // run saved further on with no planVersion is from before PLAN_VERSION 2 and keeps the plans it has been playing
  function planFor(n) {
    const R = env.RUN;
    if (!(R.night >= 2) || (env.HPARAM && env.HPARAM.seed)) R.planVersion = PLAN_VERSION;
    return makePlan(R.seed, n, R.planVersion || 1);
  }

  async function freeNight(n) {
    const t = ++tok;
    F.stage = 'n' + n; F.night = n;
    env.resetNight(); env.setPhase('night'); env.sfx.dread(Math.min(0.25 + n * 0.07, 0.8), 4);
    const plan = planFor(n); if (env.HPARAM && env.HPARAM.type) plan.type = env.HPARAM.type;   // #type=ring forces a night type for testing
    rnd = plan.r; F.plan = plan; F.typeName = TYPE_NAMES[plan.type];
    F.clock = plan.clock0; lastMin = -1; lastHr = -1; F.script = false; F.clockGlitch = 0; F.clockRateNow = 1 / plan.rate; F.holdDawn = plan.type === 'finale';
    F.nmDone = false; F.objOk = plan.type === 'poltergeist' || plan.type === 'finale'; hunter.reset(); hunter.setLevel(n + (env.RUN.objDone[n - 1] === false ? 1 : 0)); W.tvFx.set(false); W.phone.setRinging(false); proofStart(plan);
    env.toBunk(); endStage(); gaze.clearAll(); if (ws) ws.reset(); ST.lastReveal = -99;
    // the engine's table for tonight, and the night's own cleanup (run by a catch, a restart, dawn): the stage down, the doubles away,
    // the TV let go, the camera lowered
    events.start(plan, n);
    events.NIGHT.cleanup.push(() => { endStage(); for (const k in doubles) doubles[k].group.visible = false; tvHeld = false; F.photoHold = false; if (ws) ws.reset(); });
    const dialClock = clockText(F.clock);
    UI.card(dialClock, `Night ${n}`, 4.5);
    await wait(2.5); UI.fade(0, 3); await wait(2.0);
    F.live = true; director.start(plan);
    sfx.creak(0.25, D.pan(W.doors.kid.mid.x, W.doors.kid.mid.z));
    UI.hint(`<b>${L('interact')}</b> climb down &nbsp;·&nbsp; <b>${L('breath')}</b> hide under the covers &nbsp;·&nbsp; <b>${env.lightLabel()}</b> flashlight`, 9);
    briefing(n, t);
    try { hooks.spine.start(n); } catch (e) { console.warn('spine failed to start', e); }   // the night's fixed beat (js/spine.js), when it is written
    if (TYPE_RUN[plan.type]) TYPE_RUN[plan.type](plan, t).catch((e) => console.warn('night type failed', plan.type, e));
    await waitFor(() => !alive(t) || (F.clock >= DAWN && !F.script && !F.cutscene));
    if (!alive(t)) return;
    await dawn(n);
  }

  // tonight's objective, kept in the run: skipping it (RUN.objDone[n] false) makes the next night's hunter one level harder
  const completeObjective = () => { F.objOk = true; };
  async function briefing(n, t) {
    const R = env.RUN;
    await wait(11); if (!alive(t) || F.script || F.cutscene) return;
    if (n === 2 && !R.briefed) {   // the kid's own reason for the camera, then how to use it
      R.briefed = true; env.saveRun();
      UI.subtitle("<i>If I get pictures, they'll have to believe me.</i>", 5);
      later(5.5, () => UI.hint(`Something strange? Take a photo: <b>${L('interact')}</b>  ·  your photos: <b>${L('photos')}</b>  ·  when it comes, hide and hold <b>${L('breath')}</b>`, 9));
      return;
    }
    if (env.RUN.objDone[n - 1] === false && !R.skipTold) { R.skipTold = true; env.saveRun(); UI.hint('You skipped what it wanted last night. It is closer tonight.', 8); }
  }

  async function dawn(n) {
    env.RUN.objDone[n] = !!F.objOk;
    F.live = false; F.script = true; director.stop(); tok++;
    // the hall picture that came down in the night is back on its hook by breakfast (the ledger says it fell, so the morning can say so)
    if (W.hallFrame && W.hallFrame.fallen) { log.push({ id: 'frame', seen: true, how: 'dawn', room: 'hall' }); W.hallFrame.reset(); }
    events.dawn(n);   // the dawn hooks the modules registered, then every armed beat's undo and the night's cleanup list
    endStage(); env.FN.reset(E);
    env.vigil.stop(); hunter.dismiss(); sfx.violins(0, 3); sfx.tension(0, 2); sfx.drone(0.04, 4); UI.objective(null); UI.hint(null); W.tvFx.set(false); W.phone.setRinging(false);
    proofSync(); pr.kinds = [];
    F.breathCheck = false; F.chase = false; F.echo = false; W.nightLights.forEach((x) => { x.dead = false; }); F.blackout = false; env.nlMult(1, false);
    if (P.mode === 'hide' && P.pod) { UI.pod(null); P.pod = null; }
    await wait(1.0);
    UI.clock('6:00 AM', `night ${n}`); sfx.chirp(0.2);
    UI.card('6:00 AM', 'You made it', 3.5); achievements.survived(n);
    await wait(3.2); UI.fade(1, 2.5); await wait(3);
    F.script = false; UI.clock(null);
    env.RUN.night = n + 1; env.saveRun();
  }

  // the evening after moving day: your three boxes unpacked and stacked on the one on the floor, so the bottom bunk is clear
  function tidyKidBoxes() {
    const bs = (env.kidBoxes || []).filter((b) => b.parent), h = (b) => (b.geometry.parameters && b.geometry.parameters.height) || 0.44;
    if (!bs.length) return;
    const base = bs.find((b) => b.position.y < 0.35) || bs[0], rest = bs.filter((b) => b !== base);
    base.position.y = h(base) / 2;
    let y = h(base);
    rest.forEach((b, i) => { b.position.set(base.position.x + (i ? -0.03 : 0.04), y + h(b) / 2, base.position.z + (i ? 0.02 : -0.03)); b.rotation.set(0, base.rotation.y + (i ? -0.12 : 0.1), 0); y += h(b); });
  }

  // ---------- night one on the engine's table ----------
  // The night's state its beats close over (TYPE_RUN.poltergeist fills it as night one starts) and the helpers they share. Every beat
  // says where it fits, is armed out of view, is revealed by what you do, and is written down seen or unseen; the night ends when you
  // have been through enough of them (the type's own loop, below in TYPE_RUN)
  const N1 = { live: false, silenced: false, exp: 0, lastEnd: 0, t0: 0, k: 1, hall: [], chairs0: [], amb0: 1, log: null, breathing: false, dentOn: false, dentSeen: false, tok: 0 };
  const n1 = {
    since: () => env.time() - N1.t0,
    room: () => env.roomAt(P.pos.x, P.pos.z, P.pos.y),
    inBunk: () => P.mode === 'bunk' || (P.mode === 'hide' && !P.pod),
    dist: (p) => Math.hypot(P.pos.x - p.x, P.pos.z - p.z),
    at: (x, y, z) => ({ x, y, z }),
    ok: (h) => N1.live && h.alive !== false && alive(N1.tok),
    // the night-one log the scenario test reads (window.__n1log): where you were and how long since the last beat ended
    mark(id, extra = {}) { if (!N1.log) return; N1.log.push({ id, t: Math.round(n1.since() * 10) / 10, room: n1.room(), mode: P.mode, x: Math.round(P.pos.x * 100) / 100, z: Math.round(P.pos.z * 100) / 100, gap: Math.round((n1.since() - N1.lastEnd) * 10) / 10, ...extra }); },
    done() { N1.lastEnd = n1.since(); N1.exp++; },
    kidD: () => ({ x: W.doors.kid.mid.x, z: W.doors.kid.mid.z, y: 0 }),
    parD: () => (W.doors.parents ? { x: W.doors.parents.mid.x, z: W.doors.parents.mid.z, y: 0 } : { x: -3.3, z: 1.2, y: 0 }),
    drawP: () => { const p = W.drawingMesh.getWorldPosition(new V3()); return { x: p.x, y: p.y, z: p.z }; },
    tableP: () => { const C = W.chairs; let x = 0, z = 0; for (const c of C) { x += c.holder.position.x; z += c.holder.position.z; } return { x: x / Math.max(1, C.length), y: 0.75, z: z / Math.max(1, C.length) }; },
    bedP: () => { const pb = W.parentsBed; return pb ? n1.at((pb.mom.x + pb.dad.x) / 2, 0.75, (pb.mom.z + pb.dad.z) / 2) : n1.at(-6.9, 0.75, 0.1); },
    seesDoor: () => { const dp = n1.kidD(); return gaze.inView(dp) && gaze.facing(dp) > 0.86; },
    frameSeen: () => {
      const hf = W.hallFrame; if (!hf || hf.fallen || n1.room() !== 'hall') return false;
      const dx = hf.g.position.x - P.pos.x, dz = hf.g.position.z - P.pos.z, d = Math.hypot(dx, dz);
      if (d < 1.0 || d > 3.0) return false;
      return (dx * -Math.sin(P.yaw) + dz * -Math.cos(P.yaw)) / d > 0.82;
    },
    hallOn() {   // Mom's hand on the switch: the hall light, brighter than it was, and warm
      for (const n of N1.hall) n.dead = false; F.flicker = false; env.nlMult(1, false);
      // the ceiling light in the hall, on its switch (warm, real); the green night lights only come back as they were
      if (!(env.lights && env.lights.set('hall', true, { by: 'mom' }))) sfx.pick('switch', { at: N1.hall[0] ? n1.at(N1.hall[0].pos.x, 1.3, N1.hall[0].pos.z) : null, gain: 0.55, wet: 0.15 }) || sfx.click();
    },
    async rampT(ok, dur, fn) { const n = Math.max(2, Math.round(dur * 30)); for (let i = 1; i <= n; i++) { fn(i / n); await wait(dur / n); if (!ok()) return false; } return true; },
    // somewhere in the room you are in, out of sight, with a clear floor between it and you
    spotNear(rMin, rMax, { seen = false } = {}) {
      const r0 = n1.room(), out = [];
      for (let a = 0; a < 24; a++) for (const r of [rMin, (rMin + rMax) / 2, rMax]) {
        const ang = a / 24 * Math.PI * 2, x = P.pos.x + Math.sin(ang) * r, z = P.pos.z + Math.cos(ang) * r, p = new V3(x, P.pos.y, z);
        if (env.roomAt(x, z, P.pos.y) !== r0 || solidAt(x, z) || blocked(P.pos.x, P.pos.z, x, z)) continue;
        if (!seen && gaze.inView(new V3(x, P.pos.y + 1.2, z), 1.05)) continue;
        out.push(p);
      }
      return out.length ? out[Math.floor(Math.random() * out.length)] : null;
    },
  };
  function registerNightOne() {
    const { since, room, inBunk, dist, at, ok, mark } = n1;
    const K = () => N1.k;
    const quiet = () => N1.live && N1.silenced && !F.script && !F.cutscene;
    const BED = at(8.42, 0.62, 3.72), MIRROR = { x: 6.59, z: 1.64, y: 0 };
    // the house goes silent and the hall light you were promised clicks off. Heard from anywhere: the first thing, once you are still
    events.register({
      id: 'silence', tier: 'whisper', minN: 1, maxN: 1, w: 1, once: true, rooms: null, uses: ['n1'], noise: 0, anchor: null,
      pre: () => N1.live && !N1.silenced && !F.script && !F.cutscene && since() >= 6 * K(),
      arm: () => { mark('silence'); F.script = true; N1.silenced = true; sfx.ambience(0, 0.2); sfx.dread(0, 0.3); if (W.clock) W.clock.silent = true; return { alive: true }; },
      reveal: { by: 'hold', hold: 5.5, when: () => true },   // the house holds its breath, and you are in it
      payoff: (D, h) => {
        sfx.pick('switch', { at: N1.hall[0] ? at(N1.hall[0].pos.x, 1.3, N1.hall[0].pos.z) : at(7.6, 1.3, -0.4), gain: 0.45, wet: 0.2 }) || sfx.click();
        for (const n of N1.hall) n.dead = true; env.nlMult(1, false); F.fear = Math.max(F.fear, 0.45);
        if (env.lights) env.lights.allOff();   // and any light you put on: you hear each switch go, wherever it is
        F.script = false; h.done = true;
      },
      after: { keep: true, log: true, journal: 'silence' }, max: 60,
      undo: () => { F.script = false; N1.silenced = false; for (const n of N1.hall) n.dead = false; env.nlMult(1, false); if (W.clock) W.clock.silent = false; sfx.ambience(N1.amb0, 1); },
      end: () => n1.done(),
    });
    // the bottom bunk under you takes a weight: only while you are in your room, where you would hear the frame and could look
    events.register({
      id: 'dent', tier: 'presence', minN: 1, maxN: 1, w: 1, once: true, rooms: ['bed'], uses: ['n1', 'bunk'], noise: 0, anchor: 'bunk',
      pre: () => quiet() && room() === 'bed',
      arm: () => {
        mark('dent'); const h = { alive: true, ready: false, seen: false, bed: BED };
        N1.dentOn = true; N1.dentSeen = false; F.script = true;
        (async () => {
          sfx.pick('creak_heavy', { at: BED, gain: 1.0, wet: 0.12 });
          if (!await n1.rampT(() => ok(h), 1.3, (q) => env.FN.dent.set(q * q * (3 - 2 * q)))) return;
          sfx.pick('creak_heavy', { at: BED, gain: 0.6, wet: 0.12, rate: 0.85 });
          if (inBunk() && W.teddy && W.teddy.visible && W.teddy.position.y > 0.3) { W.teddy.fling(W.teddy.position.clone(), { x: 0.15, y: 0.5, z: -1.05 }, 0.02, 4); later(0.6, () => sfx.pick('wall_knock', { at: at(8.6, 0.05, 3.0), gain: 0.8, wet: 0.25, lp: 900 })); }
          await wait(2.6); if (!ok(h)) return;
          sfx.pick('breath', { at: BED, gain: 0.6, wet: 0.06, rate: 0.8 }); F.fear = Math.max(F.fear, 0.7);
          F.script = false; h.ready = true; h.nb = env.time() + 5;
        })();
        return h;
      },
      // until you look: a breath under you every few seconds (unless the one in time with yours has taken over)
      tick: (D, h) => { if (!h.ready || h.seen || N1.breathing) return; if (env.time() > h.nb && room() === 'bed') { h.nb = env.time() + 4.5 + Math.random() * 2; sfx.pick('breath', { at: BED, gain: 0.5, wet: 0.06, rate: 0.78 + Math.random() * 0.06 }); } },
      reveal: { by: 'look', at: 'bunk', when: (D, h) => h.ready && ((F.leanK || 0) > 0.75 || (P.mode === 'walk' && gaze.inView({ x: BED.x, z: BED.z, y: 0 }))) },
      payoff: (D, h) => { h.seen = true; N1.dentSeen = true; env.FN.dent.relax(7); F.fear = Math.max(F.fear, 0.85); later(2.4, () => sfx.creak(0.1, D.pan(BED.x, BED.z, 0.6))); h.done = true; },
      while: () => room() === 'bed',
      max: () => 5 + 30 * K(),
      undo: (h) => { h.alive = false; F.script = false; N1.dentOn = false; if (!h.seen) { if (h.ready) env.FN.dent.relax(14); else env.FN.dent.set(0); } },
      end: () => { N1.dentOn = false; n1.done(); },
      after: { keep: false, log: true, journal: 'dent' },
    });
    // the breath below, in time with yours, a hand's width under you: on night one while the weight is in the bottom bunk and nobody has
    // looked; from night two whenever you have lain still a while with the hall light off (the bunk's own chain, law 8). Under the covers
    // it follows your breathing; hold your breath and it keeps the rhythm it learned, then stops. Lean over the rail and it stops dead
    events.register({
      id: 'breathUnder', tier: 'whisper', minN: 1, maxN: 9, w: 1.5, once: true, rooms: ['bed'], uses: [], noise: 0, chain: 'free', anchor: 'bunk',   // rides on the dent: no resource of its own
      pre: () => inBunk() && !F.script && !F.cutscene && !env.holding() && ((F.night || 1) <= 1 ? N1.live && N1.dentOn && !N1.dentSeen : gaze.still(6) && !D.hallLit() && !events.RES.isHeld('E')),
      arm: () => {
        if ((F.night || 1) <= 1) mark('breathUnder'); else env.FN.dent.set(1);   // from night two it is the same weight, silently, under you
        N1.breathing = true;
        return { alive: true, cycles: 0, matched: 0, after: 0, phase: 0.4, lastBT: P.breathT, held: false, cue: [] };
      },
      tick: (D, h, dt) => {
        if (h.stopped) return;
        const holding = env.holding(); let breathe = false;
        if (P.mode === 'hide' && !holding) { if (P.breathT > h.lastBT + 0.4) { breathe = true; h.matched++; } h.lastBT = P.breathT; h.phase = 0; }   // under the covers your breath is audible and it follows it
        else { h.phase += dt; if (h.phase >= 1.25) { h.phase -= 1.25; breathe = true; } if (holding) h.held = true; }   // uncovered, or holding: the rhythm it learned
        if (!breathe) return;
        h.cycles++; h.cue.push({ t: Math.round(events.now() * 100) / 100, breathT: Math.round(P.breathT * 100) / 100, holding });
        sfx.pick('breath', { at: BED, gain: 0.42, wet: 0.06, rate: 0.8 + (h.cycles % 2) * 0.04 });
        if (h.revealed) { if (++h.after >= 2) { h.stopped = true; h.done = true; } }
        else if (h.cycles >= 8) { h.stopped = true; h.done = true; }   // nobody held, nobody looked: it stops on its own, unseen
      },
      reveal: { by: 'hold', hold: 0.6, when: (D, h) => h.cycles >= 1 && (env.holding() || (F.leanK || 0) > 0.65) },
      payoff: (D, h) => {
        h.revealed = true; F.fear = Math.max(F.fear, (F.leanK || 0) > 0.65 ? 0.85 : 0.75);
        if ((F.leanK || 0) > 0.65 && !env.holding()) { h.stopped = true; h.done = true; }   // you looked down: it stops dead
      },
      // until you climb down (pulling the covers passes through a cut, and that is still the bunk); on night one only while the weight
      // is still in the bottom bunk (the dent set, or not yet smoothed out)
      while: () => P.mode !== 'walk' && ((F.night || 1) > 1 || N1.dentOn || env.FN.dent.k > 0.15),
      max: 40,
      undo: (h) => { h.alive = false; h.stopped = true; N1.breathing = false; if ((F.night || 1) > 1) env.FN.dent.set(0); },
      test: { mode: 'bunk' },
      end: (D, h, seen) => { N1.breathing = false; if (N1.live) { n1.done(); const row = N1.log && N1.log.find((e) => e.id === 'breathUnder'); if (row) Object.assign(row, { cycles: h.cycles, matched: h.matched, held: h.held, seen }); } },
      logExtra: (h) => ({ cycles: h.cycles, matched: h.matched, held: h.held }),
      after: { keep: false, log: true, journal: 'breathUnder' },
    });
    // heavy steps up the hall stop at your door, and the door shuts while you watch it: in your room, with the door in front of you
    events.register({
      id: 'door', tier: 'wrong', minN: 1, maxN: 1, w: 1, once: true, rooms: ['bed'], uses: ['n1', 'door:kid'], noise: 0, anchor: 'door:kid',
      pre: () => quiet() && room() === 'bed' && dist(n1.kidD()) > 1.6 && W.doors.kid.a > 0.6 && (inBunk() || gaze.facing(n1.kidD()) > 0.2),
      arm: () => {
        mark('door'); const h = { alive: true, ready: false }; F.script = true;
        (async () => {
          const path = [[4.5, -0.45], [5.2, -0.43], [5.9, -0.41], [6.6, -0.38], [7.3, -0.35], [8.0, -0.3], [8.7, -0.26], [9.3, -0.22], [9.72, -0.14]];
          for (let i = 0; i < path.length; i++) {
            const [x, z] = path[i]; sfx.heavyStep(0.5 + i * 0.035, D.pan(x, z)); if (i % 3 === 2) sfx.creak(0.12, D.pan(x, z));
            F.fear = Math.max(F.fear, 0.3 + i * 0.06); await wait(i < 6 ? 1.05 : 1.45); if (!ok(h)) return;
            if (room() !== 'bed') { F.script = false; h.done = true; return; }   // you went out to meet it: the steps simply stop
          }
          await wait(3); if (!ok(h)) return;
          F.script = false; h.ready = true; h.t1 = env.time();
        })();
        return h;
      },
      reveal: { by: 'watch', hold: 0.8, at: 'door:kid', when: (D, h) => h.ready && n1.seesDoor() },   // it moves only while you watch it
      payoff: (D, h) => {
        (async () => {
          const kidDoor = W.doors.kid, dp = n1.kidD(); let cycles = 0;
          while (ok(h) && cycles < 2 && room() === 'bed' && env.time() - h.t1 < 45 * K()) {
            await until(N1.tok, () => !ok(h) || n1.seesDoor() || room() !== 'bed' || env.time() - h.t1 > 45 * K()); if (!ok(h) || !n1.seesDoor()) break;
            await wait(0.8); if (!ok(h)) return;
            if (!n1.seesDoor()) continue;
            sfx.pick('door_creak', { at: at(dp.x, 1.2, dp.z), gain: 0.3, wet: 0.2, rate: 0.55 });
            let away = 0;
            while (ok(h) && kidDoor.a > 0.12 && away < 0.3) { await wait(1 / 30); if (n1.seesDoor()) { away = 0; kidDoor.a = kidDoor.target = Math.max(0.12, kidDoor.a - 0.0035); kidDoor.apply(); } else away += 1 / 30; }
            await until(N1.tok, () => !ok(h) || !gaze.inView(dp)); if (!ok(h)) return;
            kidDoor.a = kidDoor.target = 1; kidDoor.apply(); cycles++;   // open again, without a sound
            F.fear = Math.max(F.fear, 0.7);
          }
          if (!ok(h)) return;
          kidDoor.a = kidDoor.target = 1; kidDoor.apply(); h.done = true;
        })();
      },
      while: () => room() === 'bed',
      max: () => 17 + 45 * K(),
      undo: (h) => { h.alive = false; F.script = false; const d = W.doors.kid; d.a = d.target = 1; d.apply(); },
      end: () => n1.done(),
      after: { keep: false, log: true, journal: 'door' },
    });
    // out of your room: your door shuts behind you, a little at a time while your back is to it, and stops the instant you look
    events.register({
      id: 'doorBehind', tier: 'wrong', minN: 1, maxN: 1, w: 1, once: true, rooms: ['hall', 'bath', 'room2', 'spare'], uses: ['n1', 'door:kid'], noise: 0, anchor: 'door:kid',
      pre: () => quiet() && ['hall', 'bath', 'room2', 'spare'].includes(room()) && dist(n1.kidD()) > 1.5 && dist(n1.kidD()) < 7 && W.doors.kid.a > 0.6 && !gaze.inView(n1.kidD()),
      arm: () => {
        mark('doorBehind'); const h = { alive: true }, dp = n1.kidD(), kidDoor = W.doors.kid;
        sfx.pick('door_creak', { at: at(dp.x, 1.2, dp.z), gain: 0.32, wet: 0.2, rate: 0.6 });
        (async () => {
          while (ok(h) && kidDoor.a > 0.02) { if (!gaze.inView(dp)) { kidDoor.a = kidDoor.target = Math.max(0, kidDoor.a - 0.012); kidDoor.apply(); } await wait(1 / 30); }
          if (!ok(h)) return;
          kidDoor.a = kidDoor.target = 0; kidDoor.apply(); sfx.doorClose(D.pan(dp.x, dp.z), 0.25); h.shut = true; h.done = true;
        })();
        return h;
      },
      reveal: { by: 'look', at: 'door:kid', minDot: 0.5 },
      payoff: (D, h) => { h.seen = true; F.fear = Math.max(F.fear, 0.6); },
      max: 60, undo: (h) => { h.alive = false; const d = W.doors.kid; d.a = d.target = 1; d.apply(); }, end: () => n1.done(),
      after: { keep: true, log: true, journal: 'doorBehind' },
    });
    // Mom calling you sweetly from behind their door while they both snore: only where you could hear their door
    events.register({
      id: 'momCall', tier: 'wrong', minN: 1, maxN: 1, w: 1, once: true, rooms: ['hall', 'dining', 'living', 'kitchen'], uses: ['n1', 'parents'], noise: 0, anchor: 'parentsBed',
      pre: () => quiet() && ['hall', 'dining', 'living', 'kitchen'].includes(room()) && dist(n1.parD()) > 2.2 && dist(n1.parD()) < 8.5,
      arm: () => { mark('momCall'); const h = { alive: true, bed: n1.bedP() }; sfx.pick('bed_snore', { at: h.bed, gain: 1.0, wet: 0.08, ref: 2, dur: 10 }); return h; },
      reveal: { by: 'hold', hold: 3.2, when: () => dist(n1.parD()) < 9 },
      payoff: (D, h) => {
        (async () => {   // her voice placed at their door, through it (voiceAt muffles what has no line of sight)
          const dp = n1.parD();
          await wait(voiceAt('mom/n1_call_a', dp.x, dp.z, 1.1) + 0.3); if (!ok(h)) return;
          await wait(4.5); if (!ok(h)) return;
          sfx.pick('bed_snore', { at: h.bed, gain: 1.0, wet: 0.08, ref: 2, offset: 12, dur: 3.2 });   // and it stops dead when she stops
          await wait(voiceAt('mom/n1_call_b', dp.x, dp.z, 1.1) + 0.3); if (!ok(h)) return;
          F.fear = Math.max(F.fear, 0.6); h.done = true;
        })();
      },
      max: 25, undo: (h) => { h.alive = false; }, end: () => n1.done(),
      after: { keep: false, log: true, journal: 'momCall' },
    });
    // crayon on the drawing in the hall, somewhere you can hear it but not see it; the new figure is there the next time you look
    events.register({
      id: 'crayon', tier: 'wrong', minN: 1, maxN: 1, w: 1, once: true, rooms: ['hall', 'bed', 'bath', 'room2', 'spare'], uses: ['n1'], noise: 0, anchor: () => n1.drawP(),
      pre: () => quiet() && ['hall', 'bed', 'bath', 'room2', 'spare'].includes(room()) && dist(n1.drawP()) > 2.2 && dist(n1.drawP()) < 7.5 && !gaze.inView(n1.drawP()),
      arm: () => {
        mark('crayon'); const h = { alive: true, ready: false }, a3 = n1.drawP(), dpos = { x: a3.x, z: a3.z, y: 0 };
        (async () => {
          for (let i = 0; i < 6; i++) { sfx.pick('crayon', { at: a3, gain: 0.6, wet: 0.15, jitter: 0.1 }); await wait(0.8 + Math.random() * 0.8); if (!ok(h)) return; }
          await until(N1.tok, () => !ok(h) || !gaze.inView(dpos)); if (!ok(h)) return;
          F.drawn = true; W.drawingMat.map = W.T.drawing2 || (W.T.drawing2 = env.FN.drawing()); W.drawingMat.needsUpdate = true; h.ready = true;
        })();
        return h;
      },
      reveal: { by: 'look', minDot: 0.5, within: 7.5 },
      payoff: (D, h) => { F.fear = Math.max(F.fear, 0.5); h.done = true; },
      max: 90, undo: (h) => { h.alive = false; if (h.ready) { F.drawn = false; W.drawingMat.map = W.T.drawing0; W.drawingMat.needsUpdate = true; } }, end: () => n1.done(),
      after: { keep: true, log: true, journal: 'crayon' },
    });
    // the kitchen chairs pulled out, one by one, then one rocking: within earshot of the table, not looking at it
    events.register({
      id: 'chairs', tier: 'wrong', minN: 1, maxN: 1, w: 1, once: true, rooms: ['kitchen', 'dining', 'living', 'hall'], uses: ['n1', 'table'], noise: 0, anchor: 'table',
      pre: () => quiet() && ['kitchen', 'dining', 'living', 'hall'].includes(room()) && dist(n1.tableP()) > 2.0 && dist(n1.tableP()) < 9 && !gaze.inView(n1.tableP()),
      arm: () => {
        mark('chairs'); const h = { alive: true };
        (async () => {
          const C = W.chairs, mid = n1.tableP(), order = [3, 1, 0, 2], gaps = [1.2, 0.7, 1.7, 0.9];
          for (let j = 0; j < order.length; j++) {
            const i = order[j], c = C[i]; if (!c) continue;
            const hp = c.holder.position, dx = hp.x - mid.x, dz = hp.z - mid.z, l = Math.hypot(dx, dz) || 1;
            sfx.scrape(D.pan(hp.x, hp.z)); W.moveChair(i, hp.x + dx / l * 0.34, hp.z + dz / l * 0.34, c.holder.rotation.y + (j % 2 ? 0.22 : -0.18));
            await wait(gaps[j]); if (!ok(h)) return;
          }
          await wait(2.6); if (!ok(h)) return;
          env.FN.rock(2, 0.11);
          for (let i = 0; i < 150; i++) { env.FN.rockClicks((p, q) => sfx.pick('wall_knock', { at: at(p.x, 0.1, p.z), gain: 0.35 * q, wet: 0.2, lp: 1800, maxLen: 0.5 })); await wait(1 / 15); if (!ok(h)) return; }
          h.done = true;
        })();
        return h;
      },
      reveal: { by: 'look', minDot: 0.5 },
      payoff: () => { F.fear = Math.max(F.fear, 0.5); },
      max: 40, undo: (h) => { h.alive = false; W.chairs.forEach((c, i) => { if (N1.chairs0[i]) W.moveChair(i, ...N1.chairs0[i]); }); }, end: () => n1.done(),
      after: { keep: true, log: true, journal: 'chairs' },
    });
    // in the bathroom: the tap comes on by itself, and something is written in the steam on the mirror: written while the mirror is
    // off your screen, there when you face it
    events.register({
      id: 'bath', tier: 'wrong', minN: 1, maxN: 1, w: 1, once: true, rooms: ['bath'], uses: ['n1'], noise: 0, anchor: { x: 6.59, z: 1.64, y: 1.5 },
      pre: () => quiet() && room() === 'bath' && !gaze.inView(MIRROR),
      arm: () => {
        mark('bath'); const h = { alive: true, ready: false }; sfx.faucet(6, D.pan(6.42, 1.64, 1.0)); F.fear = Math.max(F.fear, 0.4);
        (async () => {
          await wait(3.2); if (!ok(h)) return;
          await until(N1.tok, () => !ok(h) || !gaze.inView(MIRROR)); if (!ok(h)) return;
          if (W.mirrorFx) W.mirrorFx.show('writing'); h.ready = true;
        })();
        return h;
      },
      reveal: { by: 'look', minDot: 0.6, within: 4 },
      payoff: (D, h) => { sfx.whisper(D.pan(6.59, 1.64, 1.5), 0.18); F.fear = Math.max(F.fear, 0.6); later(5, () => { if (W.mirrorFx) W.mirrorFx.hide(); h.done = true; }); },
      max: 40, undo: (h) => { h.alive = false; if (W.mirrorFx) W.mirrorFx.hide(); }, end: () => n1.done(),
      after: { keep: false, log: true, journal: 'bath' },
    });
    // nothing else fits where you are for a long while (a corner, the garage, outside): knocking inside the nearest wall, slow, then
    // three quick ones right by your head
    events.register({
      id: 'wall', tier: 'whisper', minN: 1, maxN: 1, w: 0.05, once: false, rooms: null, uses: ['n1'], noise: 0, anchor: (D, h) => (h ? h.p : null),
      pre: () => quiet() && since() - N1.lastEnd > 42 * K(),
      arm: () => { mark('wall'); return { alive: true, p: nearestWall(), room: room() }; },
      reveal: { by: 'hold', hold: 1.5, when: (D, h) => room() === h.room },
      payoff: (D, h) => {
        (async () => {
          for (let i = 0; i < 3; i++) { sfx.pick('wall_knock', { at: h.p, gain: 0.55, wet: 0.2, lp: 2200 }) || sfx.knock(D.wallPan(), 0.3); await wait(1.6); if (!ok(h)) return; }
          await wait(2.2); if (!ok(h)) return;
          for (let i = 0; i < 3; i++) { sfx.pick('wall_knock', { at: h.p, gain: 0.8, wet: 0.12 }) || sfx.knock(D.wallPan(), 0.4); await wait(0.22); }
          F.fear = Math.max(F.fear, 0.55); h.done = true;
        })();
      },
      max: 30, undo: (h) => { h.alive = false; }, end: () => n1.done(),
      after: { keep: false, log: true, journal: 'wall' },
    });
    // the hall photo comes down only while you are looking at it, close by: the night's one thing that moves while you watch it
    events.register({
      id: 'frame', tier: 'wrong', minN: 1, maxN: 1, w: 1, once: true, rooms: ['hall'], uses: ['watch'], noise: 0,
      anchor: () => { const hf = W.hallFrame; return hf ? { x: hf.g.position.x, z: hf.g.position.z, y: 1.3 } : null; },
      pre: () => quiet() && !!W.hallFrame && !W.hallFrame.fallen && room() === 'hall',
      arm: () => ({ alive: true }),
      reveal: { by: 'watch', hold: 1.4, when: () => n1.frameSeen() },
      payoff: (D, h) => {
        mark('frame');
        (async () => {
          const hf = W.hallFrame, fp = at(hf.g.position.x, 1.3, hf.g.position.z); F.script = true; F.fear = Math.max(F.fear, 0.6);
          if (!await n1.rampT(() => ok(h), 0.35, (q) => hf.tilt(0.1 * q))) return; sfx.creak(0.3, D.pan(fp.x, fp.z, 1.3));
          await wait(0.7); if (!ok(h)) return;
          if (!await n1.rampT(() => ok(h), 0.26, (q) => hf.pose(q))) return; hf.fall();
          sfx.pick('wall_knock', { at: at(fp.x, 0.05, fp.z), gain: 0.9, wet: 0.25, lp: 900 }) || sfx.thump();
          sfx.noiseHit({ dur: 0.3, type: 'highpass', f: 3500, gain: 0.5, wet: 0.2, pan: D.pan(fp.x, fp.z, 0.1) }); env.addShake(1.2); F.fear = 1;
          await wait(1.0); F.script = false; h.done = true;
        })();
      },
      max: 0, undo: (h) => { h.alive = false; F.script = false; if (W.hallFrame && W.hallFrame.fallen) W.hallFrame.reset(); }, end: (D, h, seen) => { if (seen) n1.done(); },
      after: { keep: true, log: true, journal: 'frame' },
    });
  }
  registerNightOne();
  // ---------- what each kind of night is about ----------
  const obj = (t) => UI.objective(t);
  const until = (t, fn) => waitFor(() => !alive(t) || fn());
  const atClock = (t, m) => until(t, () => F.clock >= m);
  const spawnFar = () => hunter.pickSpawn(9) || 'hallW';

  const TYPE_RUN = {
    // you wake up dying of thirst: the kitchen is the other end of the house
    async thirst(plan, t) {
      await atClock(t, plan.clock0 + 22); if (!alive(t)) return; obj('Get a drink from the kitchen sink');
      let done = false;
      const it = env.addI({ p: new V3(2.54, 1.1, 4.0), r: 1.7, label: 'Fill your cup', when: () => alive(t) && !done && P.mode === 'walk', act: async () => {
        F.script = true; sfx.faucet(3.2, D.pan(2.54, 4.33)); await wait(3.4); F.script = false; done = true; } });
      await until(t, () => done); env.removeI(it); if (!alive(t)) return;
      proofFire('thirst');
      obj('Go back to bed'); sfx.tension(0.04, 2); F.fear = Math.max(F.fear, 0.5);
      if (!hunter.busy) { const node = spawnFar(); hunter.stalk(node); }
      await until(t, () => P.mode === 'bunk' || P.mode === 'hide'); obj(null); completeObjective();
    },
    // the wall phone rings in the dining room
    async ring(plan, t) {
      await atClock(t, plan.clock0 + 18); if (!alive(t)) return;
      W.phone.setRinging(true); let rings = 0, answered = false, ringT = 0;
      obj('The phone is ringing. Get it before it wakes them');
      const it = env.addI({ p: W.phone.pos.clone(), r: 1.8, label: 'Pick up the phone', when: () => alive(t) && W.phone.ringing && P.mode === 'walk', act: async () => {
        answered = true; completeObjective(); F.script = true; W.phone.setRinging(false); W.phone.pickUp(); sfx.click(); obj(null);
        await wait(1.2); sfx.breath(true, 0.6); await wait(4.2);
        sfx.whisper(0, 0.24); await wait(2.4);
        sfx.staticBurst(0, 1.4); await wait(3.5);
        W.phone.hangUp(); sfx.click(); F.script = false;
        if (alive(t)) proofFire('ring');
        if (!hunter.busy) hunter.stalk(hunter.pickSpawn(7) || 'archN');
      } });
      (async () => { while (alive(t) && W.phone.ringing && rings < 11) { sfx.phoneRing(D.pan(-1.5, 0.9)); F.fear = Math.max(F.fear, 0.25); rings++; await wait(1.7); } })();
      await until(t, () => answered || rings >= 11); W.phone.setRinging(false); env.removeI(it);
      if (!answered && alive(t)) { obj(null); W.setDoor('parents', true); proofFire('ring'); }
    },
    // you wake to Dad calling you from somewhere in the dark house. Whenever you get close he is further on; the calls come out a little wrong.
    // His bed is not empty: he is asleep in it. At the end of the hall something in his pyjamas stands with its face in the corner.
    async static(plan, t) {
      await atClock(t, plan.clock0 + 4); if (!alive(t)) return;
      const stops = [
        { x: -3.4, z: 1.2, lines: ['call_a', 'call_b'] },   // by his own door, off the dining room
        { x: 1.9, z: 2.8, lines: ['call_c', 'call_a'] },    // the kitchen (the first call again, word for word)
        { x: 5.6, z: -0.5, lines: ['call_d', 'call_e'] },   // the near end of the hall
      ];
      const end = { x: 11.0, z: -0.95 }, corner = { x: 11.36, z: -1.14 };
      obj("Dad's calling you");
      for (const s of stops) {
        let i = 0, nextAt = env.time() + 1.5;
        while (alive(t)) {
          const d = Math.hypot(P.pos.x - s.x, P.pos.z - s.z);
          if (d < 4.2 || (d < 7.5 && gaze.inView({ x: s.x, z: s.z, y: 0 }))) break;
          if (env.time() >= nextAt && !F.script && !F.cutscene) { voiceAt('dad/' + s.lines[i % s.lines.length], s.x, s.z); i++; nextAt = env.time() + 7 + rnd() * 5; }
          await wait(0.2);
        }
        if (!alive(t)) return;
        sfx.footstep(0.1, D.pan(s.x, s.z), 0.4); await wait(0.8);   // a soft step, going on ahead
      }
      const fd = double('dad'); const tr = env.time(); await until(t, () => fd.rig || env.time() - tr > 8); if (!alive(t)) return;
      standDouble(fd, end.x, end.z, Math.atan2(corner.x - end.x, corner.z - end.z));
      voiceAt('dad/call_f', end.x, end.z, 0.9);
      let seen = false; const t0 = env.time();
      while (alive(t) && env.time() - t0 < 90) {
        const d = Math.hypot(P.pos.x - end.x, P.pos.z - end.z);
        if (d < 2.0 && hunter.los(P.pos.x, P.pos.z, end.x, end.z) && !hidden()) { seen = true; break; }
        await wait(0.1);
      }
      if (alive(t) && seen) {   // it was never Dad: it turns round, the lights go, and it comes for you
        completeObjective(); achievements.unlock('NOT_DAD'); F.script = true; obj(null);
        const g = fd.group, y0 = g.rotation.y, y1 = Math.atan2(P.pos.x - end.x, P.pos.z - end.z);
        await tween(0.55, (k) => { g.rotation.y = lerpAngle(y0, y1, k * k); });
        env.nlMult(0, false); sfx.pianoSlam(1.6); env.addShake(0.8); revealed(); g.visible = false;
        E.root.position.set(end.x, 0, end.z); E.faceTowards(P.pos.x, P.pos.z, 1);
        await wait(0.6); F.script = false; env.nlMult(1, false);
        if (alive(t)) hunter.hunt(nearestNode(end.x, end.z) || 'hallE');
      }
      fd.group.visible = false; obj(null);
      if (alive(t)) proofFire('static');
    },
    // Mom calls you from the kitchen
    async mimic(plan, t) {
      await atClock(t, plan.clock0 + 24); if (!alive(t)) return;
      obj("That's Mom's voice, but she's in bed. Don't go to the kitchen"); const t0 = env.time(); let lured = false, n = 0;
      while (alive(t) && !lured && env.time() - t0 < 100) {
        if (n++ % 3 === 0 && !hidden()) env.say(n % 2 ? 'mom/mimic_a' : 'mom/mimic_b', { muffle: Math.hypot(P.pos.x - 2.09, P.pos.z - 2.32) > 6 });
        for (let i = 0; i < 70 && alive(t) && !lured; i++) { await wait(0.1); if (Math.hypot(P.pos.x - 1.64, P.pos.z - 1.98) < 2.7 && hunter.los(P.pos.x, P.pos.z, 1.64, 1.98)) lured = true; }
      }
      obj(null); if (!alive(t)) return; F.objOk = !lured;
      if (lured) {
        F.script = true; D.flicker(1.6); env.nlMult(0, false); sfx.stab(); env.addShake(0.7);
        await wait(0.9); env.say('mom/mimic_c'); F.script = false;
        hunter.hunt('archN');
      } else if (!hunter.busy) hunter.stalk(spawnFar());
      if (alive(t)) proofFire('mimic');
    },
    // the power fails: find the breaker in the detached garage
    async blackout(plan, t) {
      await atClock(t, plan.clock0 + 5); if (!alive(t)) return;
      D.blackout(true); sfx.pop(); UI.flash('rgba(0,0,0,0.5)', 0.5); await wait(5); if (!alive(t)) return;
      obj('Find the breaker in the detached garage <span>(your flashlight: ' + env.lightLabel() + ')</span>');
      let fixed = false;
      const it = env.addI({ p: new V3(-9.68, 1.45, -7.1), r: 1.7, label: 'Flip the breaker', when: () => alive(t) && !fixed && P.mode === 'walk', act: async () => {
        F.script = true; sfx.click(); await wait(0.5); sfx.thump(); fixed = true; completeObjective(); D.blackout(false); obj(null); await wait(2.5); F.script = false;
        hunter.hunt(hunter.pickSpawn(7) || 'livC');
      } });
      await until(t, () => fixed); env.removeI(it);
      if (alive(t)) proofFire('blackout');
    },

    // NIGHT ONE: the house wakes up. Nothing is ever seen; things creep and move, and at the end everything stops and something walks around your bunk.
    // Night one: one presence, learning the house. It is never seen (once, maybe, in a camera flash) and it never kills. It goes quiet; it
    // turns off the hall light Mom left on; it lies down in the bottom bunk under you and breathes in time with you; it walks up the hall
    // and stands at your door; it calls you in Mom's voice while she snores; it draws itself into the drawing; it sits down at the table;
    // and at the end it comes to the bed. Its beats are on the engine's table (registerNightOne, below): each says where it fits, is armed
    // out of view and revealed by what you do, and the night moves on by what you have been through, not by the time
    async poltergeist(plan, t) {
      if ((window.__clockMul || 1) > 50) return;   // the tests run the clock fast to reach dawn and the save; the script is real time
      director.stop(); F.holdDawn = true;
      const FN = env.FN, { since, room, inBunk, mark, hallOn, rampT, spotNear, at } = n1;
      const free = () => !F.script && !F.cutscene && P.mode !== 'cine';
      if (W.hallFrame) W.hallFrame.reset();
      // the evening: your boxes unpacked and stacked on the floor, the box that was not yours gone (Dad took it out), your door open, the hall light on
      tidyKidBoxes(); FN.box.hide(); FN.dent.set(0); if (FN.renderer) FN.covers.warm(FN.renderer);
      {
        // your door: open, or (after Dad's goodnight) the crack he left it at. That crack does not last: once you have looked at it and
        // then away, it stands open, without a sound
        const d = W.doors.kid, crack = !!F.doorCrack; F.doorCrack = false;
        d.a = d.target = crack ? 0.15 : 1; d.apply();
        if (crack) { const m = new V3(d.mid.x, 1.2, d.mid.z); gaze.whenLookAt(m, () => gaze.whenLookAway(m, () => { if (alive(t) && d.a < 0.25) { d.a = d.target = 1; d.apply(); } }, 1.2), 0.85); }
      }
      const hall = [W.nightLights[0], W.nightLights[1]].filter(Boolean);
      for (const n of hall) n.dead = false; env.nlMult(1, false);
      // the night's state the beats read (n1 helpers close over N1)
      const k = window.__n1fast || 1;   // the scenario tests shorten the waits for the player, never the animation
      Object.assign(N1, { live: true, silenced: false, exp: 0, lastEnd: 0, t0: env.time(), k, hall, chairs0: W.chairs.map((c) => [c.holder.position.x, c.holder.position.z, c.holder.rotation.y]), amb0: sfx.ambLevel ?? 1, breathing: false, dentOn: false, dentSeen: false, tok: t });
      const log1 = (window.__n1log = []); N1.log = log1;
      window.__n1rooms = Object.fromEntries(events.defs().filter((d) => d.rooms !== undefined && d.maxN === 1).map((b) => [b.id, b.rooms]));
      events.setGapScale(k); events.suspend(false);
      const restore = () => {
        sfx.ambience(N1.amb0, 3); if (W.clock) W.clock.silent = false; F.flicker = false;
        W.chairs.forEach((c, i) => W.moveChair(i, ...N1.chairs0[i])); FN.covers.stop(); E.post = null; FN.dent.set(0);
        F.flashFx = null; F.holdDawn = false; N1.live = false;
      };
      events.NIGHT.cleanup.push(() => { N1.live = false; F.flashFx = null; });
      // ---- the camera: the first flash tonight shows it at the end of whatever you are pointing at, for as long as the flash lasts;
      // the print shows it nearer than it was
      let flashed = false, spot = null;
      const showE = (p) => { E.visible = true; E.mode = 'idle'; E.root.scale.setScalar(1); E.snap = 0; E.root.position.copy(p); E.faceTowards(camera.position.x, camera.position.z, 1); E.lookTarget = camera.position; E.update(0.0001); };
      const flashSpot = () => {
        camera.getWorldDirection(tmp); const l = Math.hypot(tmp.x, tmp.z); if (l < 0.6 || P.mode !== 'walk') return null;
        const ux = tmp.x / l, uz = tmp.z / l, x0 = camera.position.x, z0 = camera.position.z;
        let d = 0.5;
        for (; d < 9; d += 0.12) {
          const x = x0 + ux * d, z = z0 + uz * d;
          if (W.colliders.some((c) => c.on !== false && x > c.minX && x < c.maxX && z > c.minZ && z < c.maxZ && (c.minY === undefined || (P.pos.y + 1 >= c.minY && P.pos.y + 1 <= c.maxY)))) break;
        }
        if (d < 3.4) return null;
        const far = d - 0.6, near = Math.max(1.5, far * 0.42);
        return { far: new V3(x0 + ux * far, P.pos.y, z0 + uz * far), near: new V3(x0 + ux * near, P.pos.y, z0 + uz * near) };
      };
      F.flashFx = (stage) => {
        if (flashed || !alive(t)) return 0;
        if (stage === 'print') { spot = flashSpot(); if (spot) showE(spot.near); return 0; }
        if (stage === 'after' && spot) {
          flashed = true; showE(spot.far); F.fear = 1; mark('flash');
          setTimeout(() => { if (!flashed || F.dead) return; hideE(); }, 240);
          later(0.5, () => { sfx.ambience(0, 0.1); later(4, () => { if (alive(t) && !F.script) sfx.ambience(N1.lastEnd > 15 ? 0 : N1.amb0, 2); }); });
          return 240;
        }
        return 0;
      };

      // run the night: the engine arms a beat whenever one fits where you are and you have settled, until you have been through enough of them
      const ENOUGH = 5;
      await until(t, () => !N1.hold && ((N1.exp >= ENOUGH && gaze.settled(12 * k)) || (N1.exp >= 3 && since() > 420 * k && gaze.settled(8 * k))));   // a long night in one spot still ends
      if (!alive(t)) return;
      events.suspend(true);
      for (const a of events.test.active()) events.finish(a.id);   // whatever is still armed is over: the end is coming

      // ---- the end: it comes to wherever you are. Night one never kills
      mark('crescendo'); log.push({ id: 'crescendo', seen: true, how: 'end' });
      F.script = true; UI.hint(null); sfx.drone(0, 1.5); sfx.ambience(0, 0.6);
      await wait(3.5); if (!alive(t)) return;
      for (const d of Object.keys(W.doors)) if (d !== 'kid' && d !== 'parents') W.setDoor(d, false);
      if (env.lights) env.lights.allOff({ silent: true });
      env.nlMult(0, false); F.flicker = true; sfx.slamFar(D.pan(W.doors.bath.mid.x, W.doors.bath.mid.z)); sfx.slamFar(D.pan(W.doors.back.mid.x, W.doors.back.mid.z)); sfx.pianoSlam(0.9); env.addShake(0.9); F.fear = 1;
      F.script = false;
      if (P.mode === 'bunk') {
        // in the bunk, uncovered: it is coming up the hall. How to get under the covers, once, now that it matters
        if (!F.coverTaught) { F.coverTaught = true; UI.hint(`Hold <b>${L('breath')}</b> to pull the covers over your head`, 6); }
        const path = [[5.9, -0.41], [6.6, -0.38], [7.3, -0.35], [8.0, -0.3], [8.7, -0.26], [9.3, -0.22]];
        for (const [x, z] of path) { sfx.heavyStep(0.75, D.pan(x, z)); await wait(1.2); if (!alive(t) || P.mode !== 'bunk') break; }
        if (!alive(t)) return;
      }
      F.script = true;
      if (P.mode === 'hide' && !P.pod) { mark('covers'); await atTheBed(); }
      else if (P.mode === 'hide') { mark('pod'); await pastThePod(); }
      else if (P.mode === 'bunk') { mark('bedside'); await atTheBedside(); }
      else { mark('inRoom'); await inTheRoom(); }
      if (!alive(t)) return;
      await momFindsYou();
      restore();
      if (alive(t)) { F.script = false; F.clock = DAWN; }

      // under the covers: it walks in, its shadow comes into the light on the blanket, it bends over you, a hand comes down and the
      // fingers press in, the corner by your face lifts and an eye is there; and then the hall light snaps on and it is gone
      async function atTheBed() {
        const C = FN.covers, s = C.s, BS = FN.bedside, ok = () => alive(t);
        UI.blanket(false); C.start(camera.position.clone(), 0);
        sfx.pick('cloth', { gain: 0.35, wet: 0.02, at: at(8.4, 1.6, 3.9) });
        if (!await rampT(ok, 1.6, (q) => { s.light = 0.75 * q; })) return;
        F.breathUI = true; F.breathTeach = true; F.breathCheck = true; F.grace = 2.4;
        if (!F.breathTaught) { F.breathTaught = true; UI.hint(`Hold <b>${L('breath')}</b> (or tap it once) and don't let go`, 8); }
        // it comes in from the door and stops at the side of the bed, between the hall light and you: you see it come into the light
        // on the cloth as a shadow
        const door = W.doors.kid, stand = new V3(8.25, 0, 3.08), from = new V3(door.mid.x - 0.1, 0, door.mid.z + 0.5);
        E.visible = true; E.mode = 'walk'; E.speed = 0.4; E.root.scale.setScalar(1); E.lean = 0; E.reach = 0; E.snap = 0; E.lookTarget = null; E.root.position.copy(from);
        E.post = BS.post(E); BS.set({ clear: { eye: camera.position.clone(), r: 0.88 } });   // its head (the face reaches well forward of the bone) never into the cloth
        for (let i = 0; i < 3; i++) {
          const a0 = E.root.position.clone(), a1 = from.clone().lerp(stand, (i + 1) / 3);
          E.faceTowards(a1.x, a1.z, 1); sfx.heavyStep(0.85, D.pan(a1.x, a1.z)); env.addShake(0.12);
          if (!await rampT(ok, 1.3, (q) => { E.root.position.lerpVectors(a0, a1, q); })) return;
        }
        E.mode = 'idle'; E.faceTowards(8.38, 4.0, 1);   // square to the bunk
        await wait(1.6); if (!alive(t)) return;
        sfx.pick('breath', { at: at(8.62, 2.2, 3.1), gain: 0.55, rate: 0.72, wet: 0.04 });
        // it bends down over the bunk, over you, and looks at where you are under it
        E.lookTarget = camera.position;
        if (!await rampT(ok, 4.4, (q) => { E.lean = 0.95 * q * q * (3 - 2 * q); })) return;
        sfx.whisper(D.pan(8.62, 3.1, 2.0), 0.45); F.fear = 1;
        await wait(1.4); if (!alive(t)) return;
        // its hand comes down onto the cloth over your face, the fingertips touching, then pressing in
        // (the target is the middle fingertip: on the cloth, then pressed in)
        const touch = C.at(0.3, 0.05, 0.43), out = touch.clone().sub(camera.position).normalize(), wrist = (push) => touch.clone().addScaledVector(out, 0.012 - push);
        const high = wrist(-0.4).add(new V3(0.1, 0.3, -0.1)), tgt = new V3();
        if (!await rampT(ok, 2.8, (q) => { BS.set({ reach: tgt.copy(high).lerp(wrist(0.03), q * q * (3 - 2 * q)) }); C.dimple(BS.fingertips(E)); })) return;
        sfx.pick('cloth', { gain: 0.6, wet: 0.02, rate: 0.85, at: at(8.4, 1.6, 3.9) }); env.addShake(0.25);
        if (!await rampT(ok, 3.2, (q) => { BS.set({ reach: tgt.copy(wrist(0.03 + 0.07 * q)) }); C.dimple(BS.fingertips(E)); })) return;   // aimed through the cloth: the hand presses in and the cloth gives under it
        for (let i = 0; i < 50; i++) { C.dimple(BS.fingertips(E)); await wait(0.04); if (!alive(t)) return; }
        // the corner by your face lifts, and its face is there in the gap, close, looking in at you
        sfx.pick('cloth', { gain: 0.5, wet: 0.02, rate: 0.7, at: at(8.4, 1.6, 3.9) });
        const face = C.at(0.62, -0.2, 0.86), keep = BS;   // its eyes in the gap
        if (!await rampT(ok, 3.4, (q) => { const e = q * q * (3 - 2 * q); s.lift = 0.95 * e; keep.set({ reach: e > 0.25 ? C.at(-0.6, 0.5, 0.95) : wrist(0.1), head: e > 0.25 ? face : null, clear: e > 0.25 ? null : { eye: camera.position.clone(), r: 0.88 } }); C.dimple(BS.fingertips(E)); })) return;   // the hand lets go and draws back; the face comes down to the gap
        W.faceLight.position.copy(C.at(0.52, -0.02, 0.55)); W.faceLight.intensity = 0.9; W.faceLight.distance = 1.4;
        sfx.heartbeat(0.75);
        for (let i = 0; i < 90; i++) { C.dimple(BS.fingertips(E)); await wait(0.04); if (!alive(t)) return; }
        // the hall light snaps on, and it is gone
        F.breathCheck = false; F.breathTeach = false; F.breathUI = false; UI.hint(null);
        E.post = null; hideE(); C.dimple([]); s.lift = 0; W.faceLight.intensity = 0;
        hallOn(); s.warm = 1; s.light = 1;
        await wait(1.0);
      }
      async function pastThePod() {   // hidden somewhere else: it walks past, close, and stops, and goes
        F.breathUI = true; F.breathTeach = true; F.breathCheck = true; F.grace = 2.4;
        if (!F.breathTaught) { F.breathTaught = true; UI.hint(`Hold <b>${L('breath')}</b> (or tap it once) and don't let go`, 8); }
        const pod = PODS[P.pod], px = pod ? pod.front[0] : P.pos.x, pz = pod ? pod.front[2] : P.pos.z;
        for (let i = 0; i < 6; i++) { const s = (i - 2.5) * 0.7; sfx.heavyStep(0.8, D.pan(px + s, pz + s * 0.3)); if (i === 3) sfx.whisper(D.pan(px, pz, 1.6), 0.35); F.fear = 1; await wait(1.5); if (!alive(t)) return; }
        F.breathCheck = false; F.breathTeach = false; F.breathUI = false; UI.hint(null); hallOn();
      }
      // it walks from p0 toward you and stops `stop` metres off; quits when you are out of reach for long. Returns false if the night ended
      async function approach(p0, stop, maxT = 14) {
        E.visible = true; E.mode = 'walk'; E.speed = 0.45; E.root.scale.setScalar(1); E.lean = 0; E.reach = 0; E.snap = 0; E.lookTarget = null; E.root.position.copy(p0);
        const t0 = env.time(); let st = 0;
        while (alive(t) && env.time() - t0 < maxT) {
          const e = E.root.position, dx = P.pos.x - e.x, dz = P.pos.z - e.z, d = Math.hypot(dx, dz) || 1;
          if (d <= stop) break;
          const v = Math.min(d - stop, 0.95 / 30), nx = e.x + dx / d * v, nz = e.z + dz / d * v;
          if (solidAt(nx, nz) || blocked(e.x, e.z, nx, nz)) break;   // furniture or a wall in the way: it stands where it is
          e.x = nx; e.z = nz; E.faceTowards(P.pos.x, P.pos.z, 0.25);
          if ((st += v) > 0.7) { st = 0; sfx.heavyStep(0.7, D.pan(e.x, e.z)); env.addShake(0.08); }
          await wait(1 / 30);
        }
        E.mode = 'idle'; return alive(t);
      }
      // in the bunk, uncovered: it walks in, stands at the rail level with your face, and leans in until it is all you can see
      async function atTheBedside() {
        const door = W.doors.kid, from = new V3(door.mid.x - 0.1, 0, door.mid.z + 0.5), stand = new V3(8.25, 0, 3.08), ok = () => alive(t);
        E.visible = true; E.mode = 'walk'; E.speed = 0.4; E.root.scale.setScalar(1); E.lean = 0; E.snap = 0; E.root.position.copy(from);
        for (let i = 0; i < 3; i++) {
          const a0 = E.root.position.clone(), a1 = from.clone().lerp(stand, (i + 1) / 3);
          E.faceTowards(a1.x, a1.z, 1); sfx.heavyStep(0.85, D.pan(a1.x, a1.z)); env.addShake(0.12);
          if (!await rampT(ok, 1.3, (q) => { E.root.position.lerpVectors(a0, a1, q); })) return;
          if (P.mode === 'hide' && !P.pod) { hideE(); await atTheBed(); return; }   // you got under in time: it finds you there
        }
        E.mode = 'idle'; E.lookTarget = camera.position; E.faceTowards(camera.position.x, camera.position.z, 1);
        sfx.pick('breath', { at: at(stand.x, 2.1, stand.z), gain: 0.6, rate: 0.72, wet: 0.04 });
        if (!await rampT(ok, 3.2, (q) => { E.lean = 0.7 * q * q * (3 - 2 * q); })) return;
        sfx.whisper(D.pan(stand.x, stand.z, 1.9), 0.5); F.fear = 1; await wait(1.8); if (!alive(t)) return;
        if (!D.revealCool()) { revealed(); sfx.pianoSlam(1); }
        env.addShake(0.6); F.flicker = true; await wait(0.25); hideE(); await wait(0.6);
      }
      // anywhere else: it comes into the room you are in. Cover your face and it stands over you, breathing, and goes; look at it
      // and it comes right up to your face first
      async function inTheRoom() {
        const p0 = spotNear(3.2, 5.2) || spotNear(2.2, 3.2) || (gaze.behind(1.6, 3.6, { strict: false }) || new V3(P.pos.x + 2.4, P.pos.y, P.pos.z)), ok = () => alive(t);
        if (!F.coverFaceTaught) { F.coverFaceTaught = true; UI.hint(`Hold <b>${L('breath')}</b> to cover your face`, 6); }
        let covered = false;
        const cover = () => { const c = env.holding(); if (c !== covered) { covered = c; UI.fade(c ? 0.94 : 0, c ? 0.25 : 0.4); } return c; };
        const watch = setInterval(cover, 50);
        try {
          if (!await approach(p0, 1.5)) return;
          E.lookTarget = camera.position; sfx.pick('breath', { at: at(E.root.position.x, 2.0, E.root.position.z), gain: 0.65, rate: 0.72, wet: 0.05 });
          if (!await rampT(ok, 2.6, (q) => { E.lean = 1.0 * q * q * (3 - 2 * q); })) return;   // it looms, bending over you
          const t1 = env.time(); let held = 0;
          while (alive(t) && env.time() - t1 < 6) { held = covered ? held + 1 / 30 : 0; await wait(1 / 30); if (held > 3.2) break; }
          if (!alive(t)) return;
          if (covered) {   // it straightens, and goes: the steps going away, and quiet
            await rampT(ok, 1.4, (q) => { E.lean = 1.0 * (1 - q); });
            const e = E.root.position, back = new V3(e.x - (P.pos.x - e.x), 0, e.z - (P.pos.z - e.z));
            for (let i = 0; i < 4; i++) { sfx.heavyStep(0.6 - i * 0.1, D.pan(back.x, back.z)); await wait(0.9); }
            hideE();
          } else {   // you watched it: it comes up to your face
            sfx.whisper(D.pan(E.root.position.x, E.root.position.z, 1.9), 0.55); await rampT(ok, 1.1, (q) => { E.lean = 1.0 + 0.8 * q * q * (3 - 2 * q); });   // and bends right down until its face is at yours
            if (!D.revealCool()) { revealed(); sfx.pianoSlam(1); }
            env.addShake(0.7); F.fear = 1; F.flicker = true; await wait(0.25); hideE();
          }
          await wait(0.8);
        } finally { clearInterval(watch); if (covered) UI.fade(0, 0.4); }
      }
      // Mom, in the doorway in her night things, the hall light behind her: "Bud? You okay?" ... "Who were you talking to?"
      async function momFindsYou() {
        mark('mom'); log.push({ id: 'momFindsYou', seen: true, how: room() === 'bed' || inBunk() ? 'door' : 'room' }); hallOn(); F.flicker = false;
        if (room() === 'bed' || inBunk()) { await momAtTheDoor(); return; }
        if (P.mode === 'hide' && P.pod) await exitHide();
        mom.sleeping = false; mom.busy = true; mom.pose = null; if (mom.group.rotation.order === 'YXZ') mom.group.rotation.order = 'XYZ';
        mom.setNight(true); mom.group.visible = true;
        const p0 = spotNear(3.0, 4.6) || spotNear(2.0, 3.0) || new V3(P.pos.x + 2.2, 0, P.pos.z);
        mom.group.position.set(p0.x, P.pos.y, p0.z); mom.lookAt = camera.position;
        if (mom.rig) mom.rig.play('walk', { fade: 0.2, speed: 0.8 });
        sfx.footstep(0.25, D.pan(p0.x, p0.z));
        const g = mom.group.position, t0 = env.time(); let st = 0;
        while (alive(t) && env.time() - t0 < 8) {
          const dx = P.pos.x - g.x, dz = P.pos.z - g.z, d = Math.hypot(dx, dz) || 1; if (d < 1.25) break;
          const v = Math.min(d - 1.25, 1.0 / 30); g.x += dx / d * v; g.z += dz / d * v; env.faceTo(mom, P.pos.x, P.pos.z);
          if ((st += v) > 0.7) { st = 0; sfx.footstep(0.22, D.pan(g.x, g.z)); }
          await wait(1 / 30);
        }
        if (!alive(t)) return;
        env.faceTo(mom, P.pos.x, P.pos.z); if (mom.rig) mom.rig.play('idle', { fade: 0.3, speed: 1 });
        await env.say('mom/n1_door_a'); if (!alive(t)) return;
        await wait(0.9); if (!alive(t)) return;
        await env.say('mom/n1_door_b'); if (!alive(t)) return;
        await wait(1.8);
        UI.fade(1, 2.2); await wait(2.5);
        mom.busy = false; mom.lookAt = null; mom.group.visible = false;
        env.toBunk();   // she walks you back to bed
      }
      async function momAtTheDoor() {
        const door = W.doors.kid; door.a = door.target = 1; door.apply();
        mom.sleeping = false; mom.busy = true; mom.pose = null; if (mom.group.rotation.order === 'YXZ') mom.group.rotation.order = 'XYZ';
        mom.setNight(true); mom.group.visible = true; mom.group.position.set(door.mid.x + 0.02, 0, door.mid.z + 0.42);
        env.faceTo(mom, 8.5, 3.4); mom.lookAt = camera.position; if (mom.rig) mom.rig.play('idle', { fade: 0, speed: 1 });
        const first = env.say('mom/n1_door_a');
        await wait(0.3);
        FN.covers.stop(); UI.blanket(false); F.breathUI = false;
        if (P.mode === 'hide' && P.pod) await exitHide();
        else if (P.mode === 'hide' || P.mode === 'bunk') {   // you come out from under it and sit up, and she is there
          P.mode = 'cine'; P.cam.copy(camera.position); const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch;
          const head = mom.head.getWorldPosition(new V3()), to = env.BUNK_SEAT, want = Math.atan2(-(head.x - to.x), -(head.z - to.z)), up = Math.atan2(head.y - to.y, Math.hypot(head.x - to.x, head.z - to.z));
          await tween(1.3, (q) => { P.cam.lerpVectors(from, to, q); P.yaw = lerpAngle(y0, want, q); P.pitch = lerp(p0, up, q); });
        }
        await first; if (!alive(t)) return;
        await wait(0.9); if (!alive(t)) return;
        await env.say('mom/n1_door_b'); if (!alive(t)) return;
        await wait(1.8);
        UI.fade(1, 2.2); await wait(2.5);
        mom.busy = false; mom.lookAt = null; mom.group.visible = false;
        if (P.mode === 'cine') env.toBunk();
      }
    },
    // the end: it comes down the hall, and they see it too
    async finale(plan, t) {
      await atClock(t, 316); if (!alive(t)) return;
      director.stop(); const t0 = env.time();   // no more tricks: whatever is hunting you gets a little while to finish, then the end begins
      await until(t, () => (!hunter.busy && !F.script && !F.cutscene) || env.time() - t0 > 40);
      if (!alive(t)) return; if (hunter.busy && hunter.state !== 'loom') hunter.dismiss(); await until(t, () => !F.script && !F.cutscene); if (!alive(t)) return;
      if (await env.finaleScene()) return;   // the game is over: the end screen takes it from here
      if (!alive(t)) return; F.holdDawn = false; F.clock = DAWN;
    },
    // the power is out, one candle in the hall, and grandpa in a chair at the far end of it
    vigil(plan, t) { director.stop(); return env.vigil.run(plan, (fn) => until(t, fn)).then(() => { if (alive(t)) { achievements.unlock('GRANDPA'); proofFire('vigil'); completeObjective(); } }); },
    // you fall asleep and dream a drive to the store
    async car(plan, t) {
      await atClock(t, plan.clock0 + 10); if (!alive(t)) return;
      if (P.mode === 'walk' && !hidden()) { obj('Go back to bed'); await until(t, () => P.mode === 'bunk' || P.mode === 'hide' || F.clock > plan.clock0 + 70); obj(null); if (!alive(t)) return; }
      await until(t, () => !F.script && !F.cutscene); if (!alive(t)) return;
      if (P.mode === 'walk') env.toBunk();
      await env.carDream(); if (alive(t)) { completeObjective(); achievements.unlock('GLOVE_BOX'); }   // opening it gets you caught
    },
    async hunted(plan, t) { await atClock(t, plan.clock0 + 8); if (!alive(t)) return; obj('Stay alive until six'); await wait(7); if (alive(t)) obj(null); await atClock(t, 354); if (alive(t)) completeObjective(); },
    // some doors are open that were shut: close them all
    async quiet(plan, t) {
      await atClock(t, plan.clock0 + 10); if (!alive(t)) return;
      const names = ['room2', 'bath', 'kid'].filter((d) => W.doors[d]);
      for (const d of names) W.setDoor(d, true);
      sfx.creak(0.2, D.pan(4.2, -1.0)); obj('Every door in the hall is open. Shut them');
      const shut = () => names.every((d) => W.doors[d].target === 0);
      (async () => { await until(t, () => shut() && P.mode === 'walk'); if (alive(t)) { obj(null); completeObjective(); } })();
      for (let i = 0; i < 9 && alive(t); i++) { await wait(14); if (!alive(t)) return; sfx.heartbeat(0.25 + i * 0.05); F.fear = Math.max(F.fear, 0.15 + i * 0.05); }
    },
    // sleep paralysis: you wake and cannot move, and it is standing at the foot of the bunk
    async paralysis(plan, t) {
      completeObjective();
      await atClock(t, plan.clock0 + 6); if (!alive(t)) return;
      if (P.mode === 'walk' || hunter.busy) return;   // you are already up: it does not happen tonight
      F.script = true; F.cutscene = true;
      const lie = new V3(8.38, 1.9, 4.0); P.mode = 'cine'; P.cam.copy(lie);
      sfx.tension(0.05, 2); sfx.drone(0.15, 2);
      await wait(4); if (!alive(t)) return;
      E.visible = true; E.mode = 'idle'; E.tilt = 0.5; E.lookTarget = camera.position; E.smileScale = 1; E.root.position.set(10.15, 0, 4.0); E.root.rotation.y = -Math.PI / 2;
      P.yaw = -Math.PI / 2 + 0.3; sfx.stab(); env.addShake(0.6); F.fear = 1;
      for (const x of [9.75, 9.4, 9.15, 9.05]) { await wait(2.0); E.root.position.x = x; D.flicker(0.25); sfx.heavyStep(0.5, 0); F.fear = 1; }
      await wait(2.5); sfx.violins(1, 0.2); await wait(2.2); sfx.violins(0, 0.05); sfx.ceilingThump();
      E.visible = false; F.cutscene = false; P.mode = 'bunk'; P.cam.copy(env.BUNK_SEAT); P.yaw = 0.2; F.script = false;
    },
    // your bear is not on the bunk
    async teddy(plan, t) {
      await atClock(t, plan.clock0 + 12); if (!alive(t)) return;
      const spots = [[7.63, 0.02, -0.42, 'in the hall'], [1.03, 0.98, 4.22, 'on the kitchen counter'], [-4.63, 0.02, 0.75, "in Mom and Dad's room"], [-1.94, 0.5, -2.15, 'on the couch'], [6.11, 0.02, 2.43, 'on the bathroom floor']];
      const s = pick(rnd, spots); W.moveTeddy(s[0], s[1], s[2]); let got = false; obj('My bear is gone. Find it');
      // reach is measured from your eyes, so the prompt point stays at least 0.75 m up or a bear on the floor would be out of it
      const it = env.addI({ p: new V3(s[0], Math.max(s[1] + 0.15, 0.75), s[2]), r: 1.4, label: 'Pick up the bear', when: () => alive(t) && !got && P.mode === 'walk', act: () => { got = true; W.teddy.visible = false; sfx.thump(); } });
      await until(t, () => got); env.removeI(it); if (!alive(t)) return;
      proofFire('teddy', s);
      obj('Put it back on the bunk'); sfx.tension(0.05, 2); await wait(3);
      if (!hunter.busy) hunter.stalk(spawnFar());
      await until(t, () => P.mode === 'bunk' || P.mode === 'hide'); W.teddy.setDown(9.08, 0.55, 3.98); sfx.thump(); obj(null); completeObjective();
    },
    // something is in your parents' room
    async parents(plan, t) {
      await atClock(t, plan.clock0 + 30); if (!alive(t)) return;
      W.setDoor('parents', true); sfx.creak(0.3, D.pan(-2.72, 1.14)); obj('Check on Mom and Dad');
      await until(t, () => env.roomAt(P.pos.x, P.pos.z) === 'parents' || (Math.hypot(P.pos.x + 2.3, P.pos.z - 1.14) < 1.3 && hunter.los(P.pos.x, P.pos.z, -5.0, 0.75)));
      if (!alive(t)) return; obj(null); completeObjective();
      F.script = true; sfx.tension(0.06, 1); await wait(0.8);
      hunter.sight('pFoot', { dur: 14, facing: [-3.4, 1.14], turnDist: 2.4, chase: true, stab: false });
      F.script = false;
    },
  };

  const nights = { freeNight, dawn, tick, hunter, director, D, PODS, hidden, enterPod, exitHide, canComeOut, TYPE_RUN, startHunt, proof, plan: planFor,
    stage: { SCARES, gaze, ST, crawlAt, photoTaken, endStage, tick: stageTick, double, get ws() { return ws; } } };
  // the night engine is a plain module, imported here rather than hooked (js/hooks.js): it is installed with the night's own context
  events.install({ F, P, W, E, RUN: env.RUN, sfx, UI, camera, lights: env.lights, hunter, gaze, hooks, nights });
  return nights;
}
