'use strict';
// The bindings table (js/settings.js) as js/input.js reads it: the controller layout (the thing in the hand on the triggers: Y switches the
// flashlight and the camera, LT aims, RT uses, d-pad up the light; RB the breath and the covers, L3 sprint, A interact only, the d-pad no
// longer walking, Start pausing, View toggling the journal), the keyboard and mouse (right mouse aims, left mouse uses, Q switches, F the
// light, E interact), the labels and glyphs for the three pad styles, rebind round trips, the look acceleration, and the touch controls
// (CAM tapped to switch and held to aim, the fixed HOLD BREATH / COVER UP slot, USE as the shutter while aiming). Loaded by tests/smoke.js
// as a numbered check ("--only bindings"); a fake Standard-mapping pad, no drawing.
module.exports = {
  name: 'bindings',
  timeout: 600e3,
  async run(browser, H) {
    const { alone, nightPage, stand, tap, until, ok, sleep, clean, playFor } = H;
    const notes = [];
    await alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night2&type=hunted', { pad: true });
      // nothing drawn, not even a shot's print (it would push the whole never-warmed scene through the software renderer)
      await page.evaluate(async () => { const g = window.__game, ev = await import('/js/events.js'); g.nights.director.stop(); g.nights.hunter.dismiss(); ev.suspend(true); g.gfx.render = () => {}; g.P.mode = 'walk'; g.F.cutscene = false; g.F.script = false; g.F.noFlash = false; g.F.fear = 0; });
      const G = (fn, arg) => page.evaluate(fn, arg);
      const press = (i, on) => G(([i, on]) => { window.__pad.buttons[i].pressed = on; }, [i, on]);
      const hold = async (i, ms) => { await press(i, true); await sleep(ms); await press(i, false); await sleep(150); };
      const fired = () => G(() => ({ ...window.__game.input.fired }));
      const hs = () => G(() => { const g = window.__game, f = g.camera.children.find((x) => x.isSpotLight); return { active: g.hands.active, state: g.hands.state, fov: g.camera.fov, angle: f.angle, dist: f.distance, flash: g.F.flashOn, film: g.RUN.film, shots: Object.keys(g.RUN.photos || {}).length }; });

      // ---- labels and glyphs on each pad style; the Switch's bottom button is B
      const ACT = ['switch', 'aim', 'use', 'light', 'interact', 'breath', 'sprint', 'journal', 'cancel', 'pause'];
      const lab = await G(async (ACT) => {
        const { bindingLabel, glyph } = await import('/js/input.js'), s = window.__game.settings, out = {};
        for (const style of ['auto', 'ps', 'switch']) { s.set('promptStyle', style); out[style] = ACT.map((a) => bindingLabel(a, 'pad')); }
        s.set('promptStyle', 'auto');
        out.glyphs = { a: glyph('interact', 'pad'), rt: glyph('use', 'pad'), y: glyph('switch', 'pad'), kb: glyph('breath', 'kb'), touch: glyph('interact', 'touch') };
        out.kb = ['interact', 'switch', 'aim', 'use', 'light', 'breath', 'sprint'].map((a) => bindingLabel(a, 'kb'));
        out.touch = ['switch', 'aim', 'use', 'light'].map((a) => bindingLabel(a, 'touch'));
        out.actions = Object.keys(s.bindings);
        return out;
      }, ACT);
      ok(lab.auto.join() === 'Y,LT,RT,D-pad up,A,RB,L3,View,B,Start', `Xbox labels: ${lab.auto.join()}`);
      ok(lab.ps.join() === '△,L2,R2,D-pad up,✕,R1,L3,Create,○,Options', `PlayStation labels: ${lab.ps.join()}`);
      ok(lab.switch.join() === 'X,ZL,ZR,D-pad up,B,R,L3,−,A,+', `Switch labels: ${lab.switch.join()}`);
      ok(lab.kb.join() === 'E,Q,Right click,Left click,F,SPACE,Shift', `keyboard labels: ${lab.kb.join()}`);
      ok(lab.touch.join() === 'CAM,CAM (hold),USE,LIGHT', `touch labels: ${lab.touch.join()}`);
      ok(/class="g g-pad g-xbox g-face g-a"/.test(lab.glyphs.a) && />A</.test(lab.glyphs.a) && /g-face g-y/.test(lab.glyphs.y), `the A / Y glyphs: ${JSON.stringify(lab.glyphs)}`);
      ok(/g-pill/.test(lab.glyphs.rt) && />RT</.test(lab.glyphs.rt) && /<b class="g g-kb">SPACE<\/b>/.test(lab.glyphs.kb) && /g-touch">USE</.test(lab.glyphs.touch), `glyphs: ${JSON.stringify(lab.glyphs)}`);
      ok(!lab.actions.includes('camera') && ['switch', 'aim', 'use'].every((a) => lab.actions.includes(a)), `the action set: ${lab.actions.join()}`);

      // ---- Y switches (refused before the camera is his), LT aims (the camera's view at or under 60 degrees within half a second)
      await G(() => { const g = window.__game; g.__run = { night: g.RUN.night, cam: g.RUN.hasCamera }; g.RUN.night = 1; g.RUN.hasCamera = false; }); await playFor(page, 0.2);
      const f0 = await fired(); await tap(page, 3); await playFor(page, 0.5);
      const refused = await hs(), f1 = await fired();
      ok(refused.active === 'torch' && (f1.switch || 0) === (f0.switch || 0) + 1, `Y before the camera was given: ${JSON.stringify([refused, f0.switch, f1.switch])}`);
      await G(() => { const g = window.__game; g.RUN.night = g.__run.night; g.RUN.hasCamera = g.__run.cam; }); await playFor(page, 0.2);
      await tap(page, 3); await playFor(page, 0.5);
      const toCam = await hs();
      ok(toCam.active === 'camera', `Y did not switch to the camera: ${JSON.stringify(toCam)}`);
      await press(6, true); const ta = await G(() => window.__game.gameTime);
      await until(page, (t) => window.__game.camera.fov <= 60 || window.__game.gameTime > t + 2, ta, 30e3);
      const fovAt = await G(() => ({ fov: window.__game.camera.fov, dt: window.__game.gameTime }));
      ok(fovAt.fov <= 60 && fovAt.dt - ta <= 0.5, `LT: the camera's view reached ${fovAt.fov.toFixed(1)} deg after ${(fovAt.dt - ta).toFixed(2)} s`);
      // RT: the shutter (one more print, one less exposure); d-pad up flips the light with the camera in the right hand
      await playFor(page, 0.3);
      const b0 = await hs(); await tap(page, 7); const b1 = await hs();
      ok(b1.shots === b0.shots + 1 && b1.film === (b0.film ?? 24) - 1, `RT with the camera up: ${JSON.stringify([b0, b1])}`);
      await press(6, false); await playFor(page, 1.2);
      const l0 = await hs(); await tap(page, 12); const l1 = await hs();
      ok(l1.flash === !l0.flash && l1.active === 'camera', `d-pad up with the camera out: ${JSON.stringify([l0, l1])}`);
      await tap(page, 12);
      // Y back: the flashlight; RT turns it on and off; LT narrows its beam (spot angle <= 0.33) and sends it half as far again
      await tap(page, 3); await playFor(page, 0.5);
      const t0 = await hs(); await tap(page, 7); const t1 = await hs(); await tap(page, 7); const t2 = await hs();
      ok(t0.active === 'torch' && t1.flash === !t0.flash && t2.flash === t0.flash, `RT with the flashlight: ${JSON.stringify([t0, t1, t2])}`);
      if (!t2.flash) await tap(page, 7);
      await press(6, true); await playFor(page, 0.5);
      const aimT = await hs();
      ok(aimT.state === 'up' && aimT.angle <= 0.33 && aimT.dist >= 22.4, `LT with the flashlight: ${JSON.stringify(aimT)}`);
      await press(6, false); await playFor(page, 0.5);
      const relT = await hs();
      ok(relT.angle >= 0.49 && relT.dist <= 15.1, `the beam did not widen again: ${JSON.stringify(relT)}`);
      notes.push(`pad: Y switch (refused before the gift), LT camera ${fovAt.fov.toFixed(1)} deg in ${(fovAt.dt - ta).toFixed(2)} s, RT shutter, d-pad up light with the camera out, RT light, LT beam ${aimT.angle.toFixed(2)} rad x${(aimT.dist / 15).toFixed(2)}`);

      // ---- held: RB / LB the breath, L3 the sprint, A interact only; LT and RT are neither breath nor sprint
      const downs = async (i) => { await press(i, true); await sleep(250); const d = await G(() => { const g = window.__game; return { breath: g.input.down('breath'), interact: g.input.down('interact'), sprint: g.input.down('sprint'), aim: g.input.down('aim'), use: g.input.down('use') }; }); await press(i, false); await sleep(150); return d; };
      const dA = await downs(0), dRB = await downs(5), dLB = await downs(4), dL3 = await downs(10), dLT = await downs(6), dRT = await downs(7), dB = await downs(1);
      ok(dA.interact && !dA.breath && !dA.sprint, `A held: ${JSON.stringify(dA)}`);
      ok(dRB.breath && dLB.breath && !dRB.interact, `RB / LB held: ${JSON.stringify([dRB, dLB])}`);
      ok(dL3.sprint && !dB.sprint && !dRT.sprint && !dLT.breath, `L3 / B / RT / LT held: ${JSON.stringify([dL3, dB, dRT, dLT])}`);
      ok(dLT.aim && dRT.use, `LT / RT are not aim / use: ${JSON.stringify([dLT, dRT])}`);
      // L3 sprints: the left stick forward with it held
      await stand(page, 5.2, -0.15, 1.0, -0.15);
      await press(10, true); await G(() => { window.__pad.axes[1] = -1; }); await playFor(page, 0.4);
      const spr = await G(() => window.__game.P.sprinting);
      await press(10, false); await G(() => { window.__pad.axes[1] = 0; }); await sleep(150);
      ok(spr, 'L3 with the stick forward did not sprint');
      // RB on the bunk pulls the covers up and, held, holds the breath under them
      await G(() => { const g = window.__game; g.toBunk(); g.P.breath = 1; });
      await playFor(page, 1.0);
      await press(5, true);
      await until(page, () => window.__game.P.mode === 'hide', null, 20e3).catch(() => {});
      await playFor(page, 1.5);
      const cov = await G(() => ({ mode: window.__game.P.mode, breath: window.__game.P.breath, down: window.__game.input.down('breath') }));
      await press(5, false);
      ok(cov.mode === 'hide' && cov.down && cov.breath < 1, `RB on the bunk: ${JSON.stringify(cov)}`);
      await G(() => { const g = window.__game; g.toBunk(); g.UI.blanket(false); g.P.mode = 'walk'; });

      // ---- the d-pad no longer moves you; the left stick does
      await stand(page, 5.2, -0.15, 1.0, -0.15);
      const p0 = await G(() => [window.__game.P.pos.x, window.__game.P.pos.z]);
      await hold(13, 700); await hold(15, 400);
      const p1 = await G(() => [window.__game.P.pos.x, window.__game.P.pos.z]);
      const dpadMoved = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]);
      ok(dpadMoved < 0.02, `the d-pad moved the player ${dpadMoved.toFixed(3)} m`);
      // held for game seconds, not wall seconds: the walk and the turn are per frame, and a busy machine draws fewer frames a second
      await G(() => { window.__pad.axes[1] = -1; }); await playFor(page, 0.7); await G(() => { window.__pad.axes[1] = 0; }); await sleep(200);
      const p2 = await G(() => [window.__game.P.pos.x, window.__game.P.pos.z]);
      const stickMoved = Math.hypot(p2[0] - p1[0], p2[1] - p1[1]);
      ok(stickMoved > 0.3, `the left stick moved the player only ${stickMoved.toFixed(2)} m`);

      // ---- the look acceleration: the same stick push turns the view further with it on
      const turn = async (accel) => {
        await G((a) => { const g = window.__game; g.settings.set('padLookAccel', a); g.P.yaw = 0; g.P.pitch = 0; g.P.vel.set(0, 0, 0); }, accel);
        await G(() => { window.__pad.axes[2] = 0.9; }); await playFor(page, 1.0); await G(() => { window.__pad.axes[2] = 0; }); await sleep(120);
        return Math.abs(await G(() => window.__game.P.yaw));
      };
      const tu0 = await turn(0), tu1 = await turn(1);
      await G(() => { window.__game.settings.set('padLookAccel', window.__game.settings.defaults.padLookAccel); });
      ok(tu0 > 0.5, `the right stick did not turn the view (${tu0.toFixed(2)} rad)`);
      ok(tu1 >= tu0 * 1.4, `look acceleration: ${tu1.toFixed(2)} rad with it, ${tu0.toFixed(2)} without (want 1.4x)`);
      ok(await G(() => window.__game.settings.get('padLookAccel')) === 0.35, 'padLookAccel does not default to 0.35');

      // ---- Start pauses and resumes; View opens the journal and, pressed again, closes it back to the game
      await tap(page, 9);
      let m = await G(() => ({ open: window.__game.menu.state.open, shown: !document.getElementById('pause').classList.contains('hidden') }));
      ok(m.shown && m.open.join() === 'pause', `Start: ${JSON.stringify(m)}`);
      await tap(page, 9);
      m = await G(() => ({ open: window.__game.menu.state.open, shown: !document.getElementById('pause').classList.contains('hidden') }));
      ok(!m.shown && m.open.length === 0, `Start again: ${JSON.stringify(m)}`);
      await tap(page, 8);
      await until(page, () => window.__game.menu.state.open.includes('journal'), null, 10e3);
      await tap(page, 8);
      await until(page, () => document.getElementById('pause').classList.contains('hidden') && window.__game.menu.state.open.length === 0, null, 10e3);
      const fj = await fired();
      ok((fj.journal || 0) >= 2, `View did not fire the journal action twice: ${JSON.stringify(fj)}`);

      // ---- rebind round trips: the light on LB, aim on LB; bind() swaps a taken button and says which action gave it up; reset restores
      const rb = await G(async () => { const { bindingLabel } = await import('/js/input.js'), s = window.__game.settings; s.bindings.light.pad = [4]; return bindingLabel('light', 'pad'); });
      ok(rb === 'LB', `after the rebind the flashlight reads ${rb}`);
      const fa = await G(() => window.__game.F.flashOn);
      await tap(page, 4);
      ok(await G(() => window.__game.F.flashOn) === !fa, 'LB did not flip the flashlight after the rebind');
      await tap(page, 4);
      const rs = await G(async () => { const { bindingLabel } = await import('/js/input.js'), s = window.__game.settings; s.reset(); return { light: bindingLabel('light', 'pad'), breath: bindingLabel('breath', 'pad'), breath2: bindingLabel('breath', 'pad', 1), table: JSON.stringify(s.bindings) === JSON.stringify(s.defaults.bindings) }; });
      ok(rs.light === 'D-pad up' && rs.breath === 'RB' && rs.breath2 === 'LB' && rs.table, `settings.reset() did not restore the bindings: ${JSON.stringify(rs)}`);
      const fb = await G(() => window.__game.F.flashOn);
      await tap(page, 4);
      ok(await G(() => window.__game.F.flashOn) === fb, 'LB still flips the flashlight after the reset');
      const sw = await G(async () => {
        const { bindingLabel } = await import('/js/input.js'), s = window.__game.settings;
        const gave = s.bind('aim', 'pad', 0, 4);
        const r = { gave, aim: bindingLabel('aim', 'pad'), breath: [bindingLabel('breath', 'pad'), bindingLabel('breath', 'pad', 1)].join('/'), stored: JSON.parse(localStorage.getItem('topbunk.settings') || '{}').bindings.aim.pad[0] };
        s.reset(); r.after = bindingLabel('aim', 'pad'); return r;
      });
      ok(sw.gave === 'breath' && sw.aim === 'LB' && sw.breath === 'RB/LT' && sw.stored === 4 && sw.after === 'LT', `bind('aim', LB): ${JSON.stringify(sw)}`);
      // the breath prompts read the table: RB on a pad, Space on the keyboard (the bedtime cartoon's cap and every prompt use glyph())
      const br = await G(async () => { const { bindingLabel, glyph } = await import('/js/input.js'); return { pad: bindingLabel('breath', 'pad'), kb: bindingLabel('breath', 'kb'), g: glyph('breath', 'pad') }; });
      ok(br.pad === 'RB' && br.kb === 'SPACE' && />RB</.test(br.g), `the breath prompt: ${JSON.stringify(br)}`);
      // an old saved layout (before aim and use) is replaced by the new one, not merged into it
      const old = await G(async () => {
        const s = window.__game.settings;
        s.set('bindings', { sprint: { kb: ['ShiftLeft'], pad: [7, 10] }, breath: { kb: ['Space'], pad: [6, 4] }, camera: { kb: ['KeyC'], pad: [3] } });
        const r = { sprint: s.bindings.sprint.pad.join(), breath: s.bindings.breath.pad.join(), use: s.bindings.use.pad.join() }; s.reset(); return r;
      });
      ok(old.sprint === '10' && old.breath === '5,4' && old.use === '7', `an old saved layout: ${JSON.stringify(old)}`);

      // ---- the keyboard and mouse: E interacts, Q switches, F the light, the right mouse aims, the left mouse uses (with the pointer held)
      await G(() => { const cv = window.__game.renderer.domElement; Object.defineProperty(document, 'pointerLockElement', { configurable: true, get: () => cv }); });
      const k0 = await fired(), kh0 = await hs();
      await page.keyboard.press('KeyE'); await sleep(150);
      await page.keyboard.press('KeyQ'); await sleep(150); await playFor(page, 0.5);
      const kh1 = await hs();
      await page.keyboard.press('KeyF'); await sleep(150);
      const kh2 = await hs();
      await page.mouse.down({ button: 'right' }); await playFor(page, 0.6);
      const kAim = await G(() => ({ aim: window.__game.input.down('aim'), state: window.__game.hands.state }));
      const kb0 = await hs();
      await page.mouse.down({ button: 'left' }); await sleep(150); await page.mouse.up({ button: 'left' }); await sleep(150);
      const kb1 = await hs(), k1 = await fired();
      await page.mouse.up({ button: 'right' }); await sleep(150);
      await G(() => { delete document.pointerLockElement; });
      ok((k1.interact || 0) === (k0.interact || 0) + 1, `E did not interact: ${JSON.stringify([k0.interact, k1.interact])}`);
      ok(kh1.active !== kh0.active && (k1.switch || 0) >= (k0.switch || 0) + 1, `Q did not switch: ${JSON.stringify([kh0.active, kh1.active])}`);
      ok(kh2.flash === !kh1.flash, `F did not flip the light: ${JSON.stringify([kh1.flash, kh2.flash])}`);
      ok(kAim.aim && kAim.state === 'up', `the right mouse did not aim: ${JSON.stringify(kAim)}`);
      ok((k1.use || 0) === (k0.use || 0) + 1 && (kh1.active === 'camera' ? kb1.shots === kb0.shots + 1 : kb1.flash === !kb0.flash), `the left mouse did not use: ${JSON.stringify([kh1.active, kb0, kb1])}`);
      notes.push('keyboard: E interact, Q switch, F light, right mouse aim, left mouse use');

      // ---- touch: CAM tapped switches, held aims; USE is the shutter while aiming; the fixed HOLD BREATH / COVER UP slot
      await G(() => { dispatchEvent(new Event('touchstart')); });   // the touch scheme comes on with the first touch
      await sleep(200);
      const t0s = await G(() => ({ scheme: document.body.dataset.scheme, on: document.getElementById('touch').classList.contains('on'), cam: !!document.getElementById('t-cam') }));
      ok(t0s.scheme === 'touch' && t0s.on && t0s.cam, `the touch controls: ${JSON.stringify(t0s)}`);
      const a0 = await hs();
      await page.dispatchEvent('#t-cam', 'pointerdown'); await sleep(60); await page.dispatchEvent('#t-cam', 'pointerup'); await playFor(page, 0.5);
      const a1 = await hs();
      ok(a1.active !== a0.active, `a tap on CAM did not switch: ${JSON.stringify([a0.active, a1.active])}`);
      if (a1.active !== 'camera') { await page.dispatchEvent('#t-cam', 'pointerdown'); await sleep(60); await page.dispatchEvent('#t-cam', 'pointerup'); await playFor(page, 0.5); }
      await page.dispatchEvent('#t-cam', 'pointerdown'); await sleep(400); await playFor(page, 0.6);
      const held = await G(() => ({ aim: window.__game.input.down('aim'), state: window.__game.hands.state, active: window.__game.hands.active }));
      ok(held.aim && held.state === 'up' && held.active === 'camera', `holding CAM did not aim the camera: ${JSON.stringify(held)}`);
      await until(page, () => document.getElementById('t-act').classList.contains('cam'), null, 10e3);
      const shutter = await G(() => { const b = document.getElementById('t-act'); return { cam: b.classList.contains('cam'), svg: !!b.querySelector('svg.shutter'), svgShown: getComputedStyle(b.querySelector('svg.shutter')).display !== 'none', textShown: getComputedStyle(b.querySelector('span')).display !== 'none' }; });
      ok(shutter.cam && shutter.svg && shutter.svgShown && !shutter.textShown, `USE while the camera is up: ${JSON.stringify(shutter)}`);
      const u0 = await hs(); await page.dispatchEvent('#t-act', 'pointerdown'); await sleep(150); const u1 = await hs();
      ok(u1.shots === u0.shots + 1, `USE while aiming did not take the photo: ${JSON.stringify([u0, u1])}`);
      await page.dispatchEvent('#t-cam', 'pointerup'); await playFor(page, 0.6);
      ok(await G(() => !document.getElementById('t-act').classList.contains('cam') && window.__game.hands.state === 'down'), 'USE kept the shutter (or the camera stayed up) after CAM was let go');
      const slot = (on) => G((on) => { const g = window.__game; g.F.breathUI = on; return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const at = (id) => { const el = document.getElementById(id), cs = getComputedStyle(el); return [cs.right, cs.bottom, cs.width, cs.height, cs.visibility]; };
        r({ breath: at('t-breath'), cover: at('t-cover'), cam: at('t-cam'), light: at('t-light') });
      }))); }, on);
      const s0 = await slot(false), s1 = await slot(true), s2 = await slot(false);
      const pos = (a) => a.slice(0, 4).join();
      ok(pos(s0.breath) === pos(s0.cover) && pos(s1.breath) === pos(s0.breath) && pos(s2.breath) === pos(s0.breath) && pos(s1.cover) === pos(s0.cover), `the slot moved: ${JSON.stringify([s0, s1, s2])}`);
      ok(s0.breath[4] === 'hidden' && s1.breath[4] === 'visible' && s2.breath[4] === 'hidden', `HOLD BREATH does not follow F.breathUI: ${JSON.stringify([s0.breath, s1.breath, s2.breath])}`);
      ok(s0.cam[1] === s0.light[1] && s0.cam[0] !== s0.light[0], `CAM is not beside LIGHT: ${JSON.stringify([s0.cam, s0.light])}`);
      notes.push(`pad: RB/LB breath (covers and held under them), L3 sprint, A interact only, d-pad still (${dpadMoved.toFixed(3)} m), stick ${stickMoved.toFixed(2)} m, look ${tu0.toFixed(2)} -> ${tu1.toFixed(2)} rad with acceleration, Start, View x2; labels Xbox/PS/Switch/keyboard/touch; rebinds (light LB, aim LB) and reset; an old layout replaced; touch CAM tap switch / hold aim, USE the shutter while aiming, the slot fixed`);
      clean(w);
    });
    return notes.join('; ');
  },
};
