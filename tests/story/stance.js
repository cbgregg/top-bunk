'use strict';
// The story state (js/story.js), as a section of tests/story.js:
//   loader    tests/story.js runs any tests/story/<name>.js that exports { name, run(browser, helpers) } (a scratch folder of sections run
//             through --dir: one that passes, one that fails, one that skips, one with no run; --only and --list)
//   types     nightTypes(seed) for seeds 1..50 and 300 more keeps to TYPE_ALLOWED and to the design's rules by name (the parents and the
//             TV on 3-7, the hunt never on 8-9, the vigil on 4-6, the drive on 5-6, Mom's voice from 5), the same twice, eight types
//   stance    stanceOf on synthetic stories; stance() on the game's own RUN.story as the counters climb (dismiss -> blame -> split ->
//             believe), dismiss through night three, the last night read from the stage; the writers; an old save with no story
//   agree     finaleFor(stance) and REG(stance) agree for every stance, and finaleFor() and the breakfast's REG(count) for a grid of runs;
//             finaleFor(count) as the photo-count stand-in smoke's check 6 reads
//   ledger    on #night4&proof=4: a beat with after.witness/blamed adds to RUN.story when it pays off; #proof=4 stands in for 'split'
//   save      RUN.story saved at dawn with the run, restored after a reload and on Continue; a new game starts it from nothing
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const LOADER = path.join(__dirname, '..', 'story.js');
const FIVE = ['proof', 'witness', 'blamed', 'forest', 'dayStrikes'];
const same = (a, b) => JSON.stringify(FIVE.map((k) => a && a[k])) === JSON.stringify(FIVE.map((k) => b && b[k]));

// the loader, run on a scratch folder of sections that need no browser
function loaderCheck(port, ok) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'story-sections-'));
  const write = (f, src) => fs.writeFileSync(path.join(dir, f), src);
  write('a_probe.js', `module.exports = { name: 'probe', browser: false, async run(b, h) {
    if (b !== null) throw new Error('a browser: false section was handed a browser');
    const want = ['alone', 'openGame', 'nightPage', 'stand', 'hold', 'tap', 'until', 'playFor', 'prompt', 'climbDown', 'ok', 'sleep', 'clean', 'watch', 'roomAt', 'newContext', 'PAD', 'base'];
    const miss = want.filter((k) => typeof h[k] !== 'function'); if (miss.length || typeof h.Skip !== 'function') throw new Error('helpers missing: ' + miss.join(','));
    if (!/^http:\\/\\/127\\.0\\.0\\.1:\\d+$/.test(h.base())) throw new Error('no server: ' + h.base());
    return 'probe ran with ' + want.length + ' helpers'; } };\n`);
  write('b_fails.js', "module.exports = { name: 'fails', browser: false, async run() { throw new Error('boom'); } };\n");
  write('c_skips.js', "module.exports = { name: 'skips', browser: false, async run(b, h) { throw new h.Skip('nothing to do'); } };\n");
  write('d_norun.js', "module.exports = { name: 'norun' };\n");
  write('notes.txt', 'not a section\n');
  const run = (...args) => spawnSync(process.execPath, [LOADER, '--dir', dir, ...(port ? ['--port', String(port)] : []), ...args], { encoding: 'utf8', timeout: 120e3 });
  try {
    const all = run(), out = all.stdout;
    ok(all.status === 1, `the loader exited ${all.status} with a failing section: ${out} ${all.stderr}`);
    ok(/^PASS probe: probe ran with 18 helpers/m.test(out), `the probe section did not pass: ${out}`);
    ok(/^FAIL fails: boom/m.test(out) && /^SKIP skips: nothing to do/m.test(out), `fail / skip lines: ${out}`);
    ok(/^FAIL norun: d_norun\.js exports no run/m.test(out), `a section with no run was not reported: ${out}`);
    ok(out.indexOf('PASS probe') < out.indexOf('FAIL fails') && out.indexOf('FAIL fails') < out.indexOf('SKIP skips'), `not in file order: ${out}`);
    ok(/^FAIL story: 1 passed, 2 failed, 1 skipped/m.test(out), `the summary: ${out}`);
    const only = run('--only', 'probe');
    ok(only.status === 0 && /^PASS probe/m.test(only.stdout) && !/fails|skips|norun/.test(only.stdout), `--only probe: ${only.status} ${only.stdout}`);
    const unknown = run('--only', 'nope');
    ok(unknown.status === 2 && /no section named nope/.test(unknown.stderr), `--only nope: ${unknown.status} ${unknown.stderr}`);
    const list = run('--list');
    ok(list.status === 0 && list.stdout.split('\n').filter(Boolean).map((l) => l.split('\t')[0]).join(',') === 'probe,fails,skips,norun', `--list: ${list.stdout}`);
    const ours = spawnSync(process.execPath, [LOADER, '--list'], { encoding: 'utf8', timeout: 60e3 });
    ok(ours.status === 0 && /^stance\tstance\.js$/m.test(ours.stdout), `tests/story has no stance section: ${ours.stdout}`);
    return `a scratch folder of four sections: pass, fail, skip and a missing run each reported in file order, exit 1; --only probe exit 0, --only nope exit 2, --list; tests/story lists ${ours.stdout.split('\n').filter(Boolean).map((l) => l.split('\t')[0]).join(', ')}`;
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
}

