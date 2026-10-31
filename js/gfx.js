// Rendering pipeline: HDR sky and image-based light, ambient occlusion, bloom, and a film grade.
// Quality presets trade looks for speed; "low" skips post-processing entirely.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { store } from './store.js';

export const QUALITY = {
  ultra:  { dpr: 2,    msaa: 4, ao: { samples: 16, radius: 0.55, res: 0.7 }, bloom: 0.45, grade: true,  sun: 4096, spot: 2048 },
  high:   { dpr: 1.5,  msaa: 2, ao: { samples: 8,  radius: 0.55, res: 0.5 }, bloom: 0.4,  grade: true,  sun: 2048, spot: 1024 },
  medium: { dpr: 1.25, msaa: 0, ao: null,                          bloom: 0.32, grade: true,  sun: 2048, spot: 1024 },
  low:    { dpr: 1,    msaa: 0, ao: null,                          bloom: 0,    grade: false, sun: 1024, spot: 512, direct: true },
};
const ORDER = ['ultra', 'high', 'medium', 'low'];
const KEY = 'topbunk.quality';

// radians to turn the sky so its sun lines up with the game's sun light
const SKY_ROT = -1.125;

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, grain: { value: 0.045 }, vignette: { value: 0.32 }, ca: { value: 0.0011 }, sat: { value: 0.97 }, contrast: { value: 1.04 }, night: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, grain, vignette, ca, sat, contrast, night; uniform vec2 res; varying vec2 vUv;
    float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
    void main() {
      vec2 d = vUv - 0.5; float r2 = dot(d, d);
      vec2 off = d * r2 * ca * 8.0;                       // lens colour fringing, stronger toward the corners
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(c, vec3(0.299, 0.587, 0.114));
      c = mix(vec3(l), c, sat);
      // dark-adapted eyes: dim areas lose colour and lean blue-grey, and blacks are lifted slightly
      float dark = 1.0 - smoothstep(0.04, 0.36, l);
      float gr = clamp((c.g - max(c.r, c.b)) * 5.0, 0.0, 1.0);                 // the green night lights stay green
      c = mix(c, vec3(l) * vec3(0.5, 0.82, 1.5), 0.72 * night * dark * (1.0 - gr));
      c *= mix(vec3(1.0), vec3(0.7, 0.84, 1.12), 0.65 * night * (1.0 - gr));      // a deep blue cast over everything else
      c *= 1.0 - 0.14 * night;
      c += night * 0.016 * vec3(0.4, 0.7, 1.3);
      c = (c - 0.5) * contrast + 0.5;
      c *= 1.0 - vignette * smoothstep(0.28, 0.95, length(d) * 1.25);
      float n = hash(vUv * res + fract(time) * 91.7) - 0.5;
      c += n * grain * (1.15 - l);                        // film grain, heavier in the shadows
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
};

export class Gfx {
  constructor(renderer, scene, camera, { quality } = {}) {
    this.r = renderer; this.scene = scene; this.camera = camera;
    const saved = store.get(KEY), q = quality || saved;
    this.autoQuality = matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches ? 'medium' : 'high';   // phones start lighter
    this.quality = QUALITY[q] ? q : this.autoQuality; this.auto = !(QUALITY[saved] || quality);
    this.time = 0; this.night = 0; this.nightGoal = 1; this.phase = 'title'; this.env = {}; this.daySky = null;
    this.ft = 16; this.slow = 0; this.age = 0; this.onChange = null; this.res = 1; this.cool = 0;   // res: dynamic resolution scale
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.loadEnv();
    this.build();
  }

  loadEnv() {
    const rgbe = new RGBELoader();
    const mk = (url, key) => rgbe.load(url, (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping;
      this.env[key] = this.pmrem.fromEquirectangular(t).texture; t.dispose(); this.apply();
    }, undefined, () => { /* no sky file: the flat colours and lights still work */ });
    mk('assets/sky/day_env.hdr', 'day'); mk('assets/sky/night_env.hdr', 'night');
    new THREE.TextureLoader().load('assets/sky/day.jpg', (t) => {
      t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
      this.daySky = t; this.apply();
    }, undefined, () => {});
  }

