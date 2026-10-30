// Nights two to ten: you are in your bunk at night with the whole house to explore, a clock that runs toward dawn, a seeded plan of what happens,
// something hunting you through the house, and places to hide.
import * as THREE from 'three';
import { createHunter } from './hunter.js';
import { createDirector, makePlan, TYPE_NAMES } from './director.js';
import { NODES, nearestNode } from './nav.js';
import { pick } from './rng.js';
import { achievements } from './achievements.js';

const DAWN = 360;   // minutes after midnight

export function createNights(env) {
  const { P, F, W, E, sfx, UI, camera, mom, dad, L } = env;
  const { clamp, lerp, lerpAngle, tween, wait, waitFor, later } = env;
  const V3 = THREE.Vector3, tmp = new V3();
  let rnd = Math.random, tok = 0;
  const alive = (t) => t === tok && F.live && !F.dead;

  // ---------- the places you can hide ----------
  const PODS = {
    closet_kid: { label: 'Hide in the closet', stand: [5.95, 0.98], cam: [5.85, 1.05, 0.04], yaw: Math.PI, overlay: 'louvers', node: 'kidCloset', look: [5.85, 0.2], front: [5.85, 1.0, 0.46] },
    closet_parents: { label: "Hide in Mom and Dad's closet", stand: [6.65, -2.6], cam: [6.47, 1.05, -1.88], yaw: 0, overlay: 'louvers', node: 'pClos', look: [6.47, -1.95], front: [6.47, 1.0, -2.18] },
    closet_room2: { label: 'Hide in the closet', stand: [4.97, -2.5], cam: [4.97, 1.05, -1.88], yaw: 0, overlay: 'louvers', node: 'r2Closet', look: [4.97, -1.95], front: [4.97, 1.0, -2.18] },
    tub: { label: 'Hide behind the shower curtain', stand: [4.45, 2.35], cam: [4.16, 0.85, 3.12], yaw: 0, overlay: 'curtain', node: 'bathTub', look: [4.16, 3.1], front: [4.3, 1.0, 2.55] },
    bunk: { node: 'kidBunk', look: [6.03, 3.02] },
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
    F.cutscene = false; P.mode = 'hide'; env.enteredHide(); UI.pod(pod.overlay); if (id === 'tub') W.curtainSee(true);
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
  const canComeOut = () => !hunter.busy || (hunter.state === 'leave' && hunter.gap() > 7) || (hunter.state === 'search' && hunter.gap() > 9);

  // ---------- the thing ----------
  const hunter = createHunter({
    E, W, sfx, P, F, camera, pods: PODS, hidden, holding: env.holding, caught: env.caught, panFor: env.panFor, now: env.time, addShake: env.addShake,
    flicker: (s) => D.flicker(s),
    onVanish: () => { UI.hint(null); },
    onHunt: () => { UI.hint(`Hold <b>${L('sprint')}</b> to run. Break its line of sight. Hide.`, 5); },
    onTurn: () => { F.fear = 1; env.addShake(0.5); },
    survived: () => { UI.hint(null); F.fear = 0.3; env.addShake(0.2); },
    hint: () => { UI.hint(`Hold <b>${L('breath')}</b> to hold your breath (tap it once to keep holding)`, 8); },
  });

  // ---------- helpers every event can use (see director.js) ----------
  const D = {
    r: () => rnd(), P, F, W, E, sfx, UI, camera, hunter,
    now: env.time, wait, waitFor, later, say: env.say, sub: (h, d = 3) => UI.subtitle(h, d),
    shake: (v) => env.addShake(v),
    node: (id) => ({ x: NODES[id][0], z: NODES[id][1] }),
    playerRoom: () => env.roomAt(P.pos.x, P.pos.z),
    onBunk: () => P.mode === 'bunk' || (P.mode === 'hide' && !P.pod),
    randPan: () => (rnd() - 0.5) * 1.8,
    pan: (x, z) => env.panFor(tmp.set(x, 1.2, z)),
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
      const m = new V3(4.84, 1.5, 0.9); if (Math.hypot(P.pos.x - m.x, P.pos.z - m.z) > 2.8) return;
      W.mirrorFx.show(kind); if (kind === 'figure') { sfx.stab(); env.addShake(0.6); F.fear = 1; } else sfx.whisper(0.5, 0.12);
      later(kind === 'figure' ? 0.7 : 3.5, () => W.mirrorFx.hide());
    },
    tvBlip() { W.tvFx.set(true); sfx.staticBurst(D.pan(2.9, -3.2), 2.2); later(2.2, () => { if (!tvHeld) W.tvFx.set(false); }); },
    clockGlitch() { F.clockGlitch = env.time() + 7; },
    drawingChange() { F.drawingLevel = (F.drawingLevel || 0) + 1; sfx.whisper(D.pan(5.6, -0.3), 0.1); },
    mutter() {
      const id = pick(rnd, ['dad/mutter_a', 'mom/mutter_a', 'dad/mutter_b', 'mom/mutter_b']);
      if (Math.hypot(P.pos.x - 7.0, P.pos.z + 3) < 12) env.say(id, { muffle: true });
    },
    encounter(kind, plan) { return encounter(kind, plan); },
    blackout(on) { F.blackout = on; env.nlMult(on ? 0 : 1, false); },
    startHunt, visibleNodes, objective: (t) => UI.objective(t),
    fired: (id) => proofFire(id),
    dropped: () => { if (F.plan && F.plan.n === pr.n) { pr.kinds = proofKinds(F.plan); proofLine(); } },
  };
  let tvHeld = false;
  D.holdTv = (v) => { tvHeld = v; };

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

  // an encounter with the thing. Returns true if it began.
  function encounter(kind) {
    if (kind === 'sight') {
      if (hidden()) return false;
      let c = visibleNodes(6, 15, rnd() < 0.3 ? 'behind' : 'front'); if (!c.length) c = visibleNodes(5, 15, 'front'); if (!c.length) return false;
      hunter.sight(pick(rnd, c), { dur: 3 + rnd() * 2.5, lookTime: 0.8 }); return true;
    }
    if (kind === 'stalk') {
      const node = hunter.pickSpawn(10); if (!node) return false; hunter.stalk(node);
      return true;
    }
    const node = hunter.pickSpawn(9); if (!node) return false;
    startHunt(node); return true;
  }
  // the lights go wrong first, then it is there
  async function startHunt(node) {
    // usually the lights go wrong first, for a moment you cannot predict; sometimes there is no warning at all (and the director's false alarms look just like this)
    if (rnd() < 0.62) {
      F.script = true; D.flicker(1.8); sfx.tension(0.05, 1.5); sfx.violins(0.35, 1); sfx.whisper(D.pan(NODES[node][0], NODES[node][1]), 0.18); F.fear = Math.max(F.fear, 0.6);
      await wait(0.9 + rnd() * 1.8); F.script = false;
    }
    if (F.dead || !F.live) return;
    if (hidden()) hunter.searchFrom(node); else hunter.hunt(node);
  }

  // ---------- the night ----------
  const clockText = (m) => {
    if (F.clockGlitch && env.time() < F.clockGlitch) return pick(() => Math.random(), ['3:33 AM', '3:33 AM', '13:00', '--:--', '6:66 AM']);
    const t = Math.floor(m) % 1440, h = Math.floor(t / 60), mm = t % 60; return `${h % 12 === 0 ? 12 : h % 12}:${String(mm).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
  };
  let lastMin = -1;
  function tick(dt) {   // called every frame by the game while the night is live
    if (!(F.script && F.clock >= DAWN - 1) && !(F.holdDawn && F.clock >= DAWN - 3)) F.clock += dt * (F.clockRateNow || env.clockRate) * (window.__clockMul || 1);   // (a scene that is playing holds the dawn back)
    const m = Math.floor(F.clock); if (m !== lastMin || F.clockGlitch) { lastMin = m; UI.clock(clockText(F.clock), `night ${F.night}`); }
    director.update(); hunter.update(dt); proofTick();
    // the breath meter shows whenever something is near enough to hear you
    if (F.live) F.breathUI = F.breathUI || (P.mode === 'hide' && hunter.busy && hunter.gap() < 14 && hunter.state !== 'leave');
    if (F.live && P.mode === 'hide' && !(hunter.busy && hunter.gap() < 14)) F.breathUI = F.breathCheck;
  }
  const director = createDirector(D);

  // ---------- proof: what a night leaves behind, to show Mom and Dad ----------
  // Each kind comes from the night's own events (a director event id, or the night's type). It shows only after one of them has fired, at a
  // moment you are not looking at the spot. RUN.evidence holds the kinds found in this run, RUN.evidenceAt the night each was found on.
  const WP = W.proof || {};
  const prop = (k) => (on) => { if (WP[k]) WP[k].show(on); };
  const PROOF = {
    SCRATCHES: { from: ['knock', 'bunkShake'], keep: true, at: [6.15, 1.45, 0.45], p: [6.15, 1.35, 0.55], show: prop('SCRATCHES'),
      cue: () => { sfx.scratch(D.pan(6.15, 0.45)); sub('<i>Something is scratching at your closet door.</i>', 3.5); },
      line: '<i>Claw marks, right through the paint. They start higher than Dad can reach.</i>',
      tell: 'Come look at my closet door. Something clawed it.' },
    FOOTPRINTS: { from: ['thirst', 'faucet', 'flush'], at: [5.5, 0, -0.88], show: prop('FOOTPRINTS'),
      cue: () => { for (let i = 0; i < 3; i++) later(i * 0.5, () => sfx.footstep(0.16, D.pan(4.6 + i * 0.9, -0.9), 0.35, 'tile')); sub('<i>Wet bare feet slap down the hall.</i>', 3.5); },
      line: "<i>Wet footprints. Bare feet, longer than Dad's. They go from the bathroom to my door.</i>",
      tell: 'There were wet footprints in the hall last night. Bare feet. Bigger than yours, Dad.' },
    CABINETS: { from: ['slam', 'mimic'], at: [2.88, 1.9, 2.6], p: [2.6, 1.85, 2.6], show: prop('CABINETS'),
      cue: () => { sfx.cabinet(D.pan(2.7, 2.6), 0.8); sub('<i>A cabinet door bangs in the kitchen.</i>', 3.5); },
      line: '<i>The cabinet is wide open. Every cup in it is turned upside down.</i>',
      tell: 'A cabinet in the kitchen was open, and all the cups were upside down.' },
    STATIC: { from: ['static', 'tvStatic'], at: [2.711, 0.815, -3.266], p: [2.7, 0.85, -3.27], show: (on) => W.tvFx.set(on), still: () => W.tvFx.on, took: () => { W.tvFx.set(false); sfx.click(); },
      cue: () => sub('<i>Blue light flickers in the living room. The TV is on again.</i>', 3.5),
      line: "<i>Nobody is watching it. The screen is warm, like it's been on for hours.</i>",
      tell: 'The TV was on again last night. Nobody was watching it.' },
    DRAWING: { from: ['drawing'], keep: true, at: [5.22, 0.45, -0.39], p: [5.28, 0.6, -0.48], show: prop('DRAWING'),
      cue: () => sub('<i>Out in the hall, a crayon squeaks across the wall.</i>', 3.5),
      line: "<i>Somebody kept drawing, right on the wall. And left the crayon. I don't have a black crayon.</i>",
      tell: "Somebody drew on the wall under the drawing. In black crayon. I don't have a black one." },
    CHAIR: { from: ['chairs'], at: [-1.95, 0.5, 0.6], show: (on) => { const c = W.chairs[2]; if (on) W.moveChair(2, -1.95, 0.6, Math.PI / 2); else if (c) W.moveChair(2, c.x, c.z, c.rot); },
      cue: () => sub('<i>A chair scrapes across the dining room floor.</i>', 3.5),
      line: '<i>Somebody turned this chair to face the wall, right up close. Like a kid sent to sit in the corner.</i>',
      tell: 'Somebody turned a chair in the dining room to face the wall. Right up against it.' },
    PHONE: { from: ['ring'], at: [-1.6, 1.15, 0.89], p: [-1.56, 1.3, 0.9], show: (on) => (on ? W.phone.pickUp() : W.phone.hangUp()), still: () => W.phone.off, took: () => { W.phone.hangUp(); sfx.click(); },
      line: "<i>It's off the hook. If I hold my breath, there's still breathing on the line.</i>",
      tell: 'The phone was off the hook. Somebody was still breathing on it.' },
    HANDPRINT: { from: ['blackout'], keep: true, at: [-5.47, 1.47, -3.71], p: [-5.45, 1.45, -3.62], show: prop('HANDPRINT'),
      line: "<i>A handprint on the breaker box, black, like it's burned on. The fingers are way too long.</i>",
      tell: 'There is a handprint on the breaker box. Go look at the fingers.' },
    TEDDY: { from: ['teddy'], at: [0, 0, 0], show: prop('TEDDY'), place: (s) => { PROOF.TEDDY.at = [s[0], s[1], s[2]]; if (WP.TEDDY) WP.TEDDY.at(s[0], s[1], s[2]); },
      line: '<i>Stuffing. Somebody picked it out of my bear, a little at a time.</i>',
      tell: 'Somebody pulled the stuffing out of my bear. Look at him.' },
    CANDLE: { from: ['vigil'], at: [5.2, 0.03, -0.95], show: () => {},   // the vigil's own tea light, left on the floor until dawn
      line: '<i>The candle from the hall. Burned all the way down. Nobody in this house lit it.</i>',
      tell: 'There was a candle burning in the hall last night. None of us lit it.' },
  };
  const found = () => (env.RUN.evidence ||= []), foundAt = () => (env.RUN.evidenceAt ||= {});
  const isFound = (k) => found().includes(k);
  const pr = { n: 0, kinds: [], pending: new Map(), shown: new Set(), its: {}, hud: false };
  // what a night can leave: its type's kinds and its events' (the vigil stops the events, and the drive ends the night soon after it starts;
  // an event the director gave up on leaves nothing, so it drops out of the total)
  function proofKinds(plan) {
    if (!plan || plan.n < 2 || plan.n > 9) return [];
    const src = new Set([plan.type]);
    if (plan.type !== 'vigil') for (const e of plan.events) if (!e.dropped && (plan.type !== 'car' || e.t < plan.clock0 + 10)) src.add(e.id);
    return Object.keys(PROOF).filter((k) => PROOF[k].from.some((s) => src.has(s)) && (!isFound(k) || foundAt()[k] === plan.n));
  }
  // the house goes back to how it was, apart from what you found that stays (claw marks do not wash off)
  function proofSync() {
    for (const k of pr.shown) PROOF[k].show(false);
    for (const k in PROOF) if (PROOF[k].keep) PROOF[k].show(isFound(k));
    pr.shown.clear(); pr.pending.clear();
    for (const k in pr.its) env.removeI(pr.its[k]);
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
  function proofTick() {
    for (const [k, t0] of pr.pending) {
      const d = PROOF[k], [x, y, z] = d.at;
      if (env.time() - t0 < 2.5 || (Math.hypot(camera.position.x - x, camera.position.z - z) < 10 && hunter.looking(x, z, 0.3, y))) continue;
      pr.pending.delete(k); pr.shown.add(k); d.show(true);
      if (d.cue && !F.script && !F.cutscene && !hunter.busy) d.cue();
      const p = d.p || [x, Math.max(y + 0.25, 0.7), z];
      pr.its[k] = env.addI({ p: new V3(...p), r: 1.4, label: 'Look closer', act: () => proofLook(k),
        when: () => F.live && P.mode === 'walk' && !F.cutscene && pr.shown.has(k) && !isFound(k) && hunter.state !== 'hunt' && hunter.state !== 'loom' });
    }
    // something else put it back (the TV switched off, the phone hung up): it turns up again later
    for (const k of pr.shown) {
      const d = PROOF[k]; if (!d.still || isFound(k) || d.still()) continue;
      pr.shown.delete(k); env.removeI(pr.its[k]); delete pr.its[k]; pr.pending.set(k, env.time());
    }
  }
  // look closer: the view leans in, the kid says what it is, and it is kept. Saved first, so getting caught right after still counts it.
  async function proofLook(k) {
    const d = PROOF[k]; if (F.cutscene || isFound(k)) return;
    found().push(k); foundAt()[k] = pr.n; env.saveRun(); proofLine();
    env.removeI(pr.its[k]); delete pr.its[k];
    F.cutscene = true; P.mode = 'cine'; P.cam.copy(camera.position);
    const from = P.cam.clone(), y0 = P.yaw, p0 = P.pitch, at = new V3(...d.at), dist = from.distanceTo(at);
    const to = from.clone().lerp(at, clamp((dist - 0.45) / Math.max(dist, 0.01), 0, 0.6)); to.y = Math.max(to.y, 0.45);
    const h = Math.hypot(at.x - to.x, at.z - to.z), yaw = h > 0.05 ? Math.atan2(-(at.x - to.x), -(at.z - to.z)) : y0, pitch = clamp(Math.atan2(at.y - to.y, h), -1.3, 1.3);
    sub(d.line, 5.5); sfx.creak(0.1, 0, 0.3);
    await tween(1.2, (q) => { P.cam.lerpVectors(from, to, q); P.yaw = lerpAngle(y0, yaw, q); P.pitch = lerp(p0, pitch, q); });
    if (d.took) d.took();
    await wait(1.1);
    const back = new V3(P.pos.x, env.EYE, P.pos.z);
    await tween(0.6, (q) => { P.cam.lerpVectors(to, back, q); P.pitch = lerp(pitch, clamp(pitch, -0.5, 0.5), q); });
    if (P.mode === 'cine' && !F.dead) { P.mode = 'walk'; F.cutscene = false; }
  }
  // the line under the objective: how much of tonight's proof you have
  const proofEl = (() => {
    const o = typeof document !== 'undefined' && document.getElementById('objective'); if (!o) return null;
    const el = document.createElement('div'); el.id = 'proof'; o.after(el);
    // under the objective while there is one, in its place while there is none
    const place = () => { const on = o.classList.contains('show'); el.classList.toggle('alone', !on); el.style.top = `${on ? o.offsetTop + o.offsetHeight + 10 : o.offsetTop}px`; };
    new MutationObserver(place).observe(o, { attributes: true, attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
    addEventListener('resize', place); place();
    return el;
  })();
  function proofLine() { if (proofEl) proofEl.innerHTML = `Find proof <span>${pr.kinds.filter(isFound).length} / ${pr.kinds.length}</span>`; }
  // main.js, every frame: shown while a night that can leave proof is being played
  function proofHud(on) {
    on = !!on && pr.kinds.length > 0 && F.stage === 'n' + pr.n;
    if (on !== pr.hud && proofEl) { pr.hud = on; proofEl.classList.toggle('show', on); }
  }
  proofSync();
  const proof = {
    defs: PROOF, total: Object.keys(PROOF).length, count: () => found().length, on: (n) => found().filter((k) => foundAt()[k] === n), tell: (k) => PROOF[k] && PROOF[k].tell,
    kinds: () => pr.kinds.slice(), pending: () => [...pr.pending.keys()], shown: () => [...pr.shown], kindsFor: proofKinds, start: proofStart, fire: proofFire, sync: proofSync, hud: proofHud, look: proofLook,
  };

  async function freeNight(n) {
    const t = ++tok;
    F.stage = 'n' + n; F.night = n;
    env.resetNight(); env.setPhase('night'); env.sfx.dread(Math.min(0.25 + n * 0.07, 0.8), 4);
    const plan = makePlan(env.RUN.seed, n); if (env.HPARAM && env.HPARAM.type) plan.type = env.HPARAM.type;   // (#type=ring forces a night type for testing)
    rnd = plan.r; F.plan = plan; F.typeName = TYPE_NAMES[plan.type];
    F.clock = plan.clock0; lastMin = -1; F.script = false; F.clockGlitch = 0; F.clockRateNow = 1 / plan.rate; F.holdDawn = plan.type === 'finale';
    hunter.reset(); hunter.setLevel(n); W.tvFx.set(false); W.phone.setRinging(false); proofStart(plan);
    env.toBunk();
    const dialClock = clockText(F.clock);
    UI.card(dialClock, `Night ${n}`, 4.5);
    await wait(2.5); UI.fade(0, 3); await wait(2.0);
    F.live = true; director.start(plan);
    sfx.creak(0.25, -0.5);
    UI.hint(`<b>${L('interact')}</b> climb down &nbsp;·&nbsp; <b>${L('breath')}</b> hide under the covers &nbsp;·&nbsp; <b>${env.lightLabel()}</b> flashlight`, 9);
    if (TYPE_RUN[plan.type]) TYPE_RUN[plan.type](plan, t).catch((e) => console.warn('night type failed', plan.type, e));
    await waitFor(() => !alive(t) || (F.clock >= DAWN && !F.script && !F.cutscene));
    if (!alive(t)) return;
    await dawn(n);
  }

  async function dawn(n) {
    F.live = false; F.script = true; director.stop(); tok++;
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

  // ---------- what each kind of night is about ----------
  const sub = (h, d = 4) => UI.subtitle(h, d);
  const obj = (t) => UI.objective(t);
  const until = (t, fn) => waitFor(() => !alive(t) || fn());
  const atClock = (t, m) => until(t, () => F.clock >= m);
  const spawnFar = () => hunter.pickSpawn(9) || 'hallW';

  const TYPE_RUN = {
    // you wake up dying of thirst: the kitchen is the other end of the house
    async thirst(plan, t) {
      await atClock(t, plan.clock0 + 22); if (!alive(t)) return;
      sub('<i>Your mouth is so dry.</i>'); obj('Get a drink from the kitchen sink');
      let done = false;
      const it = env.addI({ p: new V3(1.4, 1.1, 3.0), r: 1.7, label: 'Fill your cup', when: () => alive(t) && !done && P.mode === 'walk', act: async () => {
        F.script = true; sfx.faucet(3.2, D.pan(1.4, 3.3)); UI.hint('<i>The pipes shudder.</i>', 3); await wait(3.4); F.script = false; done = true; } });
      await until(t, () => done); env.removeI(it); if (!alive(t)) return;
      proofFire('thirst');
      obj('Go back to bed'); sfx.tension(0.04, 2); F.fear = Math.max(F.fear, 0.5);
      if (!hunter.busy) { const node = spawnFar(); hunter.stalk(node); }
      await until(t, () => P.mode === 'bunk' || P.mode === 'hide'); obj(null);
    },
    // the wall phone rings in the dining room
    async ring(plan, t) {
      await atClock(t, plan.clock0 + 18); if (!alive(t)) return;
      W.phone.setRinging(true); let rings = 0, answered = false, ringT = 0;
      obj('The phone is ringing. Answer it before it wakes your parents');
      const it = env.addI({ p: W.phone.pos.clone(), r: 1.8, label: 'Pick up the phone', when: () => alive(t) && W.phone.ringing && P.mode === 'walk', act: async () => {
        answered = true; F.script = true; W.phone.setRinging(false); W.phone.pickUp(); sfx.click(); obj(null);
        await wait(1.2); sub('<i>Breathing. Slow, wet, close to the receiver.</i>', 4); sfx.breath(true, 0.6); await wait(4.2);
        sfx.whisper(0, 0.24); sub('<i>"…I can see you."</i>', 3.5); await wait(2.4);
        sfx.staticBurst(0, 1.4); await wait(1.5); sub('<i>The line goes to a dial tone, a very long way off.</i>', 3.5); await wait(2);
        W.phone.hangUp(); sfx.click(); F.script = false;
        if (alive(t)) proofFire('ring');
        if (!hunter.busy) hunter.stalk(hunter.pickSpawn(7) || 'archN');
      } });
      (async () => { while (alive(t) && W.phone.ringing && rings < 11) { sfx.phoneRing(D.pan(-1.5, 0.9)); F.fear = Math.max(F.fear, 0.25); rings++; await wait(1.7); } })();
      await until(t, () => answered || rings >= 11); W.phone.setRinging(false); env.removeI(it);
      if (!answered && alive(t)) { obj(null); W.setDoor('parents', true); sub("<i>Your parents' door opens by itself.</i>", 3.5); proofFire('ring'); }
    },
    // the TV in the living room, and Dad's voice
    async static(plan, t) {
      await atClock(t, plan.clock0 + 24); if (!alive(t)) return;
      W.tvFx.set(true); D.holdTv(true); sfx.staticBurst(D.pan(2.9, -3.2), 3); sub('<i>The TV just turned on in the living room.</i>', 3.5);
      await wait(5); if (!alive(t)) return;
      env.say('dad/lure_a', { muffle: true }); obj('Dad is up. He wants you in the living room');
      mom.group.visible = true;
      dad.sleeping = false; dad.busy = true; dad.group.rotation.order = 'XYZ'; dad.group.rotation.set(0, 0, 0); dad.group.position.set(2.0, 0, -2.6); dad.group.rotation.y = Math.atan2(2.9 - 2.0, -3.2 + 2.6);   // standing in front of the TV, his back to you
      dad.group.visible = true; dad.lookAt = null; dad.fake = true; W.bedSleepers.one('dad', false); if (dad.rig) dad.rig.play('idle', { fade: 0, speed: 0.6 });   // (and his side of the bed is empty)
      let revealed = false, saidB = false; const t0 = env.time();
      while (alive(t) && !revealed && env.time() - t0 < 95) {
        const d = Math.hypot(P.pos.x - 2.0, P.pos.z + 2.6);
        if (!saidB && d < 6.5 && hunter.los(P.pos.x, P.pos.z, 2.0, -2.6)) { saidB = true; env.say('dad/lure_b'); }
        if (d < 1.9 && hunter.los(P.pos.x, P.pos.z, 2.0, -2.6) && !hidden()) revealed = true;
        await wait(0.1);
      }
      if (alive(t) && revealed) {   // it was never Dad
        achievements.unlock('NOT_DAD'); F.script = true; obj(null); W.tvFx.figure = 1; sfx.staticBurst(0, 0.6);
        env.nlMult(0, false); D.flicker(1.4); await wait(0.5);
        dad.group.visible = false; dad.fake = false; dad.busy = false; W.tvFx.set(false); D.holdTv(false); W.tvFx.figure = 0;
        F.script = false;
        hunter.hunt('livTV'); E.faceTowards(P.pos.x, P.pos.z, 1);
      } else if (alive(t)) {
        W.tvFx.set(false); D.holdTv(false); obj(null);
      }
      if (dad.fake) { dad.fake = false; dad.busy = false; env.sleepers(true); }
      W.bedSleepers.one('dad', true);
      if (alive(t)) proofFire('static');
    },
    // Mom calls you from the kitchen
    async mimic(plan, t) {
      await atClock(t, plan.clock0 + 24); if (!alive(t)) return;
      obj('Mom is calling you from the kitchen'); const t0 = env.time(); let lured = false, n = 0;
      while (alive(t) && !lured && env.time() - t0 < 100) {
        if (n++ % 3 === 0 && !hidden()) env.say(n % 2 ? 'mom/mimic_a' : 'mom/mimic_b', { muffle: Math.hypot(P.pos.x - 1, P.pos.z - 1.5) > 6 });
        for (let i = 0; i < 70 && alive(t) && !lured; i++) { await wait(0.1); if (Math.hypot(P.pos.x - 0.6, P.pos.z - 1.2) < 2.7 && hunter.los(P.pos.x, P.pos.z, 0.6, 1.2)) lured = true; }
      }
      obj(null); if (!alive(t)) return;
      if (lured) {
        F.script = true; D.flicker(1.6); env.nlMult(0, false); sfx.stab(); env.addShake(0.7);
        await wait(0.9); env.say('mom/mimic_c'); F.script = false;
        hunter.hunt('archN');
      } else if (!hunter.busy) hunter.stalk(spawnFar());
      if (alive(t)) proofFire('mimic');
    },
    // the power fails: find the breaker in the utility room
    async blackout(plan, t) {
      await atClock(t, plan.clock0 + 5); if (!alive(t)) return;
      D.blackout(true); sfx.pop(); UI.flash('rgba(0,0,0,0.5)', 0.5);
      sub('<i>The power just went out. Even the night lights.</i>', 4); await wait(5); if (!alive(t)) return;
      obj('Find the breaker in the utility room <span>(your flashlight: ' + env.lightLabel() + ')</span>');
      let fixed = false;
      const it = env.addI({ p: new V3(-5.5, 1.45, -3.7), r: 1.7, label: 'Flip the breaker', when: () => alive(t) && !fixed && P.mode === 'walk', act: async () => {
        F.script = true; sfx.click(); await wait(0.5); sfx.thump(); fixed = true; D.blackout(false); obj(null); sub('<i>The lights come back on. Something in the house breathes out.</i>', 4); await wait(2.5); F.script = false;
        hunter.hunt(hunter.pickSpawn(7) || 'livC');
      } });
      await until(t, () => fixed); env.removeI(it);
      if (alive(t)) proofFire('blackout');
    },

    // NIGHT ONE: the house wakes up. Nothing is ever seen; things creep and move, and at the end everything stops and something walks around your bunk.
    async poltergeist(plan, t) {
      const c0 = plan.clock0, at = (m) => atClock(t, c0 + m), room = () => env.roomAt(P.pos.x, P.pos.z);
      if (W.hallFrame) W.hallFrame.reset();
      const ramp = async (dur, fn) => { const n = Math.max(2, Math.round(dur * 60)); for (let i = 1; i <= n; i++) { fn(i / n); await wait(dur / n); if (!alive(t)) return; } };
      let seen = 0;
      const when = (cond, fn, minM = 0) => (async () => {
        const m0 = minM + (minM > 0 ? rnd() * 9 : 0);   // jitter each timed beat by up to 9 game minutes (seeded)
        await until(t, () => F.clock >= c0 + m0 && !F.script && cond()); if (!alive(t)) return;
        seen++; await fn();
      })();
      (async () => {   // from the bunk
        await at(4); if (!alive(t)) return; sfx.creak(0.3, -0.4); await wait(2.4); if (!alive(t)) return;
        W.moveTeddy(7.5, 0.03, 2.6); sfx.thump(); sub('<i>Your bear just fell off the bunk.</i>', 3.5); F.fear = Math.max(F.fear, 0.4);
      })();
      when(() => room() === 'bed' && W.doors.kid.target === 1 && Math.hypot(P.pos.x - 7.05, P.pos.z + 0.3) > 1.5, async () => { W.setDoor('kid', false); sub('<i>Your door swings shut by itself.</i>', 3.5); F.fear = Math.max(F.fear, 0.5); }, 11);
      when(() => true, async () => {
        for (let i = 0; i < 3; i++) { sfx.knock(D.pan(5.85, 0.2), 0.3); await wait(1.1); }
        await wait(1.2); sfx.scratch(D.pan(5.85, 0.2)); sub('<i>Something is inside the closet.</i>', 4); F.fear = Math.max(F.fear, 0.6);
      }, 20);
      when(() => true, async () => {
        sfx.staticBurst(0.5, 1.2); await wait(0.9); sfx.whisper(-0.6, 0.28); sub('<i>(a whisper, almost words) "…not… yours…"</i>', 4.5); F.fear = Math.max(F.fear, 0.5);
      }, 33);
      // the photo in the hall comes down only while you are looking at it, close by: a held silence, a tilt, a held breath, then the drop
      const frameSeen = () => {
        const hf = W.hallFrame; if (!hf || hf.fallen || room() !== 'hall') return false;
        const dx = hf.g.position.x - P.pos.x, dz = hf.g.position.z - P.pos.z, d = Math.hypot(dx, dz);
        if (d < 1.0 || d > 3.0) return false;
        return (dx * -Math.sin(P.yaw) + dz * -Math.cos(P.yaw)) / d > 0.82;
      };
      when(frameSeen, async () => {
        const hf = W.hallFrame; F.script = true; F.fear = Math.max(F.fear, 0.6);
        sfx.hush(1.4); sfx.drone(0, 1.2);
        await wait(1.4); if (!alive(t)) return;                              // the silence: it is just hanging there
        await ramp(0.35, (k) => hf.tilt(0.1 * k)); sfx.creak(0.3, D.pan(4.75, -1.4));
        await wait(0.7); if (!alive(t)) return;                              // the held breath before it goes
        await ramp(0.26, (k) => hf.pose(k)); hf.fall();
        sfx.stab(); sfx.thump(); sfx.noiseHit({ dur: 0.3, type: 'highpass', f: 3500, gain: 0.5, wet: 0.2 }); env.addShake(1.5); D.flicker(2.2);
        sub('<i>The photo came off the wall. The glass is still sliding across the floor.</i>', 3.5); F.fear = 1;
        await wait(1.0); F.script = false;
      }, 14);
      when(() => room() === 'bath', async () => {
        sfx.faucet(6, D.pan(4.7, 0.9)); sub('<i>The tap turns itself on.</i>', 3.5); await wait(3.2); W.mirrorFx.show('writing'); sfx.whisper(0.6, 0.18); await wait(4); W.mirrorFx.hide(); F.fear = Math.max(F.fear, 0.6);
      }, 25);
      when(() => room() === 'living', async () => {
        W.tvFx.set(true); D.holdTv(true); sfx.staticBurst(D.pan(2.9, -3.2), 6); sub('<i>The TV turns on. Nobody touched it.</i>', 3.5); F.fear = Math.max(F.fear, 0.5);
        await wait(7); D.holdTv(false); W.tvFx.set(false); sfx.click();
      }, 40);
      when(() => room() === 'living' || room() === 'dining', async () => {
        sfx.scrape(D.pan(-2.1, 2.3)); W.moveChair(1, -1.55, 2.3 + 0.35, Math.PI / 2 + 0.5); await wait(1.4); W.moveChair(0, -3.1, 2.0, Math.PI / 2 - 0.4); sfx.scrape(D.pan(-2.9, 2.0)); sub('<i>Chairs are moving in the dining room.</i>', 3.5);
      }, 50);
      // every cabinet door in the kitchen at once, heard from anywhere in the house
      when(() => true, async () => {
        for (let i = 0; i < 5; i++) sfx.cabinet(D.pan(0.6 + i * 0.7, 3.2), 1);
        await wait(0.1); sfx.cabinet(D.pan(1.2, 3.0), 0.8);
        sub('<i>Every cabinet in the kitchen bangs at once.</i>', 3.5); F.fear = Math.max(F.fear, 0.7); env.addShake(0.6);
      }, 45);
      when(() => room() === 'hall' && Math.hypot(P.pos.x - 7.3, P.pos.z + 0.9) < 2.8, async () => {
        W.setDoor('parents', true); await wait(1.2); env.say('mom/mutter_b', { muffle: true }); F.fear = Math.max(F.fear, 0.6);
      }, 30);
      when(() => room() === 'hall' && Math.hypot(P.pos.x - 5.6, P.pos.z + 0.4) < 2.2, async () => { D.drawingChange(); sub('<i>The drawing looks different. You are sure it does.</i>', 3.5); }, 30);
      // ---- the crescendo: it goes quiet, then everything happens at once and you have to be under the covers ----
      await until(t, () => F.clock >= c0 + 135 || (seen >= 6 && F.clock >= c0 + 75)); if (!alive(t)) return;
      await until(t, () => !F.script); if (!alive(t)) return;
      F.script = true; director.stop(); UI.objective(null); UI.hint(null); sfx.violins(0, 1.5); sfx.drone(0, 1.5);
      sub('<i>The house goes quiet. Completely quiet.</i>', 5); sfx.hush(5); await wait(5.5); if (!alive(t)) return;
      for (const d of Object.keys(W.doors)) W.setDoor(d, false);
      env.nlMult(0, false); F.flicker = true; sfx.jolt(1); sfx.slamFar(-0.7); sfx.slamFar(0.7); env.addShake(1.0); F.fear = 1;
      sfx.violins(1, 0.3); sfx.whisper(0, 0.4); sub('<i>"GET OUT."</i>', 3);
      obj('<b class="red">Hide.</b> Get under the covers (' + env.lightLabel().toLowerCase() + ' off)');
      F.script = false;
      const t0 = env.time();
      await until(t, () => P.mode === 'hide' || env.time() - t0 > 55);
      if (!alive(t)) return;
      if (P.mode !== 'hide') { env.caught({ unseen: true }); return; }
      obj(`Hold <b>${L('breath')}</b> until it passes`); F.breathUI = true; F.script = true; await wait(1.4);
      F.breathCheck = true; F.grace = 1.4; UI.hint(`Hold <b>${L('breath')}</b> (or tap it once) and don't let go`, 8);
      for (let i = 0; i < 7; i++) { sfx.heavyStep(0.8, Math.sin(i * 0.9) * 0.8); if (i % 2) sfx.knock(Math.sin(i) * 0.7, 0.3); if (i === 3) sfx.scratch(0); if (i === 4) { env.addShake(0.5); sfx.creak(0.4, 0); } F.fear = 1; await wait(0.95); }
      F.breathCheck = false; UI.hint(null); obj(null);
      sfx.violins(0, 0.05); sfx.ceilingThump(); await wait(0.4); sfx.whisper(0, 0.3); F.flicker = false; env.nlMult(1, false); F.fear = 0.4; F.script = false;
      await wait(4); F.clock = Math.max(F.clock, 350);
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
    vigil(plan, t) { director.stop(); return env.vigil.run(plan, (fn) => until(t, fn)).then(() => { if (alive(t)) { achievements.unlock('GRANDPA'); proofFire('vigil'); } }); },
    // you fall asleep and dream a drive to the store
    async car(plan, t) {
      await atClock(t, plan.clock0 + 10); if (!alive(t)) return;
      if (P.mode === 'walk' && !hidden()) { sub('<i>You are so tired. You can barely stand.</i>', 4); obj('Go back to bed'); await until(t, () => P.mode === 'bunk' || P.mode === 'hide' || F.clock > plan.clock0 + 70); obj(null); if (!alive(t)) return; }
      await until(t, () => !F.script && !F.cutscene); if (!alive(t)) return;
      if (P.mode === 'walk') env.toBunk();
      await env.carDream(); if (alive(t)) achievements.unlock('GLOVE_BOX');   // (opening it gets you caught)
    },
    async hunted() {}, async quiet(plan, t) {
      await atClock(t, plan.clock0 + 10); if (!alive(t)) return;
      sub('<i>It is so quiet. Why is it so quiet?</i>', 4);
      for (let i = 0; i < 9 && alive(t); i++) { await wait(14); if (!alive(t)) return; sfx.heartbeat(0.25 + i * 0.05); F.fear = Math.max(F.fear, 0.15 + i * 0.05); }
    },
    // sleep paralysis: you wake and cannot move, and it is standing at the foot of the bunk
    async paralysis(plan, t) {
      await atClock(t, plan.clock0 + 6); if (!alive(t)) return;
      if (P.mode === 'walk' || hunter.busy) return;   // you are already up: it does not happen tonight
      F.script = true; F.cutscene = true;
      const lie = new V3(6.13, 1.9, 3.02); P.mode = 'cine'; P.cam.copy(lie); sub('<i>You can\'t move. You can\'t move at all.</i>', 4);
      sfx.tension(0.05, 2); sfx.drone(0.15, 2);
      await wait(4); if (!alive(t)) return;
      E.visible = true; E.mode = 'idle'; E.tilt = 0.5; E.lookTarget = camera.position; E.smileScale = 1; E.root.position.set(7.9, 0, 3.02); E.root.rotation.y = -Math.PI / 2;
      P.yaw = -Math.PI / 2 + 0.3; sfx.stab(); env.addShake(0.6); F.fear = 1;
      for (const x of [7.5, 7.15, 6.9, 6.8]) { await wait(2.0); E.root.position.x = x; D.flicker(0.25); sfx.heavyStep(0.5, 0); F.fear = 1; }
      await wait(2.5); sfx.violins(1, 0.2); await wait(2.2); sfx.violins(0, 0.05); sfx.ceilingThump();
      E.visible = false; F.cutscene = false; P.mode = 'bunk'; P.cam.copy(env.BUNK_SEAT); P.yaw = 0.2; F.script = false; sub('<i>Then you can move again. The room is empty.</i>', 4);
    },
    // your bear is not on the bunk
    async teddy(plan, t) {
      await atClock(t, plan.clock0 + 12); if (!alive(t)) return;
      const spots = [[5.6, 0.02, -0.9, 'in the hall'], [0.05, 0.98, 3.2, 'on the kitchen counter'], [7.0, 0.02, -2.0, "in Mom and Dad's room"], [-2.6, 0.5, -2.4, 'on the couch'], [4.45, 0.02, 1.6, 'on the bathroom floor']];
      const s = pick(rnd, spots); W.moveTeddy(s[0], s[1], s[2]); let got = false;
      sub('<i>Your bear is not where you left it.</i>', 4); obj('Find your teddy bear');
      // (reach is measured from your eyes, so the prompt point stays at least 0.75 m up or a bear on the floor would be out of it)
      const it = env.addI({ p: new V3(s[0], Math.max(s[1] + 0.15, 0.75), s[2]), r: 1.4, label: 'Pick up the bear', when: () => alive(t) && !got && P.mode === 'walk', act: () => { got = true; W.teddy.visible = false; sfx.thump(); } });
      await until(t, () => got); env.removeI(it); if (!alive(t)) return;
      proofFire('teddy', s);
      obj('Put it back on your bunk'); sfx.tension(0.05, 2); sub('<i>It is warm.</i>', 3.5); await wait(3);
      if (!hunter.busy) hunter.stalk(spawnFar());
      await until(t, () => P.mode === 'bunk' || P.mode === 'hide'); W.moveTeddy(6.83, 0.55, 3.0); W.teddy.visible = true; obj(null);
    },
    // something is in your parents' room
    async parents(plan, t) {
      await atClock(t, plan.clock0 + 30); if (!alive(t)) return;
      W.setDoor('parents', true); sfx.creak(0.3, D.pan(7.5, -1.5)); sub("<i>Your parents' door is open. It was shut.</i>", 4); obj('Check on Mom and Dad');
      let seen = false;
      await until(t, () => env.roomAt(P.pos.x, P.pos.z) === 'parents' || (Math.hypot(P.pos.x - 7.5, P.pos.z + 1.7) < 1.3 && hunter.los(P.pos.x, P.pos.z, 7.0, -3.2)));
      if (!alive(t)) return; obj(null);
      F.script = true; sfx.tension(0.06, 1); await wait(0.8);
      hunter.sight('pBed', { dur: 14, facing: [7.4, -3.4], turnDist: 2.4, chase: true, stab: false });
      F.script = false; seen = true; sub('<i>Something tall is standing over your parents, very still.</i>', 4);
      void seen;
    },
  };

  return { freeNight, dawn, tick, hunter, director, D, PODS, hidden, enterPod, exitHide, canComeOut, TYPE_RUN, startHunt, proof, plan: (n) => makePlan(env.RUN.seed, n) };
}
