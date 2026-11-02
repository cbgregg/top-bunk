// Rendering pipeline: HDR sky and image-based light, ambient occlusion, bloom, and a film grade.
// Quality presets trade looks for speed; "low" skips post-processing entirely.
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { Pass, FullScreenQuad } from 'three/addons/postprocessing/Pass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { store } from './store.js';

// dpr is the render scale in CSS pixels; `fixed` presets render at that scale whatever the screen's own ratio is, so on a plain
// 1080p monitor ultra draws 4K and scales down (the edges of the bunk rails and the door frames are where the picture lives)
export const QUALITY = {
  ultra:  { dpr: 2,    fixed: true, msaa: 4, ao: { samples: 16, radius: 0.55, res: 0.7 }, bloom: 0.45, grade: true,  sun: 4096, spot: 2048 },
  high:   { dpr: 1.25, fixed: true, msaa: 4, ao: { samples: 8,  radius: 0.55, res: 0.5 }, bloom: 0.4,  grade: true,  sun: 2048, spot: 1024 },
  medium: { dpr: 1.25, msaa: 2, ao: null,                          bloom: 0.32, grade: true,  sun: 2048, spot: 1024 },
  low:    { dpr: 1,    msaa: 0, ao: null,                          bloom: 0,    grade: false, sun: 1024, spot: 512, direct: true },
};
const baseDpr = (p) => p.fixed ? p.dpr : Math.min(devicePixelRatio || 1, p.dpr);
// a phone or a tablet: a screen with no mouse. It gets the lighter presets whatever it picks (its memory is the limit, not its taste):
// no multisampling, no render above its own pixels, small shadow maps, and the textures load at half size (pbr.js, props.js)
export const PHONE = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches && !matchMedia('(pointer: fine)').matches;
// the phone preset: the scene drawn straight to the screen at the screen's own pixels with the canvas's own antialiasing, no
// post-processing chain (the night look comes from a cheap overlay instead), a small hard-edged sun shadow, no other shadow maps.
// On a phone every preset in the menu is this one, give or take the render scale: the memory is the limit there, not the taste
if (PHONE) {
  QUALITY.phone = { dpr: 1, msaa: 0, ao: null, bloom: 0, grade: false, sun: 512, spot: 256, direct: true, overlay: true };
  for (const k of ['ultra', 'high', 'medium', 'low']) Object.assign(QUALITY[k], QUALITY.phone, { dpr: k === 'ultra' ? 1.25 : 1 });
}
const ORDER = ['ultra', 'high', 'medium', 'low'];
const KEY = 'topbunk.quality';
const OKEY = 'topbunk.gfx';   // the custom settings and the ones that belong to no preset (frame cap, counter, contrast, gamma)

// every preset as the separate settings of the Graphics page. px / fixed: the render scale the way the presets have always had it;
// a custom setup has scale instead, a share of the display's own pixels
export const OPTS = {
  low:    { px: 1,    fixed: false, aa: 'off',   shadows: 'low',    ao: 'off',  bloom: 0,    grain: false, ca: false, vignette: false, mblur: false, tex: 'low',    grass: 'low',    draw: 'near',   weather: 'low' },
  medium: { px: 1.25, fixed: false, aa: 'msaa2', shadows: 'medium', ao: 'off',  bloom: 0.32, grain: true,  ca: true,  vignette: true,  mblur: false, tex: 'medium', grass: 'medium', draw: 'medium', weather: 'medium' },
  high:   { px: 1.25, fixed: true,  aa: 'msaa4', shadows: 'high',   ao: 'low',  bloom: 0.4,  grain: true,  ca: true,  vignette: true,  mblur: false, tex: 'high',   grass: 'high',   draw: 'far',    weather: 'high' },
  ultra:  { px: 2,    fixed: true,  aa: 'msaa4', shadows: 'ultra',  ao: 'high', bloom: 0.45, grain: true,  ca: true,  vignette: true,  mblur: false, tex: 'high',   grass: 'ultra',  draw: 'far',    weather: 'high' },
};
export const SHADOWS = { off: null, low: { sun: 1024, spot: 512, soft: false }, medium: { sun: 2048, spot: 1024, soft: false }, high: { sun: 2048, spot: 1024, soft: true }, ultra: { sun: 4096, spot: 2048, soft: true } };
export const AO = { off: null, low: { samples: 8, radius: 0.55, res: 0.5 }, high: { samples: 16, radius: 0.55, res: 0.7 } };
export const TEX = { low: 2, medium: 4, high: 16 };
export const GRASS = { off: 0, low: 0.3, medium: 0.55, high: 1, ultra: 1 };
export const DRAW = { near: { fog: 1.7, far: 160 }, medium: { fog: 1.3, far: 260 }, far: { fog: 1, far: 400 } };
export const WEATHER = { low: 0.25, medium: 0.6, high: 1 };
const PERSONAL = { cap: 0, counter: false, contrast: 1, gamma: 1, cine: !PHONE };   // cap 0: no frame cap; cine: the cinematic look in conversations
// the conversations' look: the scene drawn at no less than 1.5x the display's pixels, high ambient occlusion, depth of field on the
// speaker, sharper shadows, a light rig on the face, a film curve with a touch of halation and a 2.39:1 letterbox
const CINE = { scale: 1.5, ao: { samples: 16, radius: 0.6, res: 0.75 }, bloom: 0.3, shadow: 2, box: 5 };

