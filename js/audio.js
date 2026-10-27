// Sound is synthesized with WebAudio. Recorded files (voices, music, jump scares, ambience — made by tools/gen_*.py)
// layer on top when they load; every call falls back to the synth if a file is missing.
export class Sound {
  constructor() { this.ctx = null; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 6;
    this.master = ctx.createGain(); this.master.gain.value = 0.85;
    this.master.connect(this.comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(2.4, 2.6);
    this.reverb.connect(this.master);
    const len = ctx.sampleRate * 2; this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startBeds();
    this.loadFiles();
  }
  suspend() { this.ctx && this.ctx.suspend(); }
  resume() { this.ctx && this.ctx.resume(); }
  get now() { return this.ctx.currentTime; }

  impulse(sec, decay) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  // output bus: gain -> panner -> master, plus reverb send. Auto-disconnects.
  bus(gain = 1, pan = 0, wet = 0.25, life = 3) {
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    const s = ctx.createGain(); s.gain.value = wet;
    g.connect(p).connect(this.master); p.connect(s).connect(this.reverb);
    setTimeout(() => { try { g.disconnect(); p.disconnect(); s.disconnect(); } catch (e) { /* noop */ } }, (life + 3) * 1000);
    return g;
  }
  env(param, t, a, peak, dur, end = 0.0001) {
    param.cancelScheduledValues(t); param.setValueAtTime(0.0001, t);
    param.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + a);
    param.exponentialRampToValueAtTime(end, t + a + dur);
  }
  noiseHit({ dur = 0.1, type = 'lowpass', f = 800, f2 = null, q = 0.7, gain = 0.5, pan = 0, wet = 0.2, attack = 0.003, delay = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now + delay, src = ctx.createBufferSource(); src.buffer = this.noise;
    src.playbackRate.value = 0.8 + Math.random() * 0.4;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = q;
    if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = ctx.createGain(); this.env(g.gain, t, attack, gain, dur);
    src.connect(fl).connect(g).connect(this.bus(1, pan, wet, dur));
    src.start(t, Math.random() * 1.5); src.stop(t + attack + dur + 0.05);
  }
  tone({ type = 'sine', f = 220, f2 = null, dur = 0.3, gain = 0.3, pan = 0, wet = 0.2, attack = 0.005, delay = 0, detune = 0 } = {}) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now + delay, o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f, t); o.detune.value = detune;
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + attack + dur);
    const g = ctx.createGain(); this.env(g.gain, t, attack, gain, dur);
    o.connect(g).connect(this.bus(1, pan, wet, dur)); o.start(t); o.stop(t + attack + dur + 0.05);
  }

  // ---- beds (continuous) ----
  startBeds() {
    const ctx = this.ctx;
    // wind
    const w = ctx.createBufferSource(); w.buffer = this.noise; w.loop = true;
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 380; wf.Q.value = 0.6;
    this.windGain = ctx.createGain(); this.windGain.gain.value = 0;
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.08; const lg = ctx.createGain(); lg.gain.value = 180; lfo.connect(lg).connect(wf.frequency); lfo.start();
    w.connect(wf).connect(this.windGain).connect(this.master); w.start();
    // drone
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 240;
    for (const [f, ty] of [[46.25, 'sawtooth'], [46.9, 'sawtooth'], [69.3, 'sine'], [92.5, 'triangle']]) { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f; o.connect(df); o.start(); }
    const dl = ctx.createOscillator(); dl.frequency.value = 0.05; const dg = ctx.createGain(); dg.gain.value = 90; dl.connect(dg).connect(df.frequency); dl.start();
    df.connect(this.droneGain).connect(this.master);
    // high tension whine
    this.tensionGain = ctx.createGain(); this.tensionGain.gain.value = 0;
    const tw = ctx.createOscillator(); tw.type = 'sine'; tw.frequency.value = 1760; const tw2 = ctx.createOscillator(); tw2.type = 'sine'; tw2.frequency.value = 1767;
    tw.connect(this.tensionGain); tw2.connect(this.tensionGain); tw.start(); tw2.start();
    this.tensionGain.connect(this.master);
    // fridge/house hum
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    const hm = ctx.createOscillator(); hm.type = 'sine'; hm.frequency.value = 60; hm.connect(this.humGain); hm.start();
    this.humGain.connect(this.master);
  }
  set(param, v, time = 1.5) { if (!this.ctx) return; const p = param; p.cancelScheduledValues(this.now); p.setTargetAtTime(v, this.now, time / 3); }
  wind(v, t) { this.ctx && this.set(this.windGain.gain, v, t); }
  drone(v, t) { if (!this.ctx) return; this.set(this.droneGain.gain, v, t); this.bed('sfx/night_brown_noise', v * 40, t); }
  tension(v, t) { if (!this.ctx) return; this.set(this.tensionGain.gain, v, t); this.bed('sfx/waterphone', v * 40, t); }
  hum(v, t) { this.ctx && this.set(this.humGain.gain, v, t); }

  // ---- recorded files ----
  async loadFiles() {
    this.buf = {}; this.want = {}; this.live = {};
    const json = async (p) => { try { const r = await fetch(p); return r.ok ? await r.json() : null; } catch (e) { return null; } };
    const load = async (id, path) => {
      try {
        const r = await fetch(path); if (!r.ok) return;
        this.buf[id] = await this.ctx.decodeAudioData(await r.arrayBuffer());
        if (this.want[id]) this.applyBed(id);
      } catch (e) { /* the synth covers it */ }
    };
    const [vo, sfx, music] = await Promise.all([json('assets/audio/manifest.json'), json('assets/sfx/sfx.json'), json('assets/music/tracks.json')]);
    const first = [];
    for (const f of (vo && vo.files) || []) first.push(load(f, `assets/audio/${f}.mp3`));
    for (const [k, m] of Object.entries(sfx || {})) first.push(load('sfx/' + k, m.file));
    await Promise.all(first);
    for (const [k, m] of Object.entries(music || {})) load('music/' + k, m.file);   // the big loops arrive in the background
  }
  // plays a loaded file once; returns its length in seconds (0 if it isn't loaded, so callers can fall back)
  play(id, { gain = 1, pan = 0, wet = 0.15, delay = 0, muffle = false } = {}) {
    const b = this.buf && this.buf[id]; if (!this.ctx || !b) return 0;
    const src = this.ctx.createBufferSource(); src.buffer = b;
    if (muffle) {   // heard through a wall: low-passed and quiet
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.5;
      src.connect(lp).connect(this.bus(gain * 0.7, pan, wet + 0.1, b.duration));
    } else src.connect(this.bus(gain, pan, wet, b.duration));
    src.start(this.now + delay);
    return b.duration;
  }
  // a loaded file that moves across the stereo field; without the file, a synthesized stand-in
  moving(id, { gain = 1, from = 0.8, to = -0.8, dur = 0 } = {}) {
    if (!this.ctx) return 0;
    const b = this.buf && this.buf[id];
    if (!b) return this.movingSynth(id, from, to, dur || 4);
    const ctx = this.ctx, src = ctx.createBufferSource(); src.buffer = b;
    const g = ctx.createGain(); g.gain.value = gain; const p = ctx.createStereoPanner(), t = this.now, len = dur || b.duration;
    p.pan.setValueAtTime(from, t); p.pan.linearRampToValueAtTime(to, t + len);
    const wet = ctx.createGain(); wet.gain.value = 0.35;
    src.connect(g).connect(p).connect(this.master); p.connect(wet).connect(this.reverb); src.start(t);
    return b.duration;
  }
  movingSynth(id, from, to, dur) {
    const ctx = this.ctx, t = this.now, car = id.includes('car');
    const o = ctx.createOscillator(); o.type = car ? 'sawtooth' : 'sine';
    o.frequency.setValueAtTime(car ? 140 : 520, t); o.frequency.exponentialRampToValueAtTime(car ? 80 : 380, t + dur);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = car ? 400 : 900; bp.Q.value = 3;
    const vib = ctx.createOscillator(); vib.frequency.value = 5; const vg = ctx.createGain(); vg.gain.value = car ? 2 : 14; vib.connect(vg).connect(o.frequency);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(car ? 0.12 : 0.05, t + dur * 0.5); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const p = ctx.createStereoPanner(); p.pan.setValueAtTime(from, t); p.pan.linearRampToValueAtTime(to, t + dur);
    o.connect(bp).connect(g).connect(p).connect(this.master); o.start(t); vib.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
    return dur;
  }
  say(id, { gain = 1.3, muffle = false } = {}) { return this.play('vo/' + id, { gain, wet: 0.12, muffle }); }
  // loudness of a loaded clip, 30 values a second, 0..1 (drives the mouth)
  envelope(id) {
    const b = this.buf && this.buf[id]; if (!b) return null;
    this.envs ||= {}; if (this.envs[id]) return this.envs[id];
    const d = b.getChannelData(0), step = Math.floor(b.sampleRate / 30), n = Math.floor(d.length / step), out = new Float32Array(n);
    let peak = 1e-4; for (let i = 0; i < n; i++) { let s2 = 0; for (let j = 0; j < step; j++) s2 += d[i * step + j] ** 2; out[i] = Math.sqrt(s2 / step); peak = Math.max(peak, out[i]); }
    for (let i = 0; i < n; i++) out[i] = Math.min(1, (out[i] / peak) * 1.25);
    return (this.envs[id] = out);
  }
  // a looping file held at a level; asking again moves the level (and starts it once it has loaded)
  bed(id, v, time = 2) {
    if (!this.ctx || !this.want) return;
    this.want[id] = { v, time }; this.applyBed(id);
  }
  applyBed(id) {
    const b = this.buf[id], w = this.want[id]; if (!b || !w) return;
    let l = this.live[id];
    if (!l) {
      if (w.v <= 0) return;
      const src = this.ctx.createBufferSource(); src.buffer = b; src.loop = true;
      const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g).connect(this.master); src.start();
      l = this.live[id] = { src, g };
    }
    this.set(l.g.gain, w.v, w.time);
  }

  // ---- one-shots ----
  // a footfall is a heel strike then the ball of the foot, a few ms apart, and it sounds different on each floor (each one slightly different from the last)
  footstep(gain = 0.35, pan = 0, wet = 0.15, surface = 'carpet') {
    const v = 0.88 + Math.random() * 0.26, side = (Math.random() - 0.5) * 0.12, gap = 0.055 + Math.random() * 0.025;
    if (surface === 'tile' || surface === false) {   // hard floor: a sharp heel click, a hollow body and a lighter toe tick
      this.noiseHit({ type: 'bandpass', f: 2100 * v, q: 1.4, dur: 0.03, gain: gain * 1.0, pan: pan + side, wet: wet + 0.12, attack: 0.001 });
      this.tone({ f: 190 * v, f2: 95, dur: 0.07, gain: gain * 0.55, pan: pan + side, wet: wet + 0.1 });
      this.noiseHit({ type: 'bandpass', f: 3000 * v, q: 1.1, dur: 0.025, gain: gain * 0.55, pan: pan + side, wet: wet + 0.1, attack: 0.001, delay: gap });
      this.tone({ f: 150 * v, f2: 90, dur: 0.05, gain: gain * 0.25, pan: pan + side, wet, delay: gap });
    } else {   // carpet: a soft, dull thud, the cushioned heel and a little rustle of fibres
      this.noiseHit({ type: 'lowpass', f: 380 * v, dur: 0.1, gain: gain * 1.1, pan: pan + side, wet, attack: 0.006 });
      this.tone({ f: 80 * v, f2: 42, dur: 0.11, gain: gain * 0.8, pan: pan + side, wet, attack: 0.004 });
      this.noiseHit({ type: 'lowpass', f: 650 * v, dur: 0.07, gain: gain * 0.5, pan: pan + side, wet, attack: 0.008, delay: gap });
      this.noiseHit({ type: 'bandpass', f: 2600, q: 0.8, dur: 0.07, gain: gain * 0.1, pan: pan + side, wet: 0.02, attack: 0.01, delay: 0.01 });
      if (Math.random() < 0.1) this.creak(gain * 0.22, pan);   // a board somewhere under the carpet
    }
  }
  grassStep(gain = 0.3, pan = 0) { this.noiseHit({ dur: 0.12, type: 'highpass', f: 1800, gain: gain * 0.5, pan, wet: 0.02 }); }
  heavyStep(gain = 0.6, pan = 0) {
    this.tone({ f: 70, f2: 30, dur: 0.22, gain, pan, wet: 0.35 });
    this.noiseHit({ dur: 0.12, f: 350, gain: gain * 0.7, pan, wet: 0.35 });
  }
  creak(gain = 0.25, pan = 0, delay = 0) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = this.now + delay, o = ctx.createOscillator(); o.type = 'sawtooth';
    const base = 120 + Math.random() * 120; o.frequency.setValueAtTime(base, t); o.frequency.linearRampToValueAtTime(base * 0.7, t + 0.8);
    const am = ctx.createOscillator(); am.frequency.value = 18 + Math.random() * 14; const amg = ctx.createGain(); amg.gain.value = 0.5;
    const g = ctx.createGain(); this.env(g.gain, t, 0.08, gain, 0.8);
    const vca = ctx.createGain(); vca.gain.value = 0.5; am.connect(amg).connect(vca.gain);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 6;
    o.connect(bp).connect(vca).connect(g).connect(this.bus(1, pan, 0.4, 1));
    o.start(t); am.start(t); o.stop(t + 1); am.stop(t + 1);
  }
  heartbeat(gain = 0.5) {
    this.tone({ f: 58, f2: 38, dur: 0.12, gain, wet: 0 });
    this.tone({ f: 52, f2: 34, dur: 0.14, gain: gain * 0.8, wet: 0, delay: 0.17 });
  }
  stinger() {
    if (this.play('sfx/scare_synth', { gain: 1, wet: 0.1 })) { this.play('sfx/scare_bang', { gain: 0.6, delay: 0.05 }); return; }
    for (const f of [185, 196, 207.65, 277, 415.3, 440, 622]) this.tone({ type: 'sawtooth', f, f2: f * 0.94, attack: 0.01, dur: 2.6, gain: 0.07, wet: 0.5, pan: (Math.random() - 0.5) * 0.6 });
    this.noiseHit({ dur: 1.6, type: 'bandpass', f: 3000, f2: 400, q: 0.8, gain: 0.45, wet: 0.5, attack: 0.01 });
    this.tone({ f: 55, f2: 28, dur: 1.4, gain: 0.8, wet: 0.2 });
  }
  scream() {
    if (!this.ctx) return;
    if (this.play('sfx/scare_strings', { gain: 1, wet: 0.1 })) { this.play('sfx/scare_synth', { gain: 0.5, delay: 0.04 }); return; }
    const ctx = this.ctx, t = this.now;
    const vib = ctx.createOscillator(); vib.frequency.value = 28; const vg = ctx.createGain(); vg.gain.value = 60; vib.connect(vg); vib.start(t); vib.stop(t + 1.5);
    for (const f of [520, 610, 880, 1310, 1720]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 1.3); vg.connect(o.frequency);
      const g = ctx.createGain(); this.env(g.gain, t, 0.015, 0.11, 1.3); o.connect(g).connect(this.bus(1, 0, 0.3, 2)); o.start(t); o.stop(t + 1.4);
    }
    this.noiseHit({ dur: 1.2, type: 'bandpass', f: 2200, q: 0.5, gain: 0.9, attack: 0.01, wet: 0.3 });
    this.tone({ f: 60, f2: 25, dur: 1.0, gain: 1, wet: 0.2 });
  }
  // ---- the horror layer: screaming violins (Insidious), a low dread bed, and the small paranormal knocks ----
  // violins(v): 0 silences them, 1 is the full storm. A looping recording, or a synthesized stand-in: detuned sawtooth "violins" with frantic vibrato.
  violins(v, t = 1.5) {
    if (!this.ctx) return;
    this.bed('sfx/violin_storm', v * 0.95, t);
    const have = !!(this.buf && this.buf['sfx/violin_storm']);
    if (!this.strings) {
      const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 0;
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 0.6;
      const vib = ctx.createOscillator(); vib.frequency.value = 6.5; const vg = ctx.createGain(); vg.gain.value = 22; vib.connect(vg); vib.start();
      const slide = ctx.createOscillator(); slide.frequency.value = 0.37; const sg = ctx.createGain(); sg.gain.value = 120; slide.connect(sg); slide.start();
      for (const f of [740, 784, 1109, 1480, 1865, 2217, 2960]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; vg.connect(o.frequency); sg.connect(o.frequency); o.connect(bp); o.start();
      }
      bp.connect(g).connect(this.master); this.strings = { g };
    }
    this.set(this.strings.g.gain, have ? 0 : v * 0.05, t);
  }
  stab() { if (!this.play('sfx/violin_stab', { gain: 1.15, wet: 0.1 })) this.scream(); }
  swell() { if (!this.play('sfx/violin_swell', { gain: 1, wet: 0.1 })) this.tone({ type: 'sawtooth', f: 900, f2: 2400, dur: 6, gain: 0.06, attack: 5, wet: 0.5 }); }
  dread(v, t = 3) { if (!this.ctx) return; this.bed('sfx/low_drone', v, t); this.bed('sfx/whispers', v * 0.8, t); }
  scratch(pan = 0) { if (!this.play('sfx/closet_scratch', { gain: 0.9, pan, wet: 0.3 })) for (let i = 0; i < 7; i++) this.noiseHit({ dur: 0.25, type: 'highpass', f: 2500, gain: 0.18, pan, wet: 0.3, delay: i * 0.35 }); }
  ceilingThump() { if (!this.play('sfx/ceiling_thump', { gain: 0.9, wet: 0.35 })) this.tone({ f: 70, f2: 30, dur: 0.5, gain: 0.8, wet: 0.5 }); }
  slamFar(pan = 0) { if (!this.play('sfx/door_slam_far', { gain: 0.8, pan, wet: 0.4 })) { this.tone({ f: 90, f2: 40, dur: 0.4, gain: 0.7, pan, wet: 0.6 }); this.noiseHit({ dur: 0.2, f: 500, gain: 0.5, pan, wet: 0.6 }); } }
  pop() {
    this.noiseHit({ dur: 0.05, type: 'highpass', f: 2500, gain: 0.7, wet: 0.4 });
    this.tone({ f: 1400, f2: 200, dur: 0.06, gain: 0.25, wet: 0.4 });
    for (let i = 0; i < 4; i++) this.tone({ f: 3000 + Math.random() * 3000, dur: 0.05, gain: 0.05, delay: 0.08 + Math.random() * 0.4, wet: 0.5 });
  }
  splash() { this.noiseHit({ dur: 0.9, type: 'bandpass', f: 1600, f2: 900, q: 0.6, gain: 0.35, attack: 0.08, wet: 0.35 }); }
  thud() {
    if (this.play('sfx/bunk_shove', { gain: 1.1, wet: 0.2 })) return;
    this.tone({ f: 80, f2: 22, dur: 0.6, gain: 1.0, wet: 0.3 });
    this.noiseHit({ dur: 0.25, f: 500, gain: 0.9, wet: 0.3 });
    this.noiseHit({ dur: 0.15, f: 2500, gain: 0.25, wet: 0.2, delay: 0.02 });
  }
  shove() { this.play('sfx/scare_bang', { gain: 0.5 }); this.noiseHit({ dur: 0.25, type: 'bandpass', f: 400, f2: 1600, q: 0.7, gain: 0.7, attack: 0.02, wet: 0.2 }); }
  ring() { this.tone({ f: 3900, dur: 5, gain: 0.05, attack: 0.02, wet: 0 }); }
  whoosh(pan = 0) { this.noiseHit({ dur: 0.7, type: 'bandpass', f: 300, f2: 2400, q: 1.2, gain: 0.45, attack: 0.15, pan, wet: 0.3 }); }
  gasp() { this.noiseHit({ dur: 0.45, type: 'bandpass', f: 1300, f2: 700, q: 1.1, gain: 0.6, attack: 0.04, wet: 0.15 }); }
  breath(inhale = true, gain = 0.12) { this.noiseHit({ dur: inhale ? 0.9 : 1.1, type: 'bandpass', f: inhale ? 900 : 700, f2: inhale ? 1300 : 450, q: 0.8, gain, attack: 0.45, wet: 0.05 }); }
  whisper(pan = 0, gain = 0.2) {
    for (let i = 0; i < 6; i++) this.noiseHit({ dur: 0.12 + Math.random() * 0.15, type: 'bandpass', f: 2500 + Math.random() * 2500, q: 3, gain: gain * (0.5 + Math.random() * 0.5), attack: 0.03, pan, wet: 0.5, delay: i * 0.17 + Math.random() * 0.05 });
  }
  giggle(pan = 0) {
    for (let i = 0; i < 5; i++) this.tone({ type: 'triangle', f: 520 - i * 25, f2: 470 - i * 25, dur: 0.07, gain: 0.05, attack: 0.01, pan, wet: 0.6, delay: i * 0.13 });
  }
  knock(pan = 0, gain = 0.4) { for (let i = 0; i < 3; i++) { this.tone({ f: 140, f2: 70, dur: 0.1, gain, pan, wet: 0.45, delay: i * 0.32 }); this.noiseHit({ dur: 0.05, f: 700, gain: gain * 0.6, pan, wet: 0.45, delay: i * 0.32 }); } }
  chirp(pan = 0) {
    const n = 2 + Math.floor(Math.random() * 3), base = 2600 + Math.random() * 1600;
    for (let i = 0; i < n; i++) this.tone({ f: base, f2: base * (1.2 + Math.random() * 0.4), dur: 0.06, gain: 0.04, attack: 0.005, pan, wet: 0.05, delay: i * 0.11 });
  }
  thump() { this.tone({ f: 90, f2: 40, dur: 0.15, gain: 0.5, wet: 0.2 }); this.noiseHit({ dur: 0.08, f: 600, gain: 0.35 }); }
  click() { this.noiseHit({ dur: 0.02, type: 'highpass', f: 3000, gain: 0.3, wet: 0.02 }); }
}
