// Sound is synthesized with WebAudio. Recorded files (voices, music, jump scares and ambience, made by tools/gen_*.py)
// layer on top when they load; every call falls back to the synth if a file is missing.
// Every source goes through one of three buses (music, sfx, voice) on its way to the master, each with its own reverb send so its
// volume covers its share of the reverb too. Synthesized sounds are sfx; a file's bus comes from its id (vo/ and music/) or its sfx.json kind.
export const BUSES = ['music', 'sfx', 'voice'];
export class Sound {
  constructor() { this.ctx = null; this.level = 0.85; this.vol = { music: 1, sfx: 1, voice: 1 }; }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.comp = ctx.createDynamicsCompressor();
    this.comp.threshold.value = -14; this.comp.ratio.value = 6;
    this.master = ctx.createGain(); this.master.gain.value = this.level;
    this.master.connect(this.comp).connect(ctx.destination);
    this.reverb = ctx.createConvolver(); this.reverb.buffer = this.impulse(2.4, 2.6);
    this.reverb.connect(this.master);
    this.buses = {}; this.sends = {};
    for (const k of BUSES) { (this.buses[k] = ctx.createGain()).connect(this.master); (this.sends[k] = ctx.createGain()).connect(this.reverb); this.buses[k].gain.value = this.sends[k].gain.value = this.vol[k]; }
    const len = ctx.sampleRate * 2; this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noise.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.startBeds();
    this.loadFiles();
  }
  suspend() { this.ctx && this.ctx.suspend(); }
  resume() { this.ctx && this.ctx.resume(); }
  get now() { return this.ctx.currentTime; }
  // the player's volume for 'master' | 'music' | 'sfx' | 'voice', 0..1 (kept until init when there is no context yet)
  setVolume(bus, v) {
    v = Math.max(0, Math.min(1, +v || 0));
    const to = (p) => { p.cancelScheduledValues(this.now); p.value = v; };
    if (bus === 'master') { this.level = v; if (this.ctx) to(this.master.gain); return; }
    if (!(bus in this.vol)) return;
    this.vol[bus] = v; if (this.ctx) { to(this.buses[bus].gain); to(this.sends[bus].gain); }
  }
  kindOf(id) { return id.startsWith('vo/') ? 'voice' : id.startsWith('music/') || (this.kinds && this.kinds[id] === 'music') ? 'music' : 'sfx'; }

  impulse(sec, decay) {
    const ctx = this.ctx, n = ctx.sampleRate * sec, b = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) { const d = b.getChannelData(c); for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, decay); }
    return b;
  }
  // output bus: gain -> panner -> the kind's bus, plus reverb send. Auto-disconnects.
  bus(gain = 1, pan = 0, wet = 0.25, life = 3, kind = 'sfx') {
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = gain;
    const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    const s = ctx.createGain(); s.gain.value = wet;
    g.connect(p).connect(this.buses[kind] || this.buses.sfx); p.connect(s).connect(this.sends[kind] || this.sends.sfx);
    setTimeout(() => { try { g.disconnect(); p.disconnect(); s.disconnect(); } catch (e) { /* ignore */ } }, (life + 3) * 1000);
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
    w.connect(wf).connect(this.windGain).connect(this.buses.sfx); w.start();
    // drone
    this.droneGain = ctx.createGain(); this.droneGain.gain.value = 0;
    const df = ctx.createBiquadFilter(); df.type = 'lowpass'; df.frequency.value = 240;
    for (const [f, ty] of [[46.25, 'sawtooth'], [46.9, 'sawtooth'], [69.3, 'sine'], [92.5, 'triangle']]) { const o = ctx.createOscillator(); o.type = ty; o.frequency.value = f; o.connect(df); o.start(); }
    const dl = ctx.createOscillator(); dl.frequency.value = 0.05; const dg = ctx.createGain(); dg.gain.value = 90; dl.connect(dg).connect(df.frequency); dl.start();
    df.connect(this.droneGain).connect(this.buses.sfx);
    // tension: a low, slow swell (no high tones: a pair of sines close together beats like a ringing in the ears)
    this.tensionGain = ctx.createGain(); this.tensionGain.gain.value = 0;
    const tw = ctx.createOscillator(); tw.type = 'sine'; tw.frequency.value = 58; const tw2 = ctx.createOscillator(); tw2.type = 'triangle'; tw2.frequency.value = 87.3;
    const tl = ctx.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 220;
    tw.connect(tl); tw2.connect(tl); tl.connect(this.tensionGain); tw.start(); tw2.start();
    this.tensionGain.connect(this.buses.sfx);
    // fridge/house hum
    this.humGain = ctx.createGain(); this.humGain.gain.value = 0;
    const hm = ctx.createOscillator(); hm.type = 'sine'; hm.frequency.value = 60; hm.connect(this.humGain); hm.start();
    this.humGain.connect(this.buses.sfx);
  }
  set(param, v, time = 1.5) { if (!this.ctx) return; const p = param; p.cancelScheduledValues(this.now); p.setTargetAtTime(v, this.now, time / 3); }
  wind(v, t) { this.ctx && this.set(this.windGain.gain, v, t); }
  drone(v, t) { if (!this.ctx) return; this.set(this.droneGain.gain, v, t); this.bed('sfx/night_brown_noise', v * 40, t); }
  tension(v, t) { if (!this.ctx) return; this.set(this.tensionGain.gain, v * 2.2, t); }
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
      } catch (e) { /* ignore */ }
    };
    const [vo, sfx, music] = await Promise.all([json('assets/audio/manifest.json'), json('assets/sfx/sfx.json'), json('assets/music/tracks.json')]);
    this.kinds = {}; for (const [k, m] of Object.entries(sfx || {})) this.kinds['sfx/' + k] = m.kind;   // (which bus each file plays on)
    const first = [];
    for (const f of (vo && vo.files) || []) first.push(load(f, `assets/audio/${f}.mp3`));
    for (const [k, m] of Object.entries(sfx || {})) first.push(load('sfx/' + k, m.file));
    await Promise.all(first);
    for (const [k, m] of Object.entries(music || {})) load('music/' + k, m.file);   // the big loops arrive in the background
  }
  // plays a loaded file once; returns its length in seconds (0 if it isn't loaded, so callers can fall back)
  play(id, { gain = 1, pan = 0, wet = 0.15, delay = 0, muffle = false } = {}) {
    const b = this.buf && this.buf[id]; if (!this.ctx || !b) return 0;
    const src = this.ctx.createBufferSource(); src.buffer = b; const kind = this.kindOf(id);
    if (muffle) {   // heard through a wall: low-passed and quiet
      const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 650; lp.Q.value = 0.5;
      src.connect(lp).connect(this.bus(gain * 0.7, pan, wet + 0.1, b.duration, kind));
    } else src.connect(this.bus(gain, pan, wet, b.duration, kind));
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
    const kind = this.kindOf(id); src.connect(g).connect(p).connect(this.buses[kind]); p.connect(wet).connect(this.sends[kind]); src.start(t);
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
    o.connect(bp).connect(g).connect(p).connect(this.buses.sfx); o.start(t); vib.start(t); o.stop(t + dur + 0.1); vib.stop(t + dur + 0.1);
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
      const g = this.ctx.createGain(); g.gain.value = 0; src.connect(g).connect(this.buses[this.kindOf(id)]); src.start();
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
  scream() {
    if (!this.ctx) return;
    if (this.play('sfx/scare_strings', { gain: 2.0, wet: 0.1 })) { this.play('sfx/scare_synth', { gain: 1.0, delay: 0.04 }); return; }
    const ctx = this.ctx, t = this.now;
    const vib = ctx.createOscillator(); vib.frequency.value = 28; const vg = ctx.createGain(); vg.gain.value = 60; vib.connect(vg); vib.start(t); vib.stop(t + 1.5);
    for (const f of [520, 610, 880, 1310, 1720]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(f, t); o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 1.3); vg.connect(o.frequency);
      const g = ctx.createGain(); this.env(g.gain, t, 0.015, 0.11, 1.3); o.connect(g).connect(this.bus(1, 0, 0.3, 2)); o.start(t); o.stop(t + 1.4);
    }
    this.noiseHit({ dur: 1.2, type: 'bandpass', f: 2200, q: 0.5, gain: 0.9, attack: 0.01, wet: 0.3 });
    this.tone({ f: 60, f2: 25, dur: 1.0, gain: 1, wet: 0.2 });
  }
  // a kitchen cabinet door thrown shut: a hollow wood clap, then a rattle of dishes
  cabinet(pan = 0, gain = 1) {
    this.noiseHit({ dur: 0.05, type: 'bandpass', f: 1800, q: 1.2, gain: 1.1 * gain, pan, attack: 0.001, wet: 0.2 });
    this.tone({ type: 'triangle', f: 210, f2: 120, dur: 0.14, gain: 0.7 * gain, pan, wet: 0.15 });
    this.noiseHit({ dur: 0.5, type: 'highpass', f: 3000, gain: 0.25 * gain, pan, wet: 0.3 });
  }
  // a piano hammered at the bottom of the keys: a dissonant cluster let ring, a dead thump under it
  pianoSlam(k = 1) {
    if (!this.ctx) return;
    for (const f of [41.2, 43.7, 55, 58.3, 82.4, 87.3, 110, 116.5, 164.8, 174.6]) this.tone({ type: 'triangle', f, dur: 2.8, gain: 0.16 * k, attack: 0.002, wet: 0.45 });
    for (const f of [40, 46]) this.tone({ type: 'sawtooth', f, f2: f * 0.5, dur: 1.4, gain: 0.22 * k, wet: 0.3 });
    this.tone({ type: 'sine', f: 36.7, f2: 30, dur: 2.2, gain: 0.5 * k, attack: 0.002, wet: 0.2 });   // the low note under the cluster
    this.noiseHit({ dur: 0.35, type: 'lowpass', f: 900, gain: 1.1 * k, attack: 0.001, wet: 0.35 });
  }
  // the thing is suddenly there: the low piano note and the strings under it
  appear(k = 1) { this.pianoSlam(1.5 * k); this.stab(); }
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
      bp.connect(g).connect(this.buses.sfx); this.strings = { g };
    }
    this.set(this.strings.g.gain, have ? 0 : v * 0.05, t);
  }
  stab() { if (!this.play('sfx/violin_stab', { gain: 2.3, wet: 0.1 })) this.scream(); }
  swell() { if (!this.play('sfx/violin_swell', { gain: 1, wet: 0.1 })) this.tone({ type: 'sawtooth', f: 900, f2: 2400, dur: 6, gain: 0.06, attack: 5, wet: 0.5 }); }
  dread(v, t = 3) { if (!this.ctx) return; this.bed('sfx/low_drone', v, t); this.bed('sfx/whispers', v * 0.8, t); }
  scratch(pan = 0) { if (!this.play('sfx/closet_scratch', { gain: 0.9, pan, wet: 0.3 })) for (let i = 0; i < 7; i++) this.noiseHit({ dur: 0.25, type: 'highpass', f: 2500, gain: 0.18, pan, wet: 0.3, delay: i * 0.35 }); }
  ceilingThump() { if (!this.play('sfx/ceiling_thump', { gain: 1.8, wet: 0.35 })) this.tone({ f: 70, f2: 30, dur: 0.5, gain: 0.8, wet: 0.5 }); }
  slamFar(pan = 0) { if (!this.play('sfx/door_slam_far', { gain: 1.7, pan, wet: 0.4 })) { this.tone({ f: 90, f2: 40, dur: 0.4, gain: 0.7, pan, wet: 0.6 }); this.noiseHit({ dur: 0.2, f: 500, gain: 0.5, pan, wet: 0.6 }); } }
  pop() {
    this.noiseHit({ dur: 0.05, type: 'highpass', f: 2500, gain: 0.7, wet: 0.4 });
    this.tone({ f: 1400, f2: 200, dur: 0.06, gain: 0.25, wet: 0.4 });
    for (let i = 0; i < 4; i++) this.tone({ f: 3000 + Math.random() * 3000, dur: 0.05, gain: 0.05, delay: 0.08 + Math.random() * 0.4, wet: 0.5 });
  }
  splash() { this.noiseHit({ dur: 0.9, type: 'bandpass', f: 1600, f2: 900, q: 0.6, gain: 0.35, attack: 0.08, wet: 0.35 }); }
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
  // doors: a long hinge creak and a latch click when one opens, a thud when it shuts
  doorOpen(pan = 0, gain = 0.4) { this.creak(gain, pan, 0); this.noiseHit({ dur: 0.03, type: 'highpass', f: 2500, gain: gain * 0.5, pan, wet: 0.1 }); }
  doorClose(pan = 0, gain = 0.6) { this.tone({ f: 100, f2: 45, dur: 0.18, gain: gain * 0.9, pan, wet: 0.3 }); this.noiseHit({ dur: 0.1, f: 800, gain: gain * 0.5, pan, wet: 0.3 }); this.noiseHit({ dur: 0.02, type: 'highpass', f: 3500, gain: gain * 0.4, pan, wet: 0.05, delay: 0.12 }); }
  // ---- more of the house ----
  // a person muttering: voiced syllables through two formants. Stands in for the recorded lines until a line has its own file; returns the mouth envelope.
  mumble(voice = 'mom', dur = 2, { muffle = false, gain = 0.55, pan = 0 } = {}) {
    if (!this.ctx) return null;
    const ctx = this.ctx, t0 = this.now, f0 = voice === 'lurker' ? 74 : voice === 'dad' ? 104 : voice === 'you' ? 250 : 198, n = Math.max(2, Math.round(dur * 4.4));
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    const out = ctx.createGain(); out.gain.value = 0;
    const mk = (f, q) => { const b = ctx.createBiquadFilter(); b.type = 'bandpass'; b.frequency.value = f; b.Q.value = q; return b; };
    const a = mk(650, 5), b = mk(1250, 7), g1 = ctx.createGain(), g2 = ctx.createGain(); g1.gain.value = 1; g2.gain.value = 0.6;
    o.connect(a).connect(g1).connect(out); o.connect(b).connect(g2).connect(out);
    let dest = out; if (muffle) { const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 600; out.connect(lp); dest = lp; }
    dest.connect(this.bus(gain * (muffle ? 0.7 : 1), pan, muffle ? 0.2 : 0.12, dur, 'voice'));   // (it stands in for a voice line, so the voice volume covers it)
    const env = new Float32Array(Math.ceil(dur * 30) + 2);
    for (let i = 0; i < n; i++) {
      const ts = t0 + (i / n) * dur, te = ts + (dur / n) * 0.8, fall = 1 - (i / n) * 0.18, pitch = f0 * fall * (0.92 + Math.random() * 0.18), peak = 0.45 + Math.random() * 0.45;
      o.frequency.setValueAtTime(pitch, ts); o.frequency.linearRampToValueAtTime(pitch * 0.94, te);
      a.frequency.setValueAtTime(420 + Math.random() * 480, ts); b.frequency.setValueAtTime(1000 + Math.random() * 900, ts);
      out.gain.setValueAtTime(0.0001, ts); out.gain.linearRampToValueAtTime(peak, ts + 0.05); out.gain.linearRampToValueAtTime(0.0001, te);
      for (let k = Math.floor((i / n) * dur * 30); k < Math.min(env.length, Math.floor(((i + 0.8) / n) * dur * 30)); k++) env[k] = peak * Math.sin(Math.PI * (k / 30 - (i / n) * dur) / ((dur / n) * 0.8));
    }
    o.start(t0); o.stop(t0 + dur + 0.1);
    return env;
  }
  // a voice just out of sight: very quiet, low and unintelligible; near01 is how close it is (0 far, 1 beside you)
  lurk(pan = 0, near01 = 0.3, dur = 1.6) { return this.mumble('lurker', dur, { muffle: true, gain: 0.05 + 0.2 * near01 * near01, pan }); }
  faucet(dur = 3, pan = 0) {
    if (!this.ctx) return; const t = this.now;
    this.noiseHit({ dur, type: 'bandpass', f: 2400, q: 0.7, gain: 0.28, pan, wet: 0.2, attack: 0.3 });
    this.noiseHit({ dur, type: 'lowpass', f: 600, gain: 0.2, pan, wet: 0.3, attack: 0.3 });
    for (let i = 0; i < 6; i++) this.tone({ f: 900 + Math.random() * 700, f2: 500, dur: 0.05, gain: 0.05, pan, wet: 0.3, delay: dur * 0.2 + i * dur * 0.12 });
    void t;
  }
  phoneRing(pan = 0) {   // a 2002 bell: a high tone chopped at 20 Hz, twice
    if (!this.ctx) return;
    for (const d of [0, 0.5]) {
      const ctx = this.ctx, t = this.now + d, o = ctx.createOscillator(), o2 = ctx.createOscillator(), am = ctx.createOscillator(), amg = ctx.createGain(), g = ctx.createGain();
      o.frequency.value = 1980; o2.frequency.value = 2310; am.type = 'square'; am.frequency.value = 22; amg.gain.value = 0.5; am.connect(amg).connect(g.gain);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.55, t + 0.01); g.gain.setValueAtTime(0.5, t + 0.38); g.gain.linearRampToValueAtTime(0.0001, t + 0.42);
      o.connect(g); o2.connect(g); g.connect(this.bus(0.5, pan, 0.45, 1));
      o.start(t); o2.start(t); am.start(t); o.stop(t + 0.45); o2.stop(t + 0.45); am.stop(t + 0.45);
    }
  }
  staticBurst(pan = 0, dur = 2) {
    if (!this.ctx) return;
    this.noiseHit({ dur, type: 'bandpass', f: 3200, q: 0.5, gain: 0.34, pan, wet: 0.15, attack: 0.02 });
    this.noiseHit({ dur, type: 'highpass', f: 6000, gain: 0.18, pan, wet: 0.1, attack: 0.02 });
    for (let i = 0; i < dur * 8; i++) this.noiseHit({ dur: 0.03, type: 'highpass', f: 2000, gain: 0.25, pan, wet: 0.1, delay: Math.random() * dur });
  }
  scrape(pan = 0) {   // a chair dragged across lino
    if (!this.ctx) return; this.noiseHit({ dur: 0.7, type: 'bandpass', f: 700, f2: 450, q: 2, gain: 0.35, pan, wet: 0.35, attack: 0.05 }); this.tone({ type: 'sawtooth', f: 160, f2: 110, dur: 0.6, gain: 0.07, pan, wet: 0.3 });
  }
  flush(pan = 0) { if (!this.ctx) return; this.noiseHit({ dur: 2.6, type: 'bandpass', f: 800, f2: 2200, q: 0.6, gain: 0.3, pan, wet: 0.3, attack: 0.4 }); }

  // Silence before a scare makes it land: the whole mix ducks, and a jolt then hits well above everything else (the compressor keeps it from clipping).
  // (both move the master relative to the player's master volume, this.level)
  hush(sec = 3) {
    if (!this.ctx) return; const g = this.master.gain, t = this.now, L = this.level;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(L * 0.165, t + 0.5); g.setValueAtTime(L * 0.165, t + sec - 0.1); g.linearRampToValueAtTime(L, t + sec + 0.4);
  }
  jolt(strength = 1) {
    if (!this.ctx) return; const g = this.master.gain, t = this.now;
    g.cancelScheduledValues(t); g.setValueAtTime(this.level * 1.7, t); g.linearRampToValueAtTime(this.level, t + 1.6);
    this.tone({ f: 52, f2: 24, dur: 1.1, gain: 1.7 * strength, wet: 0.4 }); this.tone({ f: 118, f2: 40, dur: 0.5, gain: 1.1 * strength, wet: 0.3 });
    this.noiseHit({ dur: 0.6, type: 'highpass', f: 2400, gain: 1.1 * strength, wet: 0.35, attack: 0.002 }); this.noiseHit({ dur: 0.35, type: 'lowpass', f: 400, gain: 1.4 * strength, wet: 0.3, attack: 0.002 });
    this.stab(); this.play('sfx/scare_bang', { gain: 1.6 * strength });
  }
  // ---- the car: an engine you can feel, road noise, and a radio ----
  engine(v = 0, speed01 = 0.5) {
    if (!this.ctx) return;
    if (!this.eng) {
      const ctx = this.ctx, o = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain(), nz = ctx.createBufferSource(), bp = ctx.createBiquadFilter(), ng = ctx.createGain();
      o.type = 'sawtooth'; o2.type = 'square'; o.frequency.value = 52; o2.frequency.value = 26; lp.type = 'lowpass'; lp.frequency.value = 240; g.gain.value = 0;
      o.connect(lp); o2.connect(lp); lp.connect(g).connect(this.buses.sfx);
      nz.buffer = this.noise; nz.loop = true; bp.type = 'lowpass'; bp.frequency.value = 500; ng.gain.value = 0; nz.connect(bp).connect(ng).connect(this.buses.sfx);
      o.start(); o2.start(); nz.start(); this.eng = { o, o2, g, ng, bp };
    }
    const e = this.eng, t = this.now; e.o.frequency.setTargetAtTime(46 + speed01 * 55, t, 0.3); e.o2.frequency.setTargetAtTime(23 + speed01 * 27, t, 0.3);
    e.g.gain.setTargetAtTime(v * 0.12, t, 0.5); e.ng.gain.setTargetAtTime(v * (0.05 + speed01 * 0.16), t, 0.5); e.bp.frequency.setTargetAtTime(380 + speed01 * 900, t, 0.5);
  }
  radio(v = 0, stat = 0) {   // a soft pad of a tune, and static when something is wrong
    if (!this.ctx) return;
    if (!this.rad) {
      const ctx = this.ctx, g = ctx.createGain(), lp = ctx.createBiquadFilter(), trem = ctx.createOscillator(), tg = ctx.createGain(), sn = ctx.createBufferSource(), sbp = ctx.createBiquadFilter(), sg = ctx.createGain();
      g.gain.value = 0; lp.type = 'lowpass'; lp.frequency.value = 1500; trem.frequency.value = 5; tg.gain.value = 0.25; trem.connect(tg).connect(g.gain);
      const oscs = [220, 277.2, 329.6, 440].map((f) => { const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = f; o.detune.value = (Math.random() - 0.5) * 14; o.connect(lp); o.start(); return o; });
      lp.connect(g).connect(this.buses.sfx); trem.start();
      sn.buffer = this.noise; sn.loop = true; sbp.type = 'bandpass'; sbp.frequency.value = 2800; sbp.Q.value = 0.4; sg.gain.value = 0; sn.connect(sbp).connect(sg).connect(this.buses.sfx); sn.start();
      this.rad = { g, sg, oscs, lp };
      // the tune: a slow wandering melody on the chord tones
      const notes = [0, 3, 7, 5, 3, 10, 7, 3]; let i = 0; this.radTimer = setInterval(() => { if (!this.rad) return; const base = 220 * Math.pow(2, notes[i++ % notes.length] / 12); this.rad.oscs[3].frequency.setTargetAtTime(base * 2, this.now, 0.05); }, 900);
    }
    const t = this.now; this.rad.g.gain.setTargetAtTime(v * 0.06, t, 0.4); this.rad.sg.gain.setTargetAtTime(stat * 0.22, t, 0.2);
  }
  honk(pan = 0) { if (!this.ctx) return; this.tone({ type: 'square', f: 420, dur: 0.35, gain: 0.12, pan, wet: 0.3 }); this.tone({ type: 'square', f: 520, dur: 0.35, gain: 0.1, pan, wet: 0.3 }); }

  click() { this.noiseHit({ dur: 0.02, type: 'highpass', f: 3000, gain: 0.3, wet: 0.02 }); }
}
