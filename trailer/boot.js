// Live preview of the trailer in a browser, without the headless harness: serve the repo with `node trailer/render.js --serve` and open
//   index.html?trailer=1            the landscape cut        index.html?trailer=1&aspect=portrait   the portrait cut (use a tall window)
//   &music=/path/to/track.wav       a licensed recording     &lb=1   2.39:1 letterbox bars           &bio=1  the "link in bio" end card
//   &cta=web                        the portrait end card offers the browser build instead of the Steam page
// The server adds this script to index.html; the game itself is untouched, and without ?trailer=1 this does nothing.
const q = new URLSearchParams(location.search);
if (q.get('trailer')) {
  const ready = () => (window.__game && window.__game.E && window.__game.E.rig && window.__game.mom.rig && window.__game.dad.rig ? Promise.resolve() : new Promise((r) => setTimeout(r, 120)).then(ready));
  ready().then(() => import('./trailer.js')).then(async (m) => {
    const game = window.__game, aspect = q.get('aspect') || (innerHeight > innerWidth ? 'portrait' : 'landscape');
    const player = m.attach(game, { aspect, fps: 60, linkInBio: q.get('bio') === '1', cta: q.get('cta') || '' });
    const go = document.createElement('div');
    go.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:#000;color:#e9e2d0;font:24px "Special Elite",monospace;letter-spacing:3px;cursor:pointer';
    go.textContent = `click to play the ${aspect} trailer`; document.body.appendChild(go);
    await new Promise((r) => go.addEventListener('click', r, { once: true }));
    go.remove();
    await player.begin({ letterbox: q.get('lb') === '1' });
    const audio = await liveAudio(aspect, q.get('music') || 'trailer/music/placeholder.wav', player).catch((e) => { console.warn('trailer audio failed', e); return null; });
    const t0 = performance.now();
    player.play(t0); if (audio) audio.start();
  });
}

// the times in the sheets: seconds, or a string in the cut's marks ("TURN+2.5"; TURN, DROP, DURATION, ACT2 = DROP-TURN), or for a cue a shot and
// a point in it ({shot, at} seconds in, {shot, k} a fraction). The same rules as render.js, resolved in place.
function resolveTimes(cues, plan, marks, shots) {
  const m = { ...marks, ACT2: marks.DROP - marks.TURN };
  const ex = (v) => { if (typeof v !== 'string') return v; if (!/^[\d\s.+\-*/()A-Z_]+$/.test(v)) throw new Error('bad time ' + v); return Function(...Object.keys(m), 'return (' + v + ')')(...Object.values(m)); };
  for (const c of cues) {
    if (c.shot) { const s = shots.find((x) => x.id === c.shot); if (!s) throw new Error('cue names no shot: ' + c.shot); c.t = s.t + (c.k !== undefined ? c.k * s.dur : ex(c.at) || 0); delete c.shot; delete c.at; delete c.k; }
    else c.t = ex(c.t);
  }
  for (const s of plan.segments || []) { s.out = s.out.map(ex); if (s.src !== undefined) s.src = ex(s.src); }
  plan.mute = (plan.mute || []).map((w) => w.map(ex));
  return plan;
}