module.exports = {
  name: 'stance',
  timeout: 1800e3,
  async run(browser, H) {
    const { alone, openGame, nightPage, until, ok, clean, sleep } = H;
    const notes = [];
    const port = +(H.base().split(':').pop() || 0);

    // ---- the loader
    notes.push(loaderCheck(port ? port + 1 : 0, ok));

    // ---- the night types, the stance, the writers and the agreement, on the title page (the game's own modules and its RUN)
    let roundSeed = null;
    await alone(browser, async (c) => {
      const { page, w } = await openGame(c, '/index.html');
      const r = await page.evaluate(async () => {
        const g = window.__game, story = await import('/js/story.js'), dir = await import('/js/director.js'), rng = await import('/js/rng.js'), bf = await import('/js/breakfast.js');
        const bad = [], out = { bad };
        // the types
        const RULES = [
          ['parents only on 3-7', (t, n) => t !== 'parents' || (n >= 3 && n <= 7)],
          ['static only on 3-7', (t, n) => t !== 'static' || (n >= 3 && n <= 7)],
          ['hunted never on 8-9', (t, n) => t !== 'hunted' || n <= 7],
          ['vigil on 4-6', (t, n) => t !== 'vigil' || (n >= 4 && n <= 6)],
          ['car on 5-6', (t, n) => t !== 'car' || (n >= 5 && n <= 6)],
          ['mimic from 5', (t, n) => t !== 'mimic' || n >= 5],
        ];
        const seeds = [...Array(50)].map((_, i) => String(i + 1)), more = [...Array(300)].map(() => rng.newSeed()), onNight = {};
        for (const s of [...seeds, ...more]) {
          const t = dir.nightTypes(s), t2 = dir.nightTypes(s);
          if (JSON.stringify(t) !== JSON.stringify(t2)) bad.push(`${s}: a different order the second time`);
          if (t[1] !== 'poltergeist' || t[10] !== 'finale') bad.push(`${s}: nights 1 / 10 are ${t[1]} / ${t[10]}`);
          const mid = [2, 3, 4, 5, 6, 7, 8, 9].map((n) => t[n]);
          if (new Set(mid).size !== 8) bad.push(`${s}: a type twice: ${mid}`);
          for (const k of ['static', 'car', 'vigil']) if (!mid.includes(k)) bad.push(`${s}: no ${k} night`);
          mid.forEach((ty, i) => {
            const n = i + 2;
            if (!dir.TYPES.includes(ty)) bad.push(`${s}: night ${n} is ${ty}`);
            if (!story.typeAllowed(ty, n)) bad.push(`${s}: ${ty} on night ${n} breaks TYPE_ALLOWED`);
            for (const [rule, f] of RULES) if (!f(ty, n)) bad.push(`${s}: ${rule} (${ty} on ${n})`);
            if (seeds.includes(s)) ((onNight[ty] ||= new Set())).add(n);
          });
        }
        const m = dir.nightTypes('1'); m[2] = 'nothing'; if (dir.nightTypes('1')[2] === 'nothing') bad.push('nightTypes hands out its remembered copy');
        out.types = Object.fromEntries(Object.entries(onNight).map(([k, v]) => [k, [...v].sort((a, b) => a - b).join('')]));
        out.typesNamed = Object.keys(story.TYPE_ALLOWED).sort().join() === [...dir.TYPES].sort().join();
        // a seed for the save round trip: night four a type that runs to dawn on its own with the player in the bunk
        for (let i = 1; i < 400 && !out.roundSeed; i++) { const s = `STRY-${String(i).padStart(4, '0')}`; if (['quiet', 'teddy', 'thirst'].includes(dir.nightTypes(s)[4])) out.roundSeed = s; }

        // the stance from a story alone
        const cases = [
          [{}, 5, 'dismiss'], [{ blamed: 1 }, 5, 'dismiss'], [{ blamed: 2, proof: 2 }, 5, 'blame'], [{ blamed: 2, proof: 3 }, 5, 'dismiss'],
          [{ blamed: 3, witness: 0.5 }, 5, 'blame'], [{ blamed: 2, witness: 1 }, 5, 'split'], [{ witness: 1.5, proof: 6 }, 6, 'split'],
          [{ witness: 2 }, 5, 'believe'], [{ proof: 7 }, 5, 'believe'], [{ proof: 7, blamed: 4 }, 8, 'believe'], [{ witness: 1, proof: 9 }, 9, 'believe'],
          [{ witness: 3, proof: 9 }, 3, 'dismiss'], [{ blamed: 2 }, 3, 'dismiss'], [{ blamed: 2 }, 4, 'blame'], [{ witness: 1 }, 1, 'dismiss'], [{ witness: 1 }, 10, 'split'],
        ];
        for (const [s, n, want] of cases) { const got = story.stanceOf(s, n); if (got !== want) bad.push(`stanceOf(${JSON.stringify(s)}, ${n}) = ${got}, not ${want}`); }
        out.cases = cases.length;

        // the game's own RUN.story, as the counters climb; the last night from the stage
        const R = g.RUN, F = g.F, keep = { story: R.story, evidence: R.evidence, stage: F.stage, night: R.night };
        const kinds = (k) => ['SCRATCHES', 'FOOTPRINTS', 'CABINETS', 'STATIC', 'DRAWING', 'PHOTO', 'WASHER', 'CHAIR', 'PHONE', 'HANDPRINT', 'TEDDY', 'CANDLE'].slice(0, k);
        try {
          R.story = story.fresh(); R.evidence = []; F.stage = 'b5';
          const steps = [['start', () => {}, 'dismiss'], ['blamed once', () => story.blame(), 'dismiss'], ['blamed twice', () => story.blame(), 'blame'],
            ['Mom looked past you', () => story.witness(0.5), 'blame'], ['and again', () => story.witness(0.5), 'split'], ['Dad saw it', () => story.witness(1), 'believe']];
          out.climb = [];
          for (const [what, f, want] of steps) { f(); const got = story.stance(); out.climb.push(got); if (got !== want) bad.push(`climb, ${what}: ${got}, not ${want} (${JSON.stringify(R.story)})`); }
          if (!(R.story.witness === 2 && R.story.blamed === 2)) bad.push(`the writers: ${JSON.stringify(R.story)}`);
          R.story = story.fresh(); R.evidence = kinds(7); if (story.stance() !== 'believe' || R.story.proof !== 7) bad.push(`seven proof: ${story.stance()} ${JSON.stringify(R.story)}`);
          R.story = { ...story.fresh(), blamed: 2 }; R.evidence = kinds(2); if (story.stance() !== 'blame') bad.push(`blamed twice, two proof: ${story.stance()}`);
          R.evidence = kinds(3); if (story.stance() !== 'dismiss') bad.push(`blamed twice, three proof: ${story.stance()} (blame needs proof under 3)`);
          // the night read from the stage: during night n the last one played is n - 1
          R.story = { ...story.fresh(), witness: 2 }; R.evidence = [];
          const at = (stage, night) => { F.stage = stage; if (night) R.night = night; return [story.lastNight(), story.stance()]; };
          const want = [['n4', 0, 3, 'dismiss'], ['b4', 0, 4, 'believe'], ['d4', 0, 4, 'believe'], ['n10', 0, 9, 'believe'], ['b3', 0, 3, 'dismiss'], ['day', 1, 0, 'dismiss'], ['title', 7, 6, 'believe']];
          for (const [stage, night, ln, st] of want) { const [a, b] = at(stage, night); if (a !== ln || b !== st) bad.push(`at ${stage}${night ? ' (RUN.night ' + night + ')' : ''}: last night ${a}, ${b}; wanted ${ln}, ${st}`); }
          R.night = keep.night;
          // the other writers, and the rounding of halves
          R.story = story.fresh(); story.witness(0.5); story.witness(0.5); story.witness(0.5); story.strike(); story.strike(); story.wentInForest();
          if (!(R.story.witness === 1.5 && R.story.dayStrikes === 2 && R.story.forest === 1 && R.story.blamed === 0)) bad.push(`writers: ${JSON.stringify(R.story)}`);
          // a run saved before there was a story, or with a field missing or broken
          delete R.story; R.evidence = kinds(2); const st = story.state();
          if (JSON.stringify(Object.keys(st)) !== JSON.stringify(['proof', 'witness', 'blamed', 'forest', 'dayStrikes']) || st.proof !== 2 || st.witness !== 0 || R.story !== st) bad.push(`an old save: ${JSON.stringify(st)}`);
          R.story = { witness: 'x', blamed: 1 }; story.state(); if (!(R.story.witness === 0 && R.story.blamed === 1 && R.story.forest === 0 && R.story.dayStrikes === 0)) bad.push(`a broken story: ${JSON.stringify(R.story)}`);

          // the ending and the mornings' register: one row each, never in disagreement
          const PAIR = { low: 'ENDING_ALONE', mid: 'ENDING_TAKEN', high: 'ENDING_BELIEVED' }, WANT = { dismiss: ['low', 'ENDING_ALONE'], blame: ['low', 'ENDING_ALONE'], split: ['mid', 'ENDING_TAKEN'], believe: ['high', 'ENDING_BELIEVED'] };
          out.byStance = {};
          for (const s of story.STANCES) {
            const fin = g.finaleFor(s), reg = bf.REG(s); out.byStance[s] = `${reg}/${fin}`;
            if (PAIR[reg] !== fin) bad.push(`finaleFor('${s}') = ${fin} but REG('${s}') = ${reg}`);
            if (reg !== WANT[s][0] || fin !== WANT[s][1]) bad.push(`${s}: ${reg} / ${fin}, wanted ${WANT[s].join(' / ')}`);
          }
          let grid = 0;
          for (const stage of ['b3', 'b4', 'b6', 'b9', 'n10']) for (let proof = 0; proof <= 9; proof++) for (const witness of [0, 0.5, 1, 1.5, 2, 3]) for (const blamed of [0, 1, 2, 3]) {
            F.stage = stage; R.story = { ...story.fresh(), witness, blamed }; R.evidence = kinds(proof);
            const fin = g.finaleFor(), reg = bf.REG(g.nights.proof.count()), s = story.stance(); grid++;
            if (PAIR[reg] !== fin || story.ending(s) !== fin || story.register(s) !== reg) { bad.push(`${stage} proof ${proof} witness ${witness} blamed ${blamed}: stance ${s}, finale ${fin}, morning ${reg}`); break; }
          }
          out.grid = grid;
          // a bare count is the stand-in the endings were chosen by before (smoke's check 6, #proof=N)
          out.count = [0, 2, 3, 4, 6, 7, 8, 10].map((n) => [n, g.finaleFor(n)]);
          // the morning's lines: none until the breakfast hands in its composer
          F.stage = 'b6'; R.story = { ...story.fresh(), witness: 1 }; R.evidence = [];
          const none = story.morning(6); let told = null;
          story.composeWith((n, ctx) => { told = [n, ctx.stance]; return ['mom/sit']; }); const some = story.morning(6); story.composeWith(null);
          if (none.length !== 0 || JSON.stringify(some) !== '["mom/sit"]' || JSON.stringify(told) !== '[6,"split"]') bad.push(`morning(): ${JSON.stringify([none, some, told])}`);
        } finally { R.story = keep.story; R.evidence = keep.evidence; F.stage = keep.stage; R.night = keep.night; story.state(); }
        out.restored = same(R.story, keep.story);
        return out;
        function same(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
      });
      ok(!r.bad.length, `${r.bad.length} wrong: ${r.bad.slice(0, 4).join(' | ')}`);
      ok(r.typesNamed, 'TYPE_ALLOWED does not name every night type');
      const want3 = { 0: 'ENDING_ALONE', 2: 'ENDING_ALONE', 3: 'ENDING_TAKEN', 4: 'ENDING_TAKEN', 6: 'ENDING_TAKEN', 7: 'ENDING_BELIEVED', 8: 'ENDING_BELIEVED', 10: 'ENDING_BELIEVED' };
      ok(r.count.every(([n, v]) => want3[n] === v), `finaleFor(count): ${JSON.stringify(r.count)}`);
      ok(r.roundSeed, 'no seed with a quiet, teddy or thirst night four in STRY-0001..0399');
      roundSeed = r.roundSeed;
      clean(w); await page.close();
      notes.push(`seeds 1..50 + 300: every night type on its allowed nights (on 1..50: ${Object.entries(r.types).map(([k, v]) => `${k} ${v}`).join(', ')})`);
      notes.push(`${r.cases} stanceOf cases; the run's stance climbs ${r.climb.join(' > ')}; by stance ${Object.entries(r.byStance).map(([k, v]) => `${k} ${v}`).join(', ')}; finaleFor() = REG(count) on ${r.grid} runs`);
    });

    // ---- the ledger writes the story: a beat that pays off with after.witness / after.blamed; #proof=4 stands in for 'split'
    await alone(browser, async (c) => {
      const { page, w } = await nightPage(c, '#night4&proof=4');
      const r = await page.evaluate(async () => {
        const g = window.__game, story = await import('/js/story.js'), events = await import('/js/events.js'), bf = await import('/js/breakfast.js'), log = await import('/js/log.js');
        g.nights.director.stop(); g.nights.hunter.dismiss();
        const before = { ...g.RUN.story }, forcedBefore = [story.stance(), g.finaleFor(), bf.REG(0)], own = story.stanceOf(story.state(), 4);
        events.register({ id: 'storyProbe', tier: 'whisper', minN: 99, maxN: 99, w: 0, anchor: { x: -3, z: -6 }, uses: [], noise: 0,
          pre: () => false, arm: () => ({}), reveal: { by: 'look' }, payoff: () => {}, after: { witness: 1, blamed: 1, log: true }, max: 0, undo: () => {} });
        const armed = events.test.arm('storyProbe', { force: true }), shown = events.test.reveal('storyProbe');
        const row = log.entries().find((e) => e.id === 'storyProbe');
        return { armed, shown, before, after: { ...g.RUN.story }, row: row ? { witness: row.witness, blamed: row.blamed, seen: row.seen } : null,
          stance: story.stance(), finale: g.finaleFor(), reg: bf.REG(0), proof: g.RUN.story.proof, own, forcedBefore };
      });
      ok(r.armed === 'armed' && r.shown, `the probe beat: ${JSON.stringify(r)}`);
      ok(r.after.witness === r.before.witness + 1 && r.after.blamed === r.before.blamed + 1, `the payoff did not reach RUN.story: ${JSON.stringify([r.before, r.after])}`);
      ok(r.row && r.row.witness === 1 && r.row.blamed === 1 && r.row.seen, `the ledger row: ${JSON.stringify(r.row)}`);
      ok(r.own === 'dismiss' && r.forcedBefore.join() === 'split,ENDING_TAKEN,mid', `#proof=4 should stand in for split over the run's own dismiss: ${JSON.stringify(r)}`);
      ok(r.stance === 'split' && r.finale === 'ENDING_TAKEN' && r.reg === 'mid' && r.proof === 4, `#proof=4 after the beat: ${JSON.stringify(r)}`);
      clean(w); await page.close();
      notes.push(`a beat's after { witness: 1, blamed: 1 } took RUN.story from ${r.before.witness}/${r.before.blamed} to ${r.after.witness}/${r.after.blamed}; #proof=4 stands in for split (TAKEN, mid) over the run's own ${r.own}`);
    });

    // ---- saved at dawn, restored after a reload and on Continue; a new game starts from nothing
    await alone(browser, async (c) => {
      const page = await c.newPage(), w = H.watch(page, c);
      const seeded = { seed: roundSeed, night: 4, deaths: 0, dayDone: true, started: 1, evidence: ['SCRATCHES', 'CHAIR', 'PHONE'], evidenceAt: { SCRATCHES: 2, CHAIR: 3, PHONE: 3 }, objDone: {},
        story: { proof: 3, witness: 1.5, blamed: 2, forest: 1, dayStrikes: 2 } };
      await page.addInitScript((run) => {
        window.__norender = true;
        if (!sessionStorage.getItem('seeded')) { sessionStorage.setItem('seeded', '1'); localStorage.setItem('topbunk.run', JSON.stringify(run)); }
      }, seeded);
      const load = async () => {
        await page.goto(H.base() + '/index.html', { waitUntil: 'load', timeout: 180e3 });
        await until(page, () => window.__game && document.getElementById('loading').classList.contains('done'), null, 180e3);
        await page.evaluate(() => { window.__game.renderer.compileAsync = async () => {}; });
        return page.evaluate(() => ({ item: (document.querySelector('#title-menu .mi .ml') || {}).textContent, story: { ...window.__game.RUN.story } }));
      };
      let t = await load();
      ok(t.item === 'Continue · Night 4' && same(t.story, seeded.story), `loaded: ${JSON.stringify(t)}`);
      await page.click('#title-menu [data-entry="continue"]');
      await until(page, () => window.__game.F.stage === 'n4' && window.__game.F.live, null, 240e3);
      const mid = await page.evaluate(async () => {
        const g = window.__game, story = await import('/js/story.js'), events = await import('/js/events.js');
        g.nights.director.stop(); g.nights.hunter.dismiss(); events.suspend(true);   // nothing comes for you: the night only has to reach its dawn
        story.witness(0.5); story.blame();
        const out = { story: { ...g.RUN.story }, type: g.F.typeName, clock: Math.round(g.F.clock) };
        g.F.clock = Math.max(g.F.clock, 356);   // and on to the dawn, which saves the run
        return out;
      });
      ok(mid.story.witness === 2 && mid.story.blamed === 3, `the writes in night four: ${JSON.stringify(mid)}`);
      await until(page, () => window.__game.RUN.night === 5, null, 240e3);
      await sleep(500);
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('topbunk.run')));
      const want = { proof: saved.evidence.length, witness: 2, blamed: 3, forest: 1, dayStrikes: 2 };
      ok(saved.night === 5 && same(saved.story, want), `saved at dawn: night ${saved.night}, story ${JSON.stringify(saved.story)}, wanted ${JSON.stringify(want)}`);
      t = await load();
      ok(t.item === 'Continue · Night 5' && same(t.story, want), `after the reload: ${JSON.stringify(t)}`);
      await page.click('#title-menu [data-entry="continue"]');
      await until(page, () => window.__game.F.stage === 'n5' && window.__game.F.live, null, 240e3);
      const cont = await page.evaluate(async () => {
        const g = window.__game, story = await import('/js/story.js'), bf = await import('/js/breakfast.js');
        g.nights.director.stop(); g.nights.hunter.dismiss();
        return { story: { ...g.RUN.story }, stance: story.stance(), last: story.lastNight(), finale: g.finaleFor(), reg: bf.REG(g.nights.proof.count()) };
      });
      ok(same(cont.story, want) && cont.last === 4 && cont.stance === 'believe' && cont.finale === 'ENDING_BELIEVED' && cont.reg === 'high', `on Continue: ${JSON.stringify(cont)}`);
      clean(w);
      // a new game over it: the story starts from nothing
      t = await load();
      await page.evaluate(() => window.__game.menu.newGame());
      await until(page, () => [...document.querySelectorAll('.mi[data-entry="start"]')].some((e) => e.offsetParent), null, 20e3);
      await page.evaluate(() => [...document.querySelectorAll('.mi[data-entry="start"]')].find((e) => e.offsetParent).click());
      await until(page, () => [...document.querySelectorAll('.mi[data-entry="yes"]')].some((e) => e.offsetParent), null, 20e3);
      await page.evaluate(() => [...document.querySelectorAll('.mi[data-entry="yes"]')].find((e) => e.offsetParent).click());
      await until(page, (s) => window.__game.RUN.seed !== s && window.__game.RUN.night === 1, roundSeed, 120e3);
      const fresh = await page.evaluate(() => ({ story: { ...window.__game.RUN.story }, seed: window.__game.RUN.seed, night: window.__game.RUN.night }));
      ok(same(fresh.story, { proof: 0, witness: 0, blamed: 0, forest: 0, dayStrikes: 0 }) && fresh.seed !== roundSeed, `after New game: ${JSON.stringify(fresh)}`);
      clean(w); await page.close();
      notes.push(`seed ${roundSeed} (night four ${mid.type}): ${JSON.stringify(seeded.story)} restored; +0.5 witness and a blame in night four saved at dawn as ${JSON.stringify(want)}, restored after a reload and on Continue (night five plays under 'believe'); New game resets it`);
    });
    return notes.join('; ');
  },
};
