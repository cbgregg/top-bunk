// Real PBR materials: colour + normal + packed AO/roughness/metal maps (assets/pbr, made by tools/assets/fetch_pbr.py).
// The old canvas textures stay on the materials until these arrive, so nothing flashes and a missing file just keeps the old look.
import * as THREE from 'three';

const loader = new THREE.TextureLoader();
const metaP = fetch('assets/pbr/pbr.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({}));
const cache = new Map();
let aniso = 8;
export const setAnisotropy = (n) => { aniso = n; };

function tex(url, srgb, rep) {
  const key = url + '@' + rep;
  if (cache.has(key)) return cache.get(key);
  const t = loader.load(url);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep, rep); t.anisotropy = aniso;
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
export async function applyPBR(mat, name, { tint, tile, normal = 1, rough = 1, flat = null, anti = false } = {}) {
  const meta = await metaP, t = tile ?? meta[name];
  if (!t) return;
  const rep = 1 / t, base = `assets/pbr/${name}_`;
  const a = tex(base + 'a.webp', false, rep);
  mat.map = tex(base + 'c.webp', true, rep);
  mat.normalMap = tex(base + 'n.webp', false, rep); mat.normalScale.set(normal, normal);
  mat.roughnessMap = mat.metalnessMap = mat.aoMap = a;
  mat.roughness = rough; mat.metalness = 1; mat.aoMapIntensity = 1;
  if (flat !== null) { mat.roughnessMap = null; mat.roughness = flat; }   // ignore the map: a constant roughness
  mat.color.set(tint ?? 0xffffff);
  if (anti) breakTiling(mat, typeof anti === 'object' ? anti : undefined);
  mat.needsUpdate = true;
}
