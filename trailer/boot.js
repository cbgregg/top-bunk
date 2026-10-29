// Live preview of the trailer in a browser, without the headless harness: serve the repo with `node trailer/render.js --serve` and open
//   index.html?trailer=1            the landscape cut        index.html?trailer=1&aspect=portrait   the portrait cut (use a tall window)
//   &music=/path/to/track.wav       a licensed recording     &lb=1   2.39:1 letterbox bars           &bio=1  the "link in bio" end card
// The server adds this script to index.html; the game itself is untouched, and without ?trailer=1 this does nothing.
const q = new URLSearchParams(location.search);
if (q.get('trailer')) {
  const ready = () => (window.__game && window.__game.E && window.__game.E.rig && window.__game.mom.rig && window.__game.dad.rig ? Promise.resolve() : new Promise((r) => setTimeout(r, 120)).then(ready));
  ready().then(() => import('./trailer.js')).then(async (m) => {
    const game = window.__game, aspect = q.get('aspect') || (innerHeight > innerWidth ? 'portrait' : 'landscape');
    const player = m.attach(game, { aspect, fps: 60, linkInBio: q.get('bio') === '1' });
    const go = document.createElement('div');
    go.style.cssText = 'position:fixed;inset:0;z-index:70;display:flex;align-items:center;justify-content:center;background:#000;color:#e9e2d0;font:24px "Special Elite",monospace;letter-spacing:3px;cursor:pointer';
    go.textContent = `click to play the ${aspect} trailer`; document.body.appendChild(go);
    await new Promise((r) => go.addEventListener('click', r, { once: true }));
    go.remove();
    await player.begin({ letterbox: q.get('lb') === '1' });
    const audio = await liveAudio(aspect, q.get('music') || 'trailer/music/placeholder.wav', player.duration).catch((e) => { console.warn('trailer audio failed', e); return null; });
    const t0 = performance.now();
    player.play(t0); if (audio) audio.start();
  });
}

// the soundtrack in the browser: the same cue sheet and music plan the renderer mixes with ffmpeg, played through WebAudio
async function liveAudio(aspect, musicUrl, duration) {
  const ctx = new (window.AudioContext || window.webkitAudioContext)();
  const [cues, plan] = await Promise.all([fetch(aspect === 'portrait' ? 'trailer/cues_portrait.json' : 'trailer/cues.json').then((r) => r.json()), fetch('trailer/music_plan.json').then((r) => r.json())]);
  const P = plan[aspect];
  const load = async (url) => ctx.decodeAudioData(await (await fetch(url)).arrayBuffer());
  const bufs = new Map(); const get = async (f) => { if (!bufs.has(f)) bufs.set(f, load(f)); return bufs.get(f); };
  const music = await get(musicUrl); await Promise.all(cues.map((c) => get(c.file)));
  const master = ctx.createGain(); master.connect(ctx.destination);
  return { start() {
    const t0 = ctx.currentTime + 0.1;
    for (const [a, b] of P.mute || []) { master.gain.setValueAtTime(1, t0 + a - 0.005); master.gain.linearRampToValueAtTime(0, t0 + a); master.gain.setValueAtTime(0, t0 + b); master.gain.linearRampToValueAtTime(1, t0 + b + 0.02); }
    for (const s of P.segments) {
      const [a, b] = s.out, len = b - a, src = ctx.createBufferSource(); src.buffer = music; src.playbackRate.value = s.rate || 1;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = s.lp || 20000;
      const g = ctx.createGain(); const v = s.gain ?? 1;
      g.gain.setValueAtTime(s.fadeIn ? 0.0001 : v, t0 + a); if (s.fadeIn) g.gain.linearRampToValueAtTime(v, t0 + a + s.fadeIn);
      if (s.fadeOut) { g.gain.setValueAtTime(v, t0 + b - s.fadeOut); g.gain.linearRampToValueAtTime(0.0001, t0 + b); }
      if (s.vib) { const lfo = ctx.createOscillator(), lg = ctx.createGain(); lfo.frequency.value = 0.45; lg.gain.value = s.vib * 0.03 * (s.rate || 1); lfo.connect(lg).connect(src.playbackRate); lfo.start(t0 + a); lfo.stop(t0 + b); }
      src.connect(lp).connect(g).connect(master); src.start(t0 + a, s.src, len * (s.rate || 1));
    }
    for (const c of cues) {
      const buf = bufs.get(c.file); buf.then((bf) => {
        const src = ctx.createBufferSource(); src.buffer = bf; let node = src;
        if (c.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = c.lp; node.connect(f); node = f; }
        if (c.hp) { const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = c.hp; node.connect(f); node = f; }
        const pan = ctx.createStereoPanner(); pan.pan.value = c.pan || 0; const g = ctx.createGain(), v = c.gain ?? 1, len = c.dur || bf.duration;
        g.gain.setValueAtTime(c.fadeIn ? 0.0001 : v, t0 + c.t); if (c.fadeIn) g.gain.linearRampToValueAtTime(v, t0 + c.t + c.fadeIn);
        if (c.fadeOut) { g.gain.setValueAtTime(v, t0 + c.t + len - c.fadeOut); g.gain.linearRampToValueAtTime(0.0001, t0 + c.t + len); }
        node.connect(pan).connect(g).connect(master); src.start(t0 + c.t, 0, len);
      });
    }
    setTimeout(() => ctx.close(), (duration + 1) * 1000);
  } };
}
