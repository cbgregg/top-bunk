// PBR materials: colour + normal + packed AO/roughness/metal maps (assets/pbr, made by tools/assets/fetch_pbr.py).
// The canvas textures stay on the materials until these arrive, so nothing flashes and a missing file just keeps the canvas look.
import * as THREE from 'three';
import { PHONE } from './gfx.js';

const loader = new THREE.TextureLoader();
// on a phone every texture is held at half size (a quarter of the memory): the picture is drawn into a canvas and that replaces the image
const PHONE_MAX = 512;
export function shrinkTexture(t) {
  const im = t && t.image; if (!PHONE || !im || !(im.width > PHONE_MAX || im.height > PHONE_MAX)) return;
  const k = Math.min(1, PHONE_MAX / Math.max(im.width, im.height)), c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.width * k)); c.height = Math.max(1, Math.round(im.height * k));
  try { c.getContext('2d').drawImage(im, 0, 0, c.width, c.height); } catch (e) { return; }
  t.image = c; t.needsUpdate = true; if (im.close) im.close();
}
// every texture on every material under root
export function shrinkTextures(root) {
  if (!PHONE) return;
  root.traverse((o) => { const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []; for (const m of ms) for (const k in m) { const v = m[k]; if (v && v.isTexture) shrinkTexture(v); } });
}
const metaP = fetch('assets/pbr/pbr.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const cache = new Map();
const aniso = 8;
// the packed roughness (green) of these maps is very low; scale it so floors and wood do not read as wet
const ROUGH_SCALE = { tile: 7, pine: 2.2, darkwood: 1.5 };

function tex(url, srgb, rep) {
  const key = url + '@' + rep;
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(url, PHONE ? shrinkTexture : undefined);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = PHONE ? 2 : aniso;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t); return t;
}

// Break up the visible repetition of a tiled texture with slow, large-scale brightness variation in world space.
export function breakTiling(mat, { scale = 0.05, strength = 0.28 } = {}) {
  mat.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWp;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWp = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWp;
        float h21(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
        float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(h21(i), h21(i + vec2(1, 0)), f.x), mix(h21(i + vec2(0, 1)), h21(i + vec2(1, 1)), f.x), f.y); }`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        float mv = vn(vWp.xz * ${scale.toFixed(4)}) * 0.6 + vn(vWp.xz * ${(scale * 3.7).toFixed(4)}) * 0.4;
        diffuseColor.rgb *= ${(1 - strength).toFixed(3)} + ${(2 * strength).toFixed(3)} * mv;`);
  };
  mat.customProgramCacheKey = () => 'antitile' + scale + strength;
  mat.needsUpdate = true;
}

// tint: colour multiplied onto the texture. tile: metres per texture repeat (default from pbr.json). rough: roughness multiplier,
// or flat: a constant roughness that ignores the map.
export async function applyPBR(mat, name, { tint, tile, normal = 1, rough = 1, flat = null, anti = false, keepMap = false, rotate = 0 } = {}) {
  const meta = await metaP, t = tile ?? meta[name];
  if (!t) return;
  const rep = 1 / t, base = `assets/pbr/${name}_`;
  const a = tex(base + 'a.webp', false, rep);
  if (!keepMap) mat.map = tex(base + 'c.webp', true, rep);   // keepMap: a patterned colour map (the floral quilt) stays, the PBR only adds relief
  mat.normalMap = tex(base + 'n.webp', false, rep); mat.normalScale.set(normal, normal);
  mat.roughnessMap = mat.aoMap = a;
  mat.roughness = rough * (ROUGH_SCALE[name] ?? 1); mat.metalness = name === 'metal' ? 0.85 : 0; mat.metalnessMap = null; mat.aoMapIntensity = 1;   // the blue channel of the packed maps is empty, so metalness is set here instead
  if (flat !== null) { mat.roughnessMap = null; mat.roughness = flat; }   // ignore the map: a constant roughness
  if (!keepMap) mat.color.set(tint ?? 0xffffff);
  if (rotate) for (const t of [mat.map, mat.normalMap, a]) t.rotation = rotate;   // e.g. vertical boards from a horizontal siding texture
  if (anti) breakTiling(mat, typeof anti === 'object' ? anti : undefined);
  mat.needsUpdate = true;
}