// depth of field from the AO pass's depth: each pixel gathers the samples whose own blur reaches it, and a sample behind a sharp pixel
// only spreads as far as that pixel's own blur, so a face in focus keeps a clean edge against a soft room
const DOFShader = {
  uniforms: { tDiffuse: { value: null }, tDepth: { value: null }, focus: { value: 2 }, aperture: { value: 1.2 }, maxR: { value: 10 }, px: { value: new THREE.Vector2(1, 1) }, near: { value: 0.05 }, far: { value: 400 }, k: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    #include <packing>
    uniform sampler2D tDiffuse, tDepth; uniform float focus, aperture, maxR, near, far, k; uniform vec2 px; varying vec2 vUv;
    float depthAt(vec2 uv) { return -perspectiveDepthToViewZ(texture2D(tDepth, uv).x, near, far); }
    float cocAt(float z) { return clamp(aperture * abs(z - focus) / max(z, 1e-3), 0.0, 1.0) * maxR; }
    void main() {
      vec4 c0 = texture2D(tDiffuse, vUv);
      if (k <= 0.0) { gl_FragColor = c0; return; }
      float z0 = depthAt(vUv), r0 = cocAt(z0) * k;
      vec3 acc = c0.rgb; float ws = 1.0;
      for (int i = 0; i < 32; i++) {
        float t = (float(i) + 0.5) / 32.0, r = sqrt(t) * maxR * k, a = float(i) * 2.39996;
        vec2 uv = vUv + vec2(cos(a), sin(a)) * r * px;
        float zs = depthAt(uv), rs = cocAt(zs) * k;
        if (zs > z0) rs = min(rs, r0);
        float w = smoothstep(r - 1.0, r + 0.5, rs);
        acc += texture2D(tDiffuse, uv).rgb * w; ws += w;
      }
      gl_FragColor = vec4(acc / ws, c0.a);
    }`,
};

// the picture's own blur when the view turns fast: each frame keeps a share of the one before, more the faster the camera turns
class TurnBlurPass extends Pass {
  constructor() {
    super();
    this.prev = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.k = 0;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { tDiffuse: { value: null }, tPrev: { value: null }, k: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D tDiffuse, tPrev; uniform float k; varying vec2 vUv; void main() { gl_FragColor = mix(texture2D(tDiffuse, vUv), texture2D(tPrev, vUv), k); }',
    });
    this.copy = new THREE.ShaderMaterial({ uniforms: { tDiffuse: { value: null } }, vertexShader: this.mat.vertexShader, fragmentShader: 'uniform sampler2D tDiffuse; varying vec2 vUv; void main() { gl_FragColor = texture2D(tDiffuse, vUv); }' });
    this.quad = new FullScreenQuad(this.mat); this.cq = new FullScreenQuad(this.copy);
  }
  setSize(w, h) { this.prev.setSize(w, h); }
  render(renderer, writeBuffer, readBuffer) {
    const u = this.mat.uniforms; u.tDiffuse.value = readBuffer.texture; u.tPrev.value = this.prev.texture; u.k.value = this.k;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer); this.quad.render(renderer);
    // what was just shown is the next frame's trail
    this.copy.uniforms.tDiffuse.value = this.renderToScreen ? readBuffer.texture : writeBuffer.texture;
    renderer.setRenderTarget(this.prev); this.cq.render(renderer);
  }
  dispose() { this.prev.dispose(); this.mat.dispose(); this.copy.dispose(); this.quad.dispose(); this.cq.dispose(); }
}

// radians to turn the sky so its sun lines up with the game's sun light
const SKY_ROT = -1.125;

const GradeShader = {
  uniforms: { tDiffuse: { value: null }, time: { value: 0 }, res: { value: new THREE.Vector2(1, 1) }, grain: { value: 0.045 }, vignette: { value: 0.32 }, ca: { value: 0.0011 }, sat: { value: 0.97 }, contrast: { value: 1.04 }, gamma: { value: 1 }, night: { value: 0 }, cine: { value: 0 }, bars: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, grain, vignette, ca, sat, contrast, gamma, night, cine, bars; uniform vec2 res; varying vec2 vUv;
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
      if (cine > 0.0) {
        // halation: the brightest parts bleed a warm glow into the film around them
        vec3 h = vec3(0.0);
        for (int i = 0; i < 8; i++) { float a = float(i) * 0.785398; vec3 s = texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * vec2(res.y / res.x, 1.0) * 0.006).rgb; h += max(s - 0.72, 0.0); }
        c += h * vec3(1.0, 0.42, 0.22) * 0.22 * cine;
        // a gentle s-curve: deeper shadows, softer highlight roll-off
        vec3 sc = clamp(c, 0.0, 1.0); c = mix(c, sc * sc * (3.0 - 2.0 * sc), 0.32 * cine);
      }
      c *= 1.0 - vignette * smoothstep(0.28, 0.95, length(d) * 1.25);
      float n = hash(vUv * res + fract(time) * 91.7) - 0.5;
      c += n * grain * (1.15 - l);                        // film grain, heavier in the shadows
      c = pow(max(c, 0.0), vec3(1.0 / gamma));
      if (abs(vUv.y - 0.5) > 0.5 - bars) c = vec3(0.0);   // the letterbox
      gl_FragColor = vec4(c, 1.0);
    }`,
};

// a soft round shadow on the floor under someone standing: the contact a shadow map at room scale is too coarse to draw
let blobTex = null;
export function contactShadow(r = 0.4, k = 0.5) {
  if (!blobTex) {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.45, 'rgba(0,0,0,0.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64); blobTex = new THREE.CanvasTexture(c);
  }
  const m = new THREE.Mesh(new THREE.PlaneGeometry(r * 2, r * 2), new THREE.MeshBasicMaterial({ color: 0x000000, map: blobTex, transparent: true, opacity: k, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.012; m.renderOrder = 1; m.userData.noAO = true; m.castShadow = m.receiveShadow = false;
  return m;
}

// where Auto starts, from the name the browser gives the graphics card: a software renderer starts on Low, a chip built into the CPU on
// Medium, anything else on High (Auto then moves up or down from there by the frame times)
export function gpuTier(renderer) {
  let name = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); name = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch (e) { return 'high'; }
  if (/swiftshader|llvmpipe|softpipe|software|basic render/i.test(name)) return 'low';
  if (/intel|uhd|iris|hd graphics|mali|adreno|powervr|radeon\(tm\) (graphics|vega)|radeon graphics|vega \d+ graphics|apple gpu/i.test(name)) return 'medium';
  return 'high';
}

export class Gfx {
  constructor(renderer, scene, camera, { quality } = {}) {
    this.r = renderer; this.scene = scene; this.camera = camera;
    const saved = store.get(KEY), q = quality || (typeof location !== 'undefined' && new URLSearchParams(location.search).get('gfx')) || saved;   // ?gfx=low forces a preset from the address bar
    this.autoQuality = PHONE ? 'phone' : gpuTier(renderer);   // phones start lighter, and so do built-in and software graphics
    // the Graphics page: a custom setup (when chosen) and the settings that belong to no preset
    const og = store.get(OKEY) || {};
    this.custom = og.custom && typeof og.custom === 'object' ? { ...OPTS.high, ...og.custom } : null;
    this.personal = { ...PERSONAL, ...(og.personal || {}) };
    const valid = (k) => !!QUALITY[k] || (k === 'custom' && !!this.custom && !PHONE);
    this.quality = valid(q) ? q : this.autoQuality; this.auto = !(valid(saved) || quality);
    this.turn = 0; this._q = new THREE.Quaternion(); this.onOpts = null;
    this.time = 0; this.night = 0; this.nightGoal = 1; this.phase = 'title'; this.env = {}; this.daySky = null;
    this.ft = 16; this.slow = 0; this.age = 0; this.onChange = null; this.res = 1; this.cool = 0; this.fast = 0; this.ceiling = null;   // res: dynamic resolution scale
    this.cineGoal = 0; this.cineK = 0; this.cineFocus = null; this.cineHold = null; this.chain = null; this.rig = null; this._v = new THREE.Vector3(); this._f = new THREE.Vector3();
    this.pmrem = new THREE.PMREMGenerator(renderer);
    this.loadEnv();
    this.build();
    this.makeRig();
  }

  loadEnv() {
    if (PHONE) {   // no sky files on a phone: a small painted gradient stands in for each environment, and the day sky is only the colour
      const grad = (top, mid, bot) => {
        const w = 64, h = 32, d = new Uint8Array(w * h * 4), c = new THREE.Color(), a = new THREE.Color(top), b = new THREE.Color(mid), e = new THREE.Color(bot);
        for (let y = 0; y < h; y++) { const t = y / (h - 1); if (t < 0.5) c.lerpColors(a, b, t * 2); else c.lerpColors(b, e, (t - 0.5) * 2); for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = c.r * 255; d[i + 1] = c.g * 255; d[i + 2] = c.b * 255; d[i + 3] = 255; } }
        const t = new THREE.DataTexture(d, w, h); t.mapping = THREE.EquirectangularReflectionMapping; t.colorSpace = THREE.SRGBColorSpace; t.needsUpdate = true;
        const env = this.pmrem.fromEquirectangular(t).texture; t.dispose(); return env;
      };
      this.env.day = grad(0x6d9bd6, 0xcfd9e6, 0x5a4a35); this.env.night = grad(0x0a1430, 0x101a30, 0x04060f); this.apply();
      return;
    }
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
      else if (PHONE) { s.background = new THREE.Color(day ? 0x8fb3dc : 0xd9c7b0); s.backgroundIntensity = 1; }
    } else {
      s.environment = this.env.night || null; s.environmentIntensity = p === 'title' ? 0.35 : 0.42;
      s.background = new THREE.Color(0x020308); s.backgroundIntensity = 1;
    }
  }

  // the settings the picture is built from: a preset's, or the custom ones
  get opts() { return this.quality === 'custom' && this.custom ? this.custom : (OPTS[this.quality] || OPTS.high); }
  // the pixel ratio a setup draws at: the presets' own rule, or a share of the display's pixels; supersampling doubles it each way
  pixelRatio(o = this.opts) {
    let d = o.scale != null ? (devicePixelRatio || 1) * o.scale : o.fixed ? o.px : Math.min(devicePixelRatio || 1, o.px);
    if (o.aa === 'ss2') d *= 2;
    return Math.min(4, d);
  }
  // the preset as it stands (what the phone always draws with), taken through the Graphics settings
  plan() {
    if (PHONE) return { ...QUALITY[this.quality] || QUALITY.phone, dpr: baseDpr(QUALITY[this.quality] || QUALITY.phone) };
    const o = this.opts, pr = this.personal, sh = SHADOWS[o.shadows];
    const post = !!AO[o.ao] || o.bloom > 0 || o.grain || o.ca || o.vignette || o.aa === 'fxaa' || o.mblur || pr.contrast !== 1 || pr.gamma !== 1 || (!!OPTS[this.quality] && this.quality !== 'low');
    return {
      dpr: this.pixelRatio(o), msaa: o.aa === 'msaa4' ? 4 : o.aa === 'msaa2' ? 2 : 0, ao: AO[o.ao], bloom: o.bloom, grade: post, direct: !post,
      sun: sh ? sh.sun : 512, spot: sh ? sh.spot : 256, shadows: !!sh, soft: !!(sh && sh.soft), fxaa: o.aa === 'fxaa', mblur: !!o.mblur,
    };
  }
  build() {
    const p = this.plan();
    this.dropCine();
    if (this.composer) { for (const ps of this.composer.passes) ps.dispose?.(); this.composer.dispose?.(); this.composer = null; }
    const r = this.r, scene = this.scene;
    const dpr = p.dpr * this.res;
    r.setPixelRatio(dpr); r.setSize(innerWidth, innerHeight);
    if (!PHONE) {   // shadows on or off and their filter: every material's program depends on these, so they are rebuilt on change
      const type = p.soft ? THREE.PCFSoftShadowMap : THREE.PCFShadowMap;
      if (r.shadowMap.enabled !== p.shadows || r.shadowMap.type !== type) {
        r.shadowMap.enabled = p.shadows; r.shadowMap.type = type;
        scene.traverse((o) => { for (const m of [].concat(o.material || [])) m.needsUpdate = true; });
      }
    }
    for (const l of scene.userData.shadowLights || []) { l.light.shadow.mapSize.set(l.sun ? p.sun : p.spot, l.sun ? p.sun : p.spot); if (l.light.shadow.map) { l.light.shadow.map.dispose(); l.light.shadow.map = null; } l.light.shadow.autoUpdate = false; l.light.shadow.needsUpdate = true; }
    this.pass = {};
    if (p.direct) { if (p.overlay && !this.overlay) this.buildOverlay(); return; }
    ({ composer: this.composer, pass: this.pass } = this.chainFor(p, dpr));
    this.sizePasses(dpr);
    this.applyLook();
  }
  // a post-processing chain for a plan: the everyday one, or the conversations' one (dof and the letterbox)
  chainFor(p, dpr) {
    const r = this.r, scene = this.scene, camera = this.camera, pass = {};
    const c = new EffectComposer(r);
    c.renderTarget1.samples = c.renderTarget2.samples = p.msaa;
    c.addPass(new RenderPass(scene, camera));
    if (p.ao) {
      const ao = pass.ao = new GTAOPass(scene, camera, innerWidth * dpr, innerHeight * dpr);
      ao.updateGtaoMaterial({ radius: p.ao.radius, distanceExponent: 1.2, thickness: 1.2, scale: 1.0, samples: p.ao.samples, distanceFallOff: 1, screenSpaceRadius: false });
      ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: p.ao.samples > 8 ? 12 : 8 });
      ao.blendIntensity = 1;
      // the AO runs at a fraction of the screen resolution and is scaled up: it is soft anyway, and the pixel count is most of its cost
      const baseSize = ao.setSize.bind(ao), k = p.ao.res ?? 0.5;
      ao.setSize = (w, h) => baseSize(Math.max(2, Math.round(w * k)), Math.max(2, Math.round(h * k)));
      ao.setSize(innerWidth * dpr, innerHeight * dpr);
      const hide = ao.overrideVisibility.bind(ao);
      let noAO = null;   // the glass panes never change, so find them once; anything added later sets scene.userData.aoDirty
      ao.overrideVisibility = function () {   // glass, light domes and smoke would read as solid walls to the AO pass
        hide(); if (!noAO || scene.userData.aoDirty) { noAO = []; scene.traverse((o) => { if (o.userData && o.userData.noAO) noAO.push(o); }); scene.userData.aoDirty = false; }
        for (const o of noAO) o.visible = false;
      };
      c.addPass(ao);
    }
    if (p.dof && pass.ao) { c.addPass(pass.dof = new ShaderPass(DOFShader)); pass.dof.uniforms.tDepth.value = pass.ao.depthTexture; }
    if (p.bloom) c.addPass(pass.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), p.bloom, 0.55, 1.0));
    if (p.mblur) c.addPass(pass.blur = new TurnBlurPass());
    c.addPass(new OutputPass());
    if (p.grade) c.addPass(pass.grade = new ShaderPass(GradeShader));
    if (p.fxaa) c.addPass(pass.fxaa = new ShaderPass(FXAAShader));
    c.setPixelRatio(dpr); c.setSize(innerWidth, innerHeight);
    return { composer: c, pass };
  }
  sizePasses(dpr, pass = this.pass) {
    if (pass.grade) pass.grade.uniforms.res.value.set(innerWidth * dpr, innerHeight * dpr);
    if (pass.fxaa) pass.fxaa.material.uniforms.resolution.value.set(1 / (innerWidth * dpr), 1 / (innerHeight * dpr));
    if (pass.dof) { pass.dof.uniforms.px.value.set(1 / (innerWidth * dpr), 1 / (innerHeight * dpr)); pass.dof.uniforms.maxR.value = Math.round(innerHeight * dpr * 0.009); }
  }
  // the settings that change without a rebuild: grain, fringing, vignette, contrast, gamma, the strength of the bloom
  applyLook(pass = this.pass, cine = false) {
    if (PHONE) return;
    const o = this.opts, pr = this.personal;
    if (pass.grade) {
      const u = pass.grade.uniforms;
      u.grain.value = o.grain ? (cine ? 0.03 : 0.045) : 0; u.ca.value = o.ca ? 0.0011 : 0; u.vignette.value = o.vignette ? 0.32 : cine ? 0.2 : 0;
      u.contrast.value = 1.04 * pr.contrast; u.gamma.value = pr.gamma;
    }
    if (pass.bloom) pass.bloom.strength = cine ? Math.max(o.bloom, CINE.bloom) : o.bloom;
    if (!cine && this.chain) this.applyLook(this.chain.pass, true);
  }
  // texture sharpness at a slant: every texture in the scene takes the setting's anisotropy (the card's own limit is the ceiling)
  applyTextures() {
    if (PHONE) return;
    const a = Math.min(TEX[this.opts.tex] || 4, this.r.capabilities.getMaxAnisotropy()), seen = new Set();
    this.scene.traverse((o) => { for (const m of [].concat(o.material || [])) for (const k in m) { const t = m[k]; if (t && t.isTexture && !seen.has(t)) { seen.add(t); if (t.anisotropy !== a && t.image) { t.anisotropy = a; t.needsUpdate = true; } } } });
  }
  // the settings main.js reads every frame
  get grass() { return PHONE ? 0 : GRASS[this.opts.grass] ?? 1; }
  get draw() { return PHONE ? DRAW.medium : DRAW[this.opts.draw] || DRAW.far; }
  get rain() { return PHONE ? 0.25 : WEATHER[this.opts.weather] ?? 1; }
  // one of the Graphics page's settings changed: a preset becomes a custom setup the first time; the personal ones change on their own
  setOpt(k, v) {
    if (k in PERSONAL) { this.personal[k] = v; this.saveOpts(); if (k === 'cine') { if (v) this.makeRig(); else { this.cineGoal = 0; this.cineK = 0; this.dropCine(); this.dropRig(); } } if (k === 'contrast' || k === 'gamma') { if (!this.composer) this.build(); else this.applyLook(); } if (this.onOpts) this.onOpts(k); return; }
    if (PHONE || this.opts[k] === v) return;
    if (this.quality !== 'custom' || !this.custom) {
      const o = this.opts; this.custom = { ...o, scale: Math.round(this.pixelRatio({ ...o, aa: 'off' }) / (devicePixelRatio || 1) * 20) / 20 };
      delete this.custom.px; delete this.custom.fixed;
      this.quality = 'custom'; this.auto = false; store.set(KEY, 'custom');
    }
    this.custom[k] = v; this.saveOpts();
    const LOOK = { grain: 1, ca: 1, vignette: 1, bloom: 1 };
    if (k === 'tex') this.applyTextures();
    else if (k === 'grass' || k === 'draw' || k === 'weather') { /* read by the game every frame */ }
    else if (LOOK[k] && !!this.composer === this.plan().grade && !(k === 'bloom' && !!this.pass.bloom !== v > 0)) this.applyLook();
    else this.build();
    if (this.onChange) this.onChange(this.quality);
    if (this.onOpts) this.onOpts(k);
  }
  saveOpts() { store.set(OKEY, { custom: this.custom, personal: this.personal }); }
  // the setting as the menu shows it (a preset's render scale is shown as a share of the display's pixels)
  opt(k) {
    if (k in PERSONAL) return this.personal[k];
    const o = this.opts;
    if (k === 'scale') return o.scale != null ? o.scale : Math.round(this.pixelRatio({ ...o, aa: 'off' }) / (devicePixelRatio || 1) * 20) / 20;
    return o[k];
  }
  // "Custom" chosen from the preset list: start from what is on screen now
  toCustom() {
    if (PHONE) return;
    if (!this.custom) { const o = this.opts; this.custom = { ...o, scale: this.opt('scale') }; delete this.custom.px; delete this.custom.fixed; this.saveOpts(); }
    this.setMode('custom');
  }

  // the night look without a post-processing chain: one translucent quad over the picture, a blue-black wash that deepens toward
  // the corners and at night, with grain in its alpha. It is drawn after the scene with the depth test off
  buildOverlay() {
    const mat = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, night: { value: 0 }, res: { value: new THREE.Vector2(1, 1) } },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform float time, night; uniform vec2 res; varying vec2 vUv;
        float hash(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
        void main() {
          vec2 d = vUv - 0.5;
          float vig = 0.34 * smoothstep(0.28, 0.95, length(d) * 1.25);
          float n = hash(vUv * res + fract(time) * 91.7) - 0.5;
          vec3 c = mix(vec3(0.0), vec3(0.05, 0.1, 0.24), night);
          gl_FragColor = vec4(c, clamp(vig + night * 0.16 + n * 0.07, 0.0, 1.0));
        }`,
      transparent: true, depthTest: false, depthWrite: false,
    });
    const scene = new THREE.Scene(); scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
    this.overlay = { scene, cam: new THREE.Camera(), mat };
  }

  resize() {
    const dpr = this.plan().dpr * this.res;
    this.r.setSize(innerWidth, innerHeight);
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(innerWidth, innerHeight); }
    this.sizePasses(dpr);
    if (this.chain) { const ch = this.chain; ch.dpr = this.cinePlan().dpr; ch.composer.setPixelRatio(ch.dpr); ch.composer.setSize(innerWidth, innerHeight); this.sizePasses(ch.dpr, ch.pass); if (this.cineOn) this.r.setPixelRatio(ch.dpr); }
  }

  // ---------- the conversations' look ----------
  // main.js says each frame whether a conversation is on and where the speaker's head is (null: nobody in particular)
  setCine(on, focus = null) { this.cineGoal = on && this.personal.cine && !PHONE ? 1 : 0; this.cineFocus = focus; }
  cinePlan() {
    const p = this.plan();
    return { ...p, dpr: Math.min(4, Math.max(p.dpr, (devicePixelRatio || 1) * CINE.scale)), msaa: 4, ao: CINE.ao, bloom: Math.max(p.bloom || 0, CINE.bloom), grade: true, direct: false, dof: true, fxaa: false, mblur: false };
  }
  makeCine() {
    const p = this.cinePlan(), ch = this.chain = { ...this.chainFor(p, p.dpr), dpr: p.dpr };
    this.sizePasses(p.dpr, ch.pass); this.applyLook(ch.pass, true);
    return ch;
  }
  dropCine() {
    if (this.cineOn) this.leaveCine();
    if (this.chain) { for (const ps of this.chain.composer.passes) ps.dispose?.(); this.chain.composer.dispose?.(); this.chain = null; }
  }
  // the chain's own shaders (and the AO pass's depth-normal programs) compiled ahead, drawn once off screen at a tiny size
  warmCine() {
    if (PHONE || !this.personal.cine) return;
    const ch = this.chain || this.makeCine(), c = ch.composer;
    c.renderToScreen = false; c.setSize(64, 36);
    try { c.render(0); } finally { c.renderToScreen = true; c.setSize(innerWidth, innerHeight); this.sizePasses(ch.dpr, ch.pass); }
  }
  enterCine() {
    const ch = this.chain || this.makeCine();
    this.cineOn = true; this.r.setPixelRatio(ch.dpr); this.dofF = null; this.boxAt = null;
    // sharper shadows while it lasts: every shadow map at twice the size (the sun's is also pulled in around the speaker)
    this.shadowSave = [];
    if (this.r.shadowMap.enabled) for (const l of this.scene.userData.shadowLights || []) {
      const sh = l.light.shadow, cam = sh.camera, n = Math.min(this.r.capabilities.maxTextureSize, 8192, sh.mapSize.x * CINE.shadow);
      this.shadowSave.push({ l, size: sh.mapSize.x, box: [cam.left, cam.right, cam.top, cam.bottom] });
      sh.mapSize.set(n, n); if (sh.map) { sh.map.dispose(); sh.map = null; } sh.needsUpdate = true;
    }
    this.applyTextures();   // the people and props that loaded after the setting was last applied
  }
  leaveCine() {
    this.cineOn = false;
    for (const { l, size, box } of this.shadowSave || []) {
      const sh = l.light.shadow, cam = sh.camera;
      sh.mapSize.set(size, size); if (sh.map) { sh.map.dispose(); sh.map = null; }
      if (l.sun) { [cam.left, cam.right, cam.top, cam.bottom] = box; cam.updateProjectionMatrix(); }
      sh.needsUpdate = true;
    }
    this.shadowSave = null;
    if (this.rig) for (const k in this.rig) this.rig[k].intensity = 0;
    this.r.setPixelRatio(this.plan().dpr * this.res);
  }
  // three lights that follow the framing: a warm key 45 degrees off the line from the lens to the face and a little above, a dim cool
  // fill from the other side, and a rim from behind that picks the head out of the room. Always in the scene (dark when not in use), so a
  // conversation never changes the light count and recompiles every shader
  makeRig() {
    if (PHONE || this.rig || !this.personal.cine) return;
    const mk = (col, ang) => { const l = new THREE.SpotLight(col, 0, 6, ang, 0.85, 2); this.scene.add(l, l.target); return l; };
    this.rig = { key: mk(0xffd6aa, 0.42), fill: mk(0xaec4ff, 0.6), rim: mk(0xfff1dc, 0.4) };
  }
  // how much of the screen's height each letterbox bar covers right now (0 out of a conversation)
  barsNow() { const g = this.chain && this.chain.pass && this.chain.pass.grade; return g ? g.uniforms.bars.value : 0; }
  dropRig() { if (!this.rig) return; for (const k in this.rig) { const l = this.rig[k]; this.scene.remove(l, l.target); l.dispose(); } this.rig = null; }
  cineFrame(dt) {
    const ch = this.chain, k = this.cineK, cam = this.camera, f = this.cineFocus, fwd = cam.getWorldDirection(this._f);
    const g = ch.pass.grade.uniforms;
    g.cine.value = k; g.bars.value = Math.max(0, (1 - innerWidth / innerHeight / 2.39) / 2) * k;
    // focus on the speaker, or a soft middle distance when nobody is framed
    const want = f ? Math.max(0.3, this._v.copy(f).sub(cam.position).dot(fwd)) : 3;
    this.dofF = this.dofF == null ? want : this.dofF + (want - this.dofF) * Math.min(1, dt * 5);
    if (ch.pass.dof) { const u = ch.pass.dof.uniforms; u.focus.value = this.dofF; u.aperture.value = f ? 1.1 : 0.35; u.near.value = cam.near; u.far.value = cam.far; u.k.value = k; }
    // the sun's shadow box drawn in around the speaker (5 m each way instead of 32), so the light through a window has a crisp edge
    const sun = (this.shadowSave || []).find((s) => s.l.sun);
    if (sun && f && (!this.boxAt || this.boxAt.distanceTo(f) > 0.6)) {
      const sc = sun.l.light.shadow.camera; (this.boxAt ||= new THREE.Vector3()).copy(f);
      const v = this._v.copy(f).applyMatrix4(sc.matrixWorldInverse), b = CINE.box;
      sc.left = v.x - b; sc.right = v.x + b; sc.bottom = v.y - b; sc.top = v.y + b; sc.updateProjectionMatrix(); sun.l.light.shadow.needsUpdate = true;
    }
    if (!this.rig) return;
    const { key, fill, rim } = this.rig, on = f ? k : 0;
    key.intensity = 5 * on; fill.intensity = 1.1 * on; rim.intensity = 7 * on;
    if (!f) return;
    let dx = cam.position.x - f.x, dz = cam.position.z - f.z; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
    const at = (light, ang, dist, up, aim = 0) => {
      const c = Math.cos(ang), s = Math.sin(ang);
      light.position.set(f.x + (dx * c - dz * s) * dist, f.y + up, f.z + (dx * s + dz * c) * dist);
      light.target.position.set(f.x, f.y + aim, f.z); light.target.updateMatrixWorld();
    };
    at(key, 0.785, 1.25, 0.45, -0.05); at(fill, -1.05, 1.5, 0.05, -0.1); at(rim, 2.6, 1.15, 0.55, -0.12);
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
    if (!(QUALITY[q] || (q === 'custom' && this.custom && !PHONE)) || q === this.quality) return;
    this.quality = q; this.build(); this.applyTextures();
    if (save) { store.set(KEY, q); this.auto = false; }
    this.slow = 0; if (this.onChange) this.onChange(q); if (this.onOpts) this.onOpts('*');
  }
  // the options menu's setting: 'auto' (a preset picked for the device, stepped down when frames are slow) or a preset kept as chosen
  get mode() { return this.auto ? 'auto' : this.quality; }
  setMode(m) {
    if (m === 'auto') { store.remove(KEY); this.auto = true; this.age = 0; this.setQuality(this.autoQuality, { save: false }); }
    else if (QUALITY[m] || (m === 'custom' && this.custom && !PHONE)) { this.setQuality(m, { save: false }); this.auto = false; store.set(KEY, m); }
  }

  // dynamic resolution: render at a lower pixel ratio when frames are slow, and creep back up when there is headroom
  // the preset's own render scale, before the dynamic factor
  baseDpr() { return this.plan().dpr; }
  setRes(v) {
    if (v === this.res) return; this.res = v;
    const dpr = this.plan().dpr * v;
    this.r.setPixelRatio(dpr);
    if (this.composer) { this.composer.setPixelRatio(dpr); this.composer.setSize(innerWidth, innerHeight); }
    this.sizePasses(dpr);
  }

  // adaptive: first lower the resolution a little, and if the frame time stays high step down one preset. A card with plenty of
  // headroom (frames well under 9 ms for ten seconds at full resolution) steps up instead, but never back to a preset it stepped down from
  watch(dt) {
    this.age += dt;
    if (this.age < 6 || !this.auto || this.cineOn) return;   // a conversation draws at a higher scale on purpose: it is no reason to step down
    this.ft += (dt * 1000 - this.ft) * 0.05; this.cool -= dt;
    if (this.ft > 21 && this.cool <= 0 && this.res > 0.71) { this.setRes(Math.max(0.7, +(this.res - 0.15).toFixed(2))); this.cool = 3; this.ft = 16; return; }
    if (this.ft < 12.5 && this.cool <= 0 && this.res < 1) { this.setRes(Math.min(1, +(this.res + 0.1).toFixed(2))); this.cool = 8; return; }
    this.slow = this.ft > 32 ? this.slow + dt : Math.max(0, this.slow - dt);
    const i = ORDER.indexOf(this.quality);
    if (i < 0) return;   // the phone preset is the floor already
    if (this.slow > 3) {
      if (i < ORDER.length - 1) { console.info('graphics: stepping down to', ORDER[i + 1]); this.ceiling = i + 1; this.setQuality(ORDER[i + 1], { save: false }); }
      this.slow = 0; this.ft = 16;
      return;
    }
    this.fast = this.ft < 9 && this.res >= 1 && !PHONE ? this.fast + dt : 0;
    if (this.fast > 10 && i > 0 && (this.ceiling === null || i > this.ceiling)) {
      console.info('graphics: stepping up to', ORDER[i - 1]); this.setQuality(ORDER[i - 1], { save: false }); this.fast = 0; this.ft = 16; this.age = 0;
    }
  }

  // a phone leaves the small models out past a few metres (props.js marks them): the list is gathered again now and then, since models arrive late
  cull(dt) {
    this.cullT = (this.cullT ?? 0) - dt; if (this.cullT > 0) return; this.cullT = 0.3;
    if (!this.cullList || (this.cullAge = (this.cullAge ?? 0) + 0.3) > 6) { this.cullList = []; this.cullAge = 0; this.scene.traverse((o) => { if (o.userData && o.userData.farCull) this.cullList.push(o); }); }
    const c = this.camera.position, v = this._cv || (this._cv = new THREE.Vector3());
    for (const o of this.cullList) { o.getWorldPosition(v); const want = v.distanceTo(c) < o.userData.farCull; if (o.visible !== want) o.visible = want; }
  }

  render(dt) {
    this.time += dt; this.watch(dt); if (PHONE) this.cull(dt);
    if (this.pass.blur) {   // the trail follows how fast the view turns
      const q = this.camera.quaternion, a = this._q.angleTo(q); this._q.copy(q);
      this.turn += ((dt > 0 ? a / dt : 0) - this.turn) * Math.min(1, dt * 12);
      this.pass.blur.k = THREE.MathUtils.clamp((this.turn - 0.6) * 0.12, 0, 0.6);
    }
    this.night += ((this.nightGoal ?? 0) - this.night) * Math.min(1, dt * 1.2);
    // the conversations' look eases in and out over about a second (the letterbox slides with it)
    this.cineK += (this.cineGoal - this.cineK) * Math.min(1, dt * 2.6);
    if (this.cineGoal === 0 && this.cineK < 0.01) this.cineK = 0; else if (this.cineGoal === 1 && this.cineK > 0.995) this.cineK = 1;
    if (this.cineK > 0 && !this.cineOn && !PHONE) this.enterCine(); else if (this.cineK === 0 && this.cineOn) this.leaveCine();
    if (this.cineOn) {
      this.cineFrame(dt);
      const u = this.chain.pass.grade.uniforms; u.time.value = this.time; u.night.value = this.night;
      this.chain.composer.render(dt);
      return;
    }
    if (this.pass.grade) { const u = this.pass.grade.uniforms; u.time.value = this.time; u.night.value = this.night; }
    if (this.composer) this.composer.render(dt);
    else {
      this.r.render(this.scene, this.camera);
      if (this.overlay && (QUALITY[this.quality] || {}).overlay) {
        const u = this.overlay.mat.uniforms; u.time.value = this.time; u.night.value = this.night; u.res.value.set(innerWidth, innerHeight);
        this.r.autoClear = false; this.r.render(this.overlay.scene, this.overlay.cam); this.r.autoClear = true;
      }
    }
  }
}