// the soundtrack in the browser: the same cue sheet and music plan the renderer mixes with ffmpeg, played through WebAudio
async function liveAudio(aspect, musicUrl, player) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)(), duration = player.duration;
  const [cues, plan] = await Promise.all([fetch(aspect === 'portrait' ? 'trailer/cues_portrait.json' : 'trailer/cues.json').then((r) => r.json()), fetch('trailer/music_plan.json').then((r) => r.json())]);
  const P = resolveTimes(cues, plan[aspect], player.marks, player.SHOTS);
  const load = async (url) => ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
  const bufs = new Map(); const get = async (f) => { if (!bufs.has(f)) bufs.set(f, load(f)); return bufs.get(f); };
  const music = await get(musicUrl); await Promise.all(cues.map((c) => get(c.file)));
  const master = ctx.createGain(); master.connect(ctx.destination);
  // the render's small room (an echo of a bedroom's walls) as a short impulse response, and its tanh drive as a wave shaper
  const room = (wet) => { const n = Math.round(ctx.sampleRate * 0.07), ir = ctx.createBuffer(2, n, ctx.sampleRate); for (let ch = 0; ch < 2; ch++) { const d = ir.getChannelData(ch); d[0] = 1; [13, 23, 31, 43, 59].forEach((ms, i) => { d[Math.min(n - 1, Math.round(ms * ctx.sampleRate / 1000))] += [0.5, 0.42, 0.35, 0.27, 0.2][i] * wet; }); } const cv = ctx.createConvolver(); cv.normalize = false; cv.buffer = ir; return cv; };
  const drive = (k) => { const ws = ctx.createWaveShaper(), curve = new Float32Array(1024); for (let i = 0; i < 1024; i++) { const x = i / 511.5 - 1; curve[i] = Math.tanh(x * k) / Math.sqrt(k); } ws.curve = curve; return ws; };
  // the song steps down under the voice lines (plan.duck), over the same windows render.js uses; overlapping windows merge into one
  const bed = ctx.createGain(); bed.connect(master);
  const ducks = [];
  if (P.duck) {
    const r = P.duck.ramp ?? 0.3;
    for (const c of cues.filter((x) => x.duck !== false && /(^|\/)assets\/audio\/vo\//.test(x.file)).sort((x, y) => x.t - y.t)) {
      const bf = await bufs.get(c.file), w = [c.t, c.t + (c.dur || bf.duration - (c.src || 0))], last = ducks[ducks.length - 1];
      if (last && w[0] - r <= last[1] + r) last[1] = Math.max(last[1], w[1]); else ducks.push(w);
    }
  }
  return { start() {
    const t0 = ctx.currentTime + 0.1;
    for (const [a, b] of P.mute || []) { master.gain.setValueAtTime(1, t0 + a - 0.005); master.gain.linearRampToValueAtTime(0, t0 + a); master.gain.setValueAtTime(0, t0 + b); master.gain.linearRampToValueAtTime(1, t0 + b + 0.02); }
    // under a mute the tape's own hiss carries on (P.muteFloor dBFS), as render.js lays it: band-limited noise, gated to the windows
    if (P.muteFloor !== undefined && (P.mute || []).length) {
      const n = ctx.sampleRate * 2, nb = ctx.createBuffer(1, n, ctx.sampleRate), d = nb.getChannelData(0); for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource(); src.buffer = nb; src.loop = true;
      const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 500; const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000;
      const g = ctx.createGain(), v = Math.pow(10, P.muteFloor / 20) * Math.sqrt(3); g.gain.setValueAtTime(0, t0);
      for (const [a, b] of P.mute) { g.gain.setValueAtTime(v, t0 + a); g.gain.setValueAtTime(0, t0 + b); }
      src.connect(hp).connect(lp).connect(g).connect(ctx.destination); src.start(t0); src.stop(t0 + duration);
    }
    if (ducks.length) { const g = P.duck.gain ?? 0.4, r = P.duck.ramp ?? 0.3; for (const [a, b] of ducks) { bed.gain.setValueAtTime(1, t0 + Math.max(0, a - r)); bed.gain.linearRampToValueAtTime(g, t0 + a); bed.gain.setValueAtTime(g, t0 + b); bed.gain.linearRampToValueAtTime(1, t0 + b + r); } }
    for (const s of P.segments) {
      const [a, b] = s.out, len = b - a, src = ctx.createBufferSource(); src.buffer = music; src.playbackRate.value = s.rate || 1;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = s.lp || 20000;
      const g = ctx.createGain(); const v = s.gain ?? 1;
      g.gain.setValueAtTime(s.fadeIn ? 0.0001 : v, t0 + a); if (s.fadeIn) g.gain.linearRampToValueAtTime(v, t0 + a + s.fadeIn);
      if (s.fadeOut) { g.gain.setValueAtTime(v, t0 + b - s.fadeOut); g.gain.linearRampToValueAtTime(0.0001, t0 + b); }
      if (s.vib) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.45; lg.gain.value = s.vib * 0.03 * (s.rate || 1); lfo.connect(lg).connect(src.playbackRate); lfo.start(t0 + a); lfo.stop(t0 + b); }
      let tail = src.connect(lp); if (s.hp) { const hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = s.hp; tail = tail.connect(hp); }
      if (s.room) tail = tail.connect(room(s.room));
      tail.connect(g).connect(bed); src.start(t0 + a, s.src, len * (s.rate || 1));
    }
    for (const c of cues) {
      const buf = bufs.get(c.file); buf.then((bf) => {
        const src = ctx.createBufferSource(); src.buffer = bf; let node = src;
        if (c.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = c.lp; node.connect(f); node = f; }
        if (c.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = c.hp; node.connect(f); node = f; }
        if (c.drive) { const ws = drive(c.drive); node.connect(ws); node = ws; }
        if (c.room) { const cv = room(c.room); node.connect(cv); node = cv; }
        const pan = ctx.createStereoPanner(); pan.pan.value = c.pan || 0; const g = ctx.createGain(), v = c.gain ?? 1, len = c.dur || bf.duration - (c.src || 0);
        g.gain.setValueAtTime(c.fadeIn ? 0.0001 : v, t0 + c.t); if (c.fadeIn) g.gain.linearRampToValueAtTime(v, t0 + c.t + c.fadeIn);
        if (c.fadeOut) { g.gain.setValueAtTime(v, t0 + c.t + len - c.fadeOut); g.gain.linearRampToValueAtTime(0.0001, t0 + c.t + len); }
        node.connect(pan).connect(g).connect(master); src.start(t0 + c.t, c.src || 0, len);
      });
    }
    setTimeout(() => ctx.close(), (duration + 1) * 1000);
  } };
}
