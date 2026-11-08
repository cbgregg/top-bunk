'use strict';
// The camera and Grandpa's flashlight in the hand (js/hands.js, main.js's takePhoto): the finder is the print's own crop at 16:9 and 4:3,
// the view is 58 degrees while the camera is up and the player's own field of view when it is down, the flash lights the room for exactly
// two frames, the camera comes up in walk mode and on the bunk (where the finder follows the lean over the rail and a shot holds the bottom
// bunk) and never in hiding, a cutscene or once caught, the covers on the bunk put the camera down before they come up, it stays up through
// 60 s of stillness and comes down only for a sprint, hiding and a cutscene (never because proof is near), the roll counts down from 24
// with a 1 s wind-on and a dead click at the end, the run's first shot is logged, and a hip shot keeps proof only when it is in its own
// frame (and is tilted 6-10 degrees). Loaded by tests/smoke.js as a numbered check ("--only camera"); a fake Standard pad, no drawing.
const fs = require('fs');
const path = require('path');

module.exports = {
  name: 'camera',
  timeout: 900e3,
  async run(browser, H) {
    const { alone, nightPage, stand, until, ok, sleep, clean, playFor, tap } = H;
    const notes = [];
    // ---- the source: no proof distance and no idle timer in the hands, and the wrap says 24
    const src = fs.readFileSync(path.join(__dirname, '..', '..', 'js', 'hands.js'), 'utf8');
    ok(!/proof\.near|cameraNear/.test(src), 'hands.js still reads proof.near / cameraNear');
    ok(!/idle|25\s*s|lastMoved|stillFor/i.test(src.replace(/\/\/.*$/gm, '')), 'hands.js has an idle timer on the camera');
    ok(/\$\{FILM\} EXP/.test(src) && /export const FILM = 24\b/.test(src), 'the wrap does not say 24 EXP');

    await alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night2&type=hunted', { pad: true });
      const G = (fn, arg) => page.evaluate(fn, arg);
      // a quiet night: no director, no hunt, no beats, no fear; the player's field of view 70 so "down" is a number to compare with; nothing
      // drawn, not even the print (a shot's render would push the whole never-warmed scene through the software renderer)
      await G(async () => {
        const g = window.__game, ev = await import('/js/events.js');
        g.nights.director.stop(); g.nights.hunter.dismiss(); ev.suspend(true); g.gfx.render = () => {}; g.P.mode = 'walk'; g.F.cutscene = false; g.F.script = false; g.F.noFlash = false; g.F.fear = 0;
        g.settings.set('fov', 70);
      });
      const press = (i, on) => G(([i, on]) => { window.__pad.buttons[i].pressed = on; }, [i, on]);
      const st = () => G(() => { const g = window.__game, h = g.hands; return { state: h.state, active: h.active, aimed: h.aimed, fov: g.camera.fov, mode: g.P.mode, film: g.RUN.film, shots: Object.keys(g.RUN.photos || {}).length }; });
      const quiet = () => G(() => { const g = window.__game; g.F.fear = 0; g.F.cutscene = false; g.F.dead = false; });
      const toCamera = async () => {
        if ((await st()).active !== 'camera') { await tap(page, 3); await playFor(page, 0.5); }
        ok((await st()).active === 'camera', 'Y did not bring the camera out');
      };
      await stand(page, 5.2, -0.15, 1.0, -0.15);   // the mouth of the hall, facing down it

      // ---- the finder is the print's crop (16:9 and 4:3), the view 58 degrees while up and the player's when down
      await toCamera();
      await press(6, true); await playFor(page, 0.6);
      const up = await st();
      ok(up.state === 'up' && up.fov === 58, `the camera up: ${JSON.stringify(up)}`);
      const rectAt = async (wd, ht) => {
        await page.setViewportSize({ width: wd, height: ht }); await sleep(400); await playFor(page, 0.2);
        return G(async () => {
          const { printCrop } = await import('/js/hands.js'), cv = window.__game.renderer.domElement, k = cv.clientWidth / cv.width, cr = printCrop(cv.width, cv.height);
          const box = document.getElementById('finder').firstChild.getBoundingClientRect(), fo = +getComputedStyle(document.getElementById('finder')).opacity;
          return { want: [cr.x * k, cr.y * k, cr.w * k, cr.h * k], got: [box.left, box.top, box.width, box.height], opacity: fo, fov: window.__game.camera.fov, aspect: window.__game.camera.aspect };
        });
      };
      const r169 = await rectAt(960, 540), r43 = await rectAt(800, 600);
      await page.setViewportSize({ width: 960, height: 540 }); await sleep(300);
      for (const [r, n] of [[r169, '16:9'], [r43, '4:3']]) {
        const err = Math.max(...r.want.map((v, i) => Math.abs(v - r.got[i])));
        ok(err <= 2 && r.opacity > 0.9, `${n}: the finder ${r.got.map((v) => v.toFixed(1))} is not the print's crop ${r.want.map((v) => v.toFixed(1))} (off by ${err.toFixed(1)} px, opacity ${r.opacity})`);
      }
      ok(Math.abs(r169.got[2] / 960 - 0.6) < 0.01 && Math.abs(r169.got[3] / 540 - 0.8) < 0.01, `16:9: the finder is not 60 % x 80 %: ${r169.got}`);
      await press(6, false); await playFor(page, 0.4); await quiet();
      await until(page, () => Math.abs(window.__game.camera.fov - 70) < 0.1 && window.__game.hands.state === 'down', null, 20e3).catch(async () => { throw new Error(`the view did not go back to 70 when down: ${JSON.stringify(await st())}`); });
      notes.push(`finder = print crop (16:9 off ${Math.max(...r169.want.map((v, i) => Math.abs(v - r169.got[i]))).toFixed(2)} px, 4:3 off ${Math.max(...r43.want.map((v, i) => Math.abs(v - r43.got[i]))).toFixed(2)} px), fov 58 up / 70 down`);

      // ---- a shot through the finder: 24 -> 23, the run's first shot logged, every shot kept, the flash two frames, the wind-on refuses a second shot
      await press(6, true); await playFor(page, 0.6);
      const s0 = await st();
      ok(s0.film === undefined || s0.film === 24, `a fresh roll is not 24: ${s0.film}`);
      await tap(page, 7);   // RT
      const s1 = await st();
      ok(s1.film === 23 && s1.shots === s0.shots + 1, `RT did not take a shot (24 -> 23, one more print): ${JSON.stringify([s0, s1])}`);
      const first = await G(() => { const g = window.__game, L = (g.RUN.nights && g.RUN.nights[g.F.night] && g.RUN.nights[g.F.night].log) || []; return { n: L.filter((e) => e.id === 'firstShot').length, shot: g.lastShot && { hip: g.lastShot.hip, fov: g.lastShot.fov } }; });
      ok(first.n === 1 && first.shot && !first.shot.hip && first.shot.fov === 58, `the first shot: ${JSON.stringify(first)}`);
      const wind = await G(() => ({ state: window.__game.hands.state, use: window.__game.hands.use() }));
      ok(wind.use === 'wind' && wind.state === 'winding', `straight after a shot it is not winding on: ${JSON.stringify(wind)}`);
      await tap(page, 7);   // a second shot inside the wind-on
      const s2 = await st();
      ok(s2.film === 23 && s2.shots === s1.shots, `a second shot within 1 s was taken: ${JSON.stringify([s1, s2])}`);
      await playFor(page, 0.4);
      const flash = await G(() => ({ frames: window.__game.hands.flashFrames, i: window.__game.hands.flashLight.intensity, isLight: !!window.__game.hands.flashLight.isPointLight }));
      ok(flash.isLight && flash.frames === 2 && flash.i === 0, `the flash was not a PointLight lit for exactly two frames: ${JSON.stringify(flash)}`);
      await playFor(page, 1.0);
      await tap(page, 7);
      const s3 = await st();
      ok(s3.film === 22 && s3.shots === s2.shots + 1, `after the wind-on the next shot was refused: ${JSON.stringify([s2, s3])}`);
      const firstAgain = await G(() => { const g = window.__game; return g.RUN.nights[g.F.night].log.filter((e) => e.id === 'firstShot').length; });
      ok(firstAgain === 1, `firstShot logged ${firstAgain} times`);
      // the end of the roll: the dead click and no print
      await G(() => { window.__game.RUN.film = 0; }); await playFor(page, 1.2);
      const s4 = await st(); await tap(page, 7); const s5 = await st();
      ok(s5.film === 0 && s5.shots === s4.shots, `at 0 a shot was taken: ${JSON.stringify([s4, s5])}`);
      await G(() => { window.__game.RUN.film = 24; });
      notes.push('RT 24 -> 23 with one print kept, firstShot once, a shot inside the 1 s wind-on refused, the flash lit 2 frames, at 0 the dead click and no print');

      // ---- 60 s of stillness: the camera stays up
      await quiet();
      let downAt = null;
      for (let i = 0; i < 30; i++) { await playFor(page, 2, 60e3); const s = await st(); if (s.state !== 'up' && s.state !== 'winding' && downAt === null) downAt = { i, ...s }; }
      ok(downAt === null, `the camera came down while held still: ${JSON.stringify(downAt)}`);
      notes.push('up through 60 s of stillness');

      // ---- never down because proof is near: with every unfound piece of proof said to be right here, it stays where the player put it
      await G(() => { const g = window.__game; g.__near = g.nights.proof.near; g.nights.proof.near = () => true; });
      await press(6, false); await playFor(page, 0.8);
      ok((await st()).state === 'down', 'the camera came up by itself near proof');
      await press(6, true); await playFor(page, 0.8);
      ok((await st()).state === 'up', 'the camera did not stay up near proof');
      await G(() => { const g = window.__game; g.nights.proof.near = g.__near; });

      // ---- down on a sprint start (and back up once the sprint is over, the aim still held), on hiding and in a cutscene
      await stand(page, 5.0, -0.42, 9.0, -0.42);   // down the hall toward the bedrooms
      await press(10, true); await G(() => { window.__pad.axes[1] = -1; }); await playFor(page, 0.5);
      const spr = await st(); const sprinting = await G(() => window.__game.P.sprinting);
      await press(10, false); await G(() => { window.__pad.axes[1] = 0; }); await playFor(page, 0.6);
      const after = await st();
      ok(sprinting && (spr.state === 'down' || spr.state === 'lowering') && after.state === 'up', `a sprint did not put the camera down (or it did not come back): ${JSON.stringify([sprinting, spr, after])}`);
      await stand(page, 5.2, -0.15, 1.0, -0.15);
      for (const [name, set, unset] of [['hiding', 'g.P.mode = "hide"', 'g.P.mode = "walk"'], ['a cutscene', 'g.F.cutscene = true', 'g.F.cutscene = false']]) {
        await G(new Function(`const g = window.__game; ${set};`)); await playFor(page, 0.5);
        const s = await st();
        const act0 = s.active; await tap(page, 3); await playFor(page, 0.2); const act1 = (await st()).active;
        await G(new Function(`const g = window.__game; ${unset};`)); await playFor(page, 0.6);
        const back = await st();
        ok(s.state === 'down' && act0 === act1 && back.state === 'up', `${name}: the camera was not down and refused (${JSON.stringify([s, act0, act1, back])})`);
      }
      notes.push('down on a sprint start (back up after it), in hiding and in a cutscene, and refused there; never up or down because of proof');
      await press(6, false); await playFor(page, 0.5);

      // ---- a hip shot: proof in its own frame is kept, outside it is not; the print is tilted 6-10 degrees
      const hip = async (face) => {
        await G(() => { const g = window.__game; g.RUN.evidence = (g.RUN.evidence || []).filter((k) => k !== 'SCRATCHES'); g.__shown = g.nights.proof.shown; g.nights.proof.shown = () => ['SCRATCHES']; });
        await stand(page, 8.44, 2.75, 8.44, face); await G(() => { window.__game.P.pitch = 0.05; }); await playFor(page, 1.3);
        const r = await G(() => {
          const g = window.__game, before = (g.RUN.evidence || []).includes('SCRATCHES'), use = g.hands.use();
          g.useItem();
          const s = g.lastShot, kept = (g.RUN.evidence || []).includes('SCRATCHES');
          g.nights.proof.shown = g.__shown; g.RUN.evidence = (g.RUN.evidence || []).filter((k) => k !== 'SCRATCHES'); delete (g.RUN.evidenceAt || {}).SCRATCHES; delete (g.RUN.photos || {}).SCRATCHES;
          return { before, use, kept, hip: s && s.hip, tilt: s && Math.abs(s.tilt) * 180 / Math.PI, y: s && s.pos.y, eye: g.camera.position.y, kinds: s && s.kinds };
        });
        return r;
      };
      const hin = await hip(1.14), hout = await hip(6);
      ok(hin.use === 'hip' && hin.hip && hin.kept && !hin.before, `a hip shot facing the closet door's claw marks did not keep them: ${JSON.stringify(hin)}`);
      ok(hout.use === 'hip' && hout.hip && !hout.kept, `a hip shot facing away kept the claw marks: ${JSON.stringify(hout)}`);
      ok(hin.tilt >= 6 && hin.tilt <= 10 && hout.tilt >= 6 && hout.tilt <= 10, `the hip prints are not tilted 6-10 degrees: ${hin.tilt}, ${hout.tilt}`);
      ok(hin.eye - hin.y > 0.15, `the hip shot was not taken from the chest: ${hin.y} with the eye at ${hin.eye}`);
      notes.push(`hip shots: proof in the frame kept, outside not; tilted ${hin.tilt.toFixed(1)} / ${hout.tilt.toFixed(1)} deg from ${(hin.eye - hin.y).toFixed(2)} m below the eye`);

      // ---- on the bunk: the camera comes up, the finder follows the lean over the rail, a shot holds the bottom bunk
      await G(() => { const g = window.__game; g.toBunk(); g.P.yaw = 0; g.P.pitch = -1.15; });
      await press(6, true); await playFor(page, 1.6);
      const bk = await G(() => {
        const g = window.__game, before = Object.keys(g.RUN.photos || {}).length, s0 = g.hands.state, lean = g.F.leanK;
        g.useItem();
        const s = g.lastShot, q = g.camera.getWorldQuaternion(g.camera.quaternion.clone()), lower = g.camera.position.clone().set(8.42, 0.6, 3.82);
        return { mode: g.P.mode, state: s0, lean, shot: !!s && !s.hip, kept: Object.keys(g.RUN.photos || {}).length - before, lower: !!s && s.frustum.containsPoint(lower), followed: !!s && s.quat.angleTo(q) < 0.01 };
      });
      ok(bk.mode === 'bunk' && bk.state === 'up' && bk.lean > 0.8, `the camera on the bunk, leaning over the rail: ${JSON.stringify(bk)}`);
      ok(bk.shot && bk.kept === 1 && bk.lower && bk.followed, `the shot over the rail: ${JSON.stringify(bk)}`);
      // the covers: the breath button on the bunk puts the camera down first, then the covers come up
      await playFor(page, 1.2); await G(() => { window.__game.P.pitch = -0.2; }); await playFor(page, 0.8);
      ok((await st()).state === 'up', 'the camera is not up on the bunk before the covers');
      const seq = [];
      await press(5, true);
      for (let i = 0; i < 40; i++) { const s = await st(); seq.push([s.state, s.mode]); if (s.mode === 'hide') break; await sleep(25); }
      await press(5, false); await press(6, false);
      const firstDown = seq.findIndex(([s]) => s !== 'up'), firstCover = seq.findIndex(([, m]) => m !== 'bunk');
      ok(firstDown >= 0 && firstCover > firstDown, `the covers came up before the camera went down: ${JSON.stringify(seq)}`);
      notes.push(`on the bunk: up, leaning ${bk.lean.toFixed(2)}, a shot over the rail with the bottom bunk in it; the covers lower the camera first (${firstCover - firstDown} samples before)`);
      await G(() => { const g = window.__game; g.toBunk(); g.UI.blanket(false); });

      // ---- caught (last: the night is over after it): the camera goes down and Y is refused, frame by frame
      await press(6, true); await playFor(page, 0.8);
      ok((await st()).state === 'up', 'the camera is not up on the bunk before the catch');
      const dead = await G(() => new Promise((res) => {
        const g = window.__game, t0 = g.gameTime, rec = [], act0 = g.hands.active; let n = 0, sw = null;
        g.caught({ unseen: true });   // the real catch: the flag, the night's waits dropped, the view taken
        const f = () => {
          n++; if (n === 3) { g.switchItem(); sw = g.hands.switchItem(); }
          rec.push([+(g.gameTime - t0).toFixed(2), g.hands.state, g.F.dead]);
          if (g.gameTime - t0 >= 0.45 || !g.F.dead || n > 400) res({ rec, act0, act1: g.hands.active, sw }); else requestAnimationFrame(f);
        };
        requestAnimationFrame(f);
      }));
      await press(6, false);
      const deadRec = dead.rec.filter(([, , d]) => d), late = deadRec.filter(([t]) => t >= 0.33);
      ok(dead.sw === false && dead.act0 === dead.act1 && deadRec.slice(2).every(([, s]) => s !== 'up') && (late.length === 0 || late.every(([, s]) => s === 'down')), `caught: the camera was not put down and refused: ${JSON.stringify(dead)}`);
      notes.push(`caught: down (${deadRec.length} frames watched) and Y refused`);
      clean(w);
    });
    return notes.join('; ');
  },
};
