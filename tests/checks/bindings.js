'use strict';
// The bindings table (js/settings.js) as js/input.js reads it: the controller layout (camera on Y, flashlight on RB, A interact only,
// breath on the triggers, the d-pad no longer walking, Start pausing, View toggling the journal), the labels and glyphs for the three
// pad styles, a rebind round trip, the look acceleration, and the touch controls (CAM, the fixed HOLD BREATH / COVER UP slot, the
// shutter on USE). Loaded by tests/smoke.js as a numbered check ("--only bindings"); a fake Standard-mapping pad, no drawing.
module.exports = {
  name: 'bindings',
  timeout: 600e3,
  async run(browser, H) {
    const { alone, nightPage, stand, tap, until, ok, sleep, clean, playFor } = H;
    const notes = [];
    await alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night2', { pad: true });
      await page.evaluate(() => { const g = window.__game; g.nights.director.stop(); g.nights.hunter.dismiss(); g.P.mode = 'walk'; g.F.cutscene = false; g.F.script = false; g.F.noFlash = false; });
      const G = (fn, arg) => page.evaluate(fn, arg);
      const hold = async (i, ms) => { await G((i) => { window.__pad.buttons[i].pressed = true; }, i); await sleep(ms); await G((i) => { window.__pad.buttons[i].pressed = false; }, i); await sleep(150); };

      // ---- labels and glyphs on each pad style; the Switch's bottom button is B
      const lab = await G(async () => {
        const { bindingLabel, glyph } = await import('/js/input.js'), s = window.__game.settings, out = {};
        for (const style of ['auto', 'ps', 'switch']) { s.set('promptStyle', style); out[style] = ['camera', 'light', 'interact', 'breath', 'sprint', 'journal', 'cancel', 'pause'].map((a) => bindingLabel(a, 'pad')); }
        s.set('promptStyle', 'auto');
        out.glyphs = { a: glyph('interact', 'pad'), rb: glyph('light', 'pad'), kb: glyph('breath', 'kb'), touch: glyph('interact', 'touch'), kbE: bindingLabel('interact', 'kb'), kbCam: bindingLabel('camera', 'kb') };
        return out;
      });
      ok(lab.auto.join() === 'Y,RB,A,LT,RT,View,B,Start', `Xbox labels: ${lab.auto.join()}`);
      ok(lab.ps.join() === '△,R1,✕,L2,R2,Create,○,Options', `PlayStation labels: ${lab.ps.join()}`);
      ok(lab.switch.join() === 'X,R,B,ZL,ZR,−,A,+', `Switch labels: ${lab.switch.join()}`);
      ok(/class="g g-pad g-xbox g-face g-a"/.test(lab.glyphs.a) && />A</.test(lab.glyphs.a), `the A glyph: ${lab.glyphs.a}`);
      ok(/g-pill/.test(lab.glyphs.rb) && />RB</.test(lab.glyphs.rb) && /<b class="g g-kb">SPACE<\/b>/.test(lab.glyphs.kb) && /g-touch">USE</.test(lab.glyphs.touch), `glyphs: ${JSON.stringify(lab.glyphs)}`);
      ok(lab.glyphs.kbE === 'E' && lab.glyphs.kbCam === 'C', `keyboard labels: ${JSON.stringify(lab.glyphs)}`);

      // ---- Y raises the camera (the callback fires, the hands bring it out), B puts it away
      const fired = () => G(() => ({ ...window.__game.input.fired }));
      const f0 = await fired();
      await tap(page, 3);
      await until(page, () => window.__game.hands.cameraOut, null, 10e3);
      const f1 = await fired();
      ok((f1.camera || 0) === (f0.camera || 0) + 1, `Y did not fire the camera action: ${JSON.stringify([f0, f1])}`);
      await tap(page, 1);   // B
      await until(page, () => !window.__game.hands.cameraOut, null, 10e3);
      const f2 = await fired();
      ok((f2.cancel || 0) === (f1.cancel || 0) + 1, `B did not fire cancel: ${JSON.stringify(f2)}`);

      // ---- RB flips the flashlight; Y no longer does
      const fl0 = await G(() => window.__game.F.flashOn);
      await tap(page, 5);
      ok(await G(() => window.__game.F.flashOn) === !fl0, 'RB did not flip the flashlight');
      await tap(page, 3); await until(page, () => window.__game.hands.cameraOut, null, 10e3);
      ok(await G(() => window.__game.F.flashOn) === !fl0, 'Y changed the flashlight');
      await tap(page, 1); await until(page, () => !window.__game.hands.cameraOut, null, 10e3);
      await tap(page, 5);
      ok(await G(() => window.__game.F.flashOn) === fl0, 'RB again did not put the flashlight back');

      // ---- holding A is not holding your breath; LT (and LB) is
      const downs = async (i) => { await G((i) => { window.__pad.buttons[i].pressed = true; }, i); await sleep(250); const d = await G(() => { const g = window.__game; return { breath: g.input.down('breath'), interact: g.input.down('interact'), sprint: g.input.down('sprint') }; }); await G((i) => { window.__pad.buttons[i].pressed = false; }, i); await sleep(150); return d; };
      const dA = await downs(0), dLT = await downs(6), dLB = await downs(4), dRT = await downs(7), dB = await downs(1);
      ok(dA.interact && !dA.breath && !dA.sprint, `A held: ${JSON.stringify(dA)}`);
      ok(dLT.breath && !dLT.interact && dLB.breath, `LT / LB held: ${JSON.stringify([dLT, dLB])}`);
      ok(dRT.sprint && !dB.sprint, `RT / B held: ${JSON.stringify([dRT, dB])}`);

      // ---- the d-pad no longer moves you; the left stick does
      await stand(page, 5.2, -0.15, 1.0, -0.15);   // the mouth of the hall, facing down it
      const p0 = await G(() => [window.__game.P.pos.x, window.__game.P.pos.z]);
      await hold(12, 700); await hold(15, 400);
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
      const t0 = await turn(0), t1 = await turn(1);
      await G(() => { window.__game.settings.set('padLookAccel', window.__game.settings.defaults.padLookAccel); });
      ok(t0 > 0.5, `the right stick did not turn the view (${t0.toFixed(2)} rad)`);
      ok(t1 >= t0 * 1.4, `look acceleration: ${t1.toFixed(2)} rad with it, ${t0.toFixed(2)} without (want 1.4x)`);
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

      // ---- a rebind round trip: the flashlight on LB, then the defaults back
      const rb = await G(async () => { const { bindingLabel } = await import('/js/input.js'), s = window.__game.settings; s.bindings.light.pad = [4]; return bindingLabel('light', 'pad'); });
      ok(rb === 'LB', `after the rebind the flashlight reads ${rb}`);
      const fa = await G(() => window.__game.F.flashOn);
      await tap(page, 4);
      ok(await G(() => window.__game.F.flashOn) === !fa, 'LB did not flip the flashlight after the rebind');
      await tap(page, 4);
      const rs = await G(async () => { const { bindingLabel } = await import('/js/input.js'), s = window.__game.settings; s.reset(); return { light: bindingLabel('light', 'pad'), breath: bindingLabel('breath', 'pad', 1), table: JSON.stringify(s.bindings) === JSON.stringify(s.defaults.bindings) }; });
      ok(rs.light === 'RB' && rs.breath === 'LB' && rs.table, `settings.reset() did not restore the bindings: ${JSON.stringify(rs)}`);
      const fb = await G(() => window.__game.F.flashOn);
      await tap(page, 4);
      ok(await G(() => window.__game.F.flashOn) === fb, 'LB still flips the flashlight after the reset');
      // bind() swaps a taken button and says which action gave it up
      const sw = await G(async () => { const { bindingLabel } = await import('/js/input.js'), s = window.__game.settings; const gave = s.bind('light', 'pad', 0, 6); const r = { gave, light: bindingLabel('light', 'pad'), breath: bindingLabel('breath', 'pad'), stored: JSON.parse(localStorage.getItem('topbunk.settings') || '{}').bindings.light.pad[0] }; s.reset(); return r; });
      ok(sw.gave === 'breath' && sw.light === 'LT' && sw.breath === 'RB' && sw.stored === 6, `bind() swap: ${JSON.stringify(sw)}`);

      // ---- touch: CAM, the fixed HOLD BREATH / COVER UP slot, the shutter on USE while the camera is up
      await G(() => { dispatchEvent(new Event('touchstart')); });   // the touch scheme comes on with the first touch
      await sleep(200);
      const t0s = await G(() => ({ scheme: document.body.dataset.scheme, on: document.getElementById('touch').classList.contains('on'), cam: !!document.getElementById('t-cam') }));
      ok(t0s.scheme === 'touch' && t0s.on && t0s.cam, `the touch controls: ${JSON.stringify(t0s)}`);
      const fc0 = await fired();
      await page.dispatchEvent('#t-cam', 'pointerdown');
      await until(page, () => window.__game.hands.cameraOut, null, 10e3);
      const fc1 = await fired();
      ok((fc1.camera || 0) === (fc0.camera || 0) + 1, `the CAM button did not fire the camera action: ${JSON.stringify([fc0, fc1])}`);
      await until(page, () => window.__game.hands.raised, null, 10e3); await sleep(100);
      const shutter = await G(() => { const b = document.getElementById('t-act'); return { cam: b.classList.contains('cam'), svg: !!b.querySelector('svg.shutter'), svgShown: getComputedStyle(b.querySelector('svg.shutter')).display !== 'none', textShown: getComputedStyle(b.querySelector('span')).display !== 'none' }; });
      ok(shutter.cam && shutter.svg && shutter.svgShown && !shutter.textShown, `USE while the camera is up: ${JSON.stringify(shutter)}`);
      await page.dispatchEvent('#t-cam', 'pointerdown');
      await until(page, () => !window.__game.hands.cameraOut, null, 10e3); await sleep(100);
      ok(await G(() => !document.getElementById('t-act').classList.contains('cam')), 'USE kept the shutter after the camera went down');
      const slot = (on) => G((on) => { const g = window.__game; g.F.breathUI = on; return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => {
        const at = (id) => { const el = document.getElementById(id), cs = getComputedStyle(el); return [cs.right, cs.bottom, cs.width, cs.height, cs.visibility]; };
        r({ breath: at('t-breath'), cover: at('t-cover'), cam: at('t-cam'), light: at('t-light') });
      }))); }, on);
      const s0 = await slot(false), s1 = await slot(true), s2 = await slot(false);
      const pos = (a) => a.slice(0, 4).join();
      ok(pos(s0.breath) === pos(s0.cover) && pos(s1.breath) === pos(s0.breath) && pos(s2.breath) === pos(s0.breath) && pos(s1.cover) === pos(s0.cover), `the slot moved: ${JSON.stringify([s0, s1, s2])}`);
      ok(s0.breath[4] === 'hidden' && s1.breath[4] === 'visible' && s2.breath[4] === 'hidden', `HOLD BREATH does not follow F.breathUI: ${JSON.stringify([s0.breath, s1.breath, s2.breath])}`);
      ok(s0.cam[1] === s0.light[1] && s0.cam[0] !== s0.light[0], `CAM is not beside LIGHT: ${JSON.stringify([s0.cam, s0.light])}`);
      notes.push(`pad: Y camera, B stow, RB light, A interact only, LT/LB breath, RT sprint, d-pad still (${dpadMoved.toFixed(3)} m), stick ${stickMoved.toFixed(2)} m, look ${t0.toFixed(2)} -> ${t1.toFixed(2)} rad with acceleration, Start, View x2; labels Xbox/PS/Switch; rebind LB and reset; touch CAM, the shutter on USE, the slot fixed`);
      clean(w);
    });
    return notes.join('; ');
  },
};