  // sky, background and ambient light for a story phase
  setPhase(p) { this.phase = p; this.apply(); }
  apply() {
    const s = this.scene, p = this.phase, day = p === 'day', morn = p === 'morning';
    s.environmentRotation.y = s.backgroundRotation.y = SKY_ROT;
    this.nightGoal = (p === 'day' || p === 'morning') ? 0 : 1;
    if (day || morn) {
      s.environment = this.env.day || null; s.environmentIntensity = day ? 0.5 : 0.4;
      if (this.daySky) { s.background = this.daySky; s.backgroundIntensity = day ? 1 : 0.9; }
    } else {
      s.environment = this.env.night || null; s.environmentIntensity = p === 'title' ? 0.35 : 0.42;
      s.background = new THREE.Color(0x020308); s.backgroundIntensity = 1;
    }
  }

  build() {
    const p = QUALITY[this.quality], r = this.r, scene = this.scene, camera = this.camera;
    if (this.composer) { this.composer.dispose?.(); this.composer = null; }
    const dpr = Math.min(devicePixelRatio || 1, p.dpr) * this.res;
    r.setPixelRatio(dpr); r.setSize(innerWidth, innerHeight);
    for (const l of scene.userData.shadowLights || []) { l.light.shadow.mapSize.set(l.sun ? p.sun : p.spot, l.sun ? p.sun : p.spot); if (l.light.shadow.map) { l.light.shadow.map.dispose(); l.light.shadow.map = null; } l.light.shadow.autoUpdate = false; l.light.shadow.needsUpdate = true; }
    this.pass = {};
    if (p.direct) return;
    const c = this.composer = new EffectComposer(r);
    c.renderTarget1.samples = c.renderTarget2.samples = p.msaa;
    c.addPass(new RenderPass(scene, camera));
    if (p.ao) {
      const ao = this.pass.ao = new GTAOPass(scene, camera, innerWidth * dpr, innerHeight * dpr);
      ao.updateGtaoMaterial({ radius: p.ao.radius, distanceExponent: 1.2, thickness: 1.2, scale: 1.0, samples: p.ao.samples, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: p.ao.samples > 8 ? 12 : 8 });
      ao.blendIntensity = 1;
      // the AO runs at a fraction of the screen resolution and is scaled up: it is soft anyway, and the pixel count is most of its cost
      const baseSize = ao.setSize.bind(ao), k = p.ao.res ?? 0.5;
      ao.setSize = (w, h) => baseSize(Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k)));
      ao.setSize(innerWidth * dpr, innerHeight * dpr);
      const hide = ao.overrideVisibility.bind(ao);
      let noAO = null;   // the glass panes never change, so find them once
      ao.overrideVisibility = function () {   // glass and light domes would read as solid walls to the AO pass
        hide(); if (!noAO) { noAO = []; scene.traverse((o) => { if (o.userData && o.userData.noAO) noAO.push(o); }); }
        for (const o of noAO) o.visible = false;
      };
      c.addPass(ao);
    }
    if (p.bloom) c.addPass(this.pass.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), p.bloom, 0.55, 1.0));
    c.addPass(new OutputPass());
    if (p.grade) c.addPass(this.pass.grade = new ShaderPass(GradeShader));
    c.setPixelRatio(dpr); c.setSize(innerWidth, innerHeight);
    if (this.pass.grade) this.pass.grade.uniforms.res.value.set(innerWidth * dpr, innerHeight * dpr);
  }

  resize() {
    const p = QUALITY[this.quality], dpr = Math.min(devicePixelRatio || 1, p.dpr) * this.res;
    this.r.setSize(innerWidth, innerHeight);
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(innerWidth, innerHeight); }
    if (this.pass.grade) this.pass.grade.uniforms.res.value.set(innerWidth * dpr, innerHeight * dpr);
  }

  // the colour a grey surface of linear value v ends up on screen at night with exposure e, taken through the same steps as the picture:
  // ACES filmic, sRGB, then the grade's night terms (GradeShader at night = 1) when this preset grades. The brightness calibration draws with it.
  shade(v, e) {
    const x = v * e / 0.6, t = THREE.MathUtils.clamp((x * (x + 0.0245786) - 0.000090537) / (x * (0.983729 * x + 0.432951) + 0.238081), 0, 1);
    const l = t <= 0.0031308 ? t * 12.92 : 1.055 * t ** (1 / 2.4) - 0.055;
    let c = [l, l, l];
    if (this.pass.grade) {
      const k = 0.72 * (1 - THREE.MathUtils.smoothstep(l, 0.04, 0.36)), con = this.pass.grade.uniforms.contrast.value;
      const dark = [0.5, 0.82, 1.5], cast = [0.7, 0.84, 1.12], lift = [0.4, 0.7, 1.3];
      c = c.map((y, i) => ((y + (y * dark[i] - y) * k) * (1 + (cast[i] - 1) * 0.65) * 0.86 + 0.016 * lift[i] - 0.5) * con + 0.5);
    }
    return c.map((y) => Math.round(THREE.MathUtils.clamp(y, 0, 1) * 255));
  }

  setQuality(q, { save = true } = {}) {
    if (!QUALITY[q] || q === this.quality) return;
    this.quality = q; this.build();
    if (save) { store.set(KEY, q); this.auto = false; }
    this.slow = 0; if (this.onChange) this.onChange(q);
  }
  // the options menu's setting: 'auto' (a preset picked for the device, stepped down when frames are slow) or a preset kept as chosen
  get mode() { return this.auto ? 'auto' : this.quality; }
  setMode(m) {
    if (m === 'auto') { store.remove(KEY); this.auto = true; this.age = 0; this.setQuality(this.autoQuality, { save: false }); }
    else if (QUALITY[m]) { this.setQuality(m, { save: false }); this.auto = false; store.set(KEY, m); }
  }

  // dynamic resolution: render at a lower pixel ratio when frames are slow, and creep back up when there is headroom
  setRes(v) {
    if (v === this.res) return; this.res = v;
    const p = QUALITY[this.quality], dpr = Math.min(devicePixelRatio || 1, p.dpr) * v;
    this.r.setPixelRatio(dpr);
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(innerWidth, innerHeight); }
    if (this.pass.grade) this.pass.grade.uniforms.res.value.set(innerWidth * dpr, innerHeight * dpr);
  }

  // adaptive: first lower the resolution a little, and if the frame time stays high step down one preset (never back up)
  watch(dt) {
    this.age += dt;
    if (this.age < 6 || !this.auto) return;
    this.ft += (dt * 1000 - this.ft) * 0.05; this.cool -= dt;
    if (this.ft > 21 && this.cool <= 0 && this.res > 0.71) { this.setRes(Math.max(0.7, +(this.res - 0.15).toFixed(2))); this.cool = 3; this.ft = 16; return; }
    if (this.ft < 12.5 && this.cool <= 0 && this.res < 1) { this.setRes(Math.min(1, +(this.res + 0.1).toFixed(2))); this.cool = 8; return; }
    this.slow = this.ft > 32 ? this.slow + dt : Math.max(0, this.slow - dt);
    if (this.slow > 3) {
      const i = ORDER.indexOf(this.quality);
      if (i < ORDER.length - 1) { console.info('graphics: stepping down to', ORDER[i + 1]); this.setQuality(ORDER[i + 1], { save: false }); }
      this.slow = 0; this.ft = 16;
    }
  }

  render(dt) {
    this.time += dt; this.watch(dt);
    if (this.pass.grade) { const u = this.pass.grade.uniforms; u.time.value = this.time; this.night += ((this.nightGoal ?? 0) - this.night) * Math.min(1, dt * 1.2); u.night.value = this.night; }
    if (this.composer) this.composer.render(dt); else this.r.render(this.scene, this.camera);
  }
}
