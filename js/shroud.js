// a shroud of black smoke over a figure: soft dark billboards born on its limbs that swell, drift up and out and die, so the body
// under them reads as a shape in the dark and not as a man in clothes. One instanced draw; the anchors are bones (or any objects),
// each particle sits a little off the line from its anchor to the next, and the drift and the fade run on the card from a seed and
// the clock. Count scales with the graphics preset; 'low' draws none.
import * as THREE from 'three';

let smokeTex = null;
function smoke() {
  if (smokeTex) return smokeTex;
  const S = 128, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'); g.clearRect(0, 0, S, S);
  // a few dozen soft blobs inside a soft disc: the sprite reads as a wisp from any angle
  let s = 7;
  const rnd = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, d = Math.sqrt(rnd()) * 0.34 * S, x = S / 2 + Math.cos(a) * d, y = S / 2 + Math.sin(a) * d, r = (0.12 + rnd() * 0.2) * S;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(0,0,0,0.5)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  // fade the rim so no square ever shows
  g.globalCompositeOperation = 'destination-in';
  const rim = g.createRadialGradient(S / 2, S / 2, S * 0.1, S / 2, S / 2, S * 0.5); rim.addColorStop(0, 'rgba(0,0,0,1)'); rim.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = rim; g.fillRect(0, 0, S, S);
  smokeTex = new THREE.CanvasTexture(c); smokeTex.colorSpace = THREE.NoColorSpace;
  return smokeTex;
}

const VERT = `
  attribute vec3 aPos; attribute vec4 aSeed; attribute vec3 aDir;
  uniform float uTime, uRise, uLife, uSizeMin, uSizeMax, uSpread, uNear, uHeadR;
  uniform vec3 uVel, uHead;
  varying vec2 vUv; varying float vAlpha;
  float h(float n) { return fract(sin(n) * 43758.5453); }
  void main() {
    vUv = uv;
    // age 0..1 from a phase per particle, so the births are spread through the life
    float age = fract(uTime / uLife + aSeed.x);
    float sz = mix(uSizeMin, uSizeMax, aSeed.y) * (0.45 + 0.9 * age);
    // drift: up with a little side wander from three slow sines, out along the particle's own direction, and back along the figure's motion
    float ph = aSeed.z * 6.2832, tm = uTime * (0.6 + aSeed.w);
    vec3 wander = vec3(sin(tm + ph), 0.0, cos(tm * 0.8 + ph * 1.7)) * 0.08 * uSpread;
    vec3 p = aPos + aDir * (0.04 + 0.22 * uSpread * age) + vec3(0.0, uRise * age * age, 0.0) + wander * age - uVel * age * 0.35;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    // billboard quad in view space, turned a little per particle so the sprite is never seen the same way twice
    float rot = ph + age * (aSeed.w - 0.5) * 2.0, cr = cos(rot), sr = sin(rot);
    vec2 corner = (uv - 0.5) * sz;
    mv.xy += vec2(corner.x * cr - corner.y * sr, corner.x * sr + corner.y * cr);
    // born faint, full in the middle of the life, gone at the end; thin out close to the lens so the face stays clear at the scare
    float life = smoothstep(0.0, 0.18, age) * (1.0 - smoothstep(0.55, 1.0, age));
    float near = smoothstep(uNear * 0.5, uNear * 1.6, -mv.z);
    // nothing in front of the face from where the viewer stands: a particle that sits on the line of sight to the head, this side of
    // it, fades out; the ones behind and beside the head stay, so the smoke still comes off the skull
    vec3 wp = (modelMatrix * vec4(p, 1.0)).xyz, toP = wp - cameraPosition, toH = uHead - cameraPosition;
    float dp = length(toP), dh = length(toH), ang = distance(toP / dp, toH / dh), thr = uHeadR / dh;
    float face = (1.0 - smoothstep(thr, thr * 1.7, ang)) * step(dp, dh + 0.12);
    vAlpha = (life * near * aSeed.y * 0.5 + life * near * 0.5) * (1.0 - face);
    gl_Position = projectionMatrix * mv;
  }`;
const FRAG = `
  uniform sampler2D uTex; uniform float uOpacity; uniform vec3 uColor;
  varying vec2 vUv; varying float vAlpha;
  void main() {
    float a = texture2D(uTex, vUv).a * vAlpha * uOpacity;
    if (a < 0.004) discard;
    gl_FragColor = vec4(uColor, a);
  }`;

const _a = new THREE.Vector3(), _b = new THREE.Vector3(), _d = new THREE.Vector3(), _q = new THREE.Quaternion(), _o = new THREE.Vector3(), _inv = new THREE.Matrix4();

export class Shroud {
  // anchors: [{ a: Object3D, b: Object3D | null, r: radius (m), w: share of the particles }]
  constructor(parent, anchors, { count = 300, rise = 0.5, life = 1.2, size = [0.15, 0.45], spread = 1, near = 0.5, opacity = 0.9, color = 0x000000 } = {}) {
    this.anchors = anchors; this.count = count; this.parent = parent;
    const quad = new THREE.PlaneGeometry(1, 1);
    const geo = this.geo = new THREE.InstancedBufferGeometry(); geo.index = quad.index; geo.attributes.position = quad.attributes.position; geo.attributes.uv = quad.attributes.uv;
    this.pos = new Float32Array(count * 3); this.dir = new Float32Array(count * 3); this.seed = new Float32Array(count * 4); this.slot = new Uint16Array(count); this.off = new Float32Array(count * 4);
    let s = 11;
    const rnd = () => { s = (s * 48271) % 2147483647; return s / 2147483647; };
    // hand out the particles to the anchors by weight; each keeps a fixed spot on its limb (t along it, an angle and a radius)
    const tot = anchors.reduce((t, k) => t + (k.w ?? 1), 0); let i = 0;
    anchors.forEach((k, ai) => {
      const n = ai === anchors.length - 1 ? count - i : Math.round(count * (k.w ?? 1) / tot);
      for (let j = 0; j < n && i < count; j++, i++) { this.slot[i] = ai; this.off[i * 4] = rnd(); this.off[i * 4 + 1] = rnd() * Math.PI * 2; this.off[i * 4 + 2] = 0.3 + 0.7 * Math.sqrt(rnd()); this.off[i * 4 + 3] = rnd(); }
    });
    for (let j = 0; j < count; j++) { this.seed[j * 4] = rnd(); this.seed[j * 4 + 1] = rnd(); this.seed[j * 4 + 2] = rnd(); this.seed[j * 4 + 3] = rnd(); }
    geo.setAttribute('aPos', new THREE.InstancedBufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aDir', new THREE.InstancedBufferAttribute(this.dir, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(this.seed, 4));
    geo.instanceCount = count;
    this.mat = new THREE.ShaderMaterial({
      uniforms: { uTex: { value: smoke() }, uTime: { value: 0 }, uRise: { value: rise }, uLife: { value: life }, uSizeMin: { value: size[0] }, uSizeMax: { value: size[1] }, uSpread: { value: spread }, uNear: { value: near }, uHead: { value: new THREE.Vector3(0, -1e6, 0) }, uHeadR: { value: 0 }, uVel: { value: new THREE.Vector3() }, uOpacity: { value: opacity }, uColor: { value: new THREE.Color(color) } },
      vertexShader: VERT, fragmentShader: FRAG, transparent: true, depthWrite: false, depthTest: true, side: THREE.DoubleSide, fog: false,
    });
    this.mesh = new THREE.Mesh(geo, this.mat); this.mesh.frustumCulled = false; this.mesh.renderOrder = 5; this.mesh.name = 'shroud';
    this.mesh.userData.noAO = true;   // the occlusion pass must not see the cards as walls (gfx.js rebuilds its list when aoDirty is set)
    parent.add(this.mesh);
    let top = parent; while (top.parent) top = top.parent; top.userData.aoDirty = true;
    this.time = 0; this.vel = new THREE.Vector3(); this.last = new THREE.Vector3(); this.first = true;
  }
  setCount(n) { this.geo.instanceCount = Math.max(0, Math.min(this.count, n | 0)); this.mesh.visible = this.geo.instanceCount > 0; }
  // every frame after the bones moved: the particles' birth points follow their limbs; positions are in the mesh parent's space
  // face: { obj, r }: the object at the centre of the face and its radius; no smoke shows between the viewer and it
  update(dt, rootPos = null, face = null) {
    if (!this.mesh.visible) return;
    this.time += dt; this.mat.uniforms.uTime.value = this.time;
    const P = this.pos, D = this.dir, A = this.anchors;
    this.parent.updateWorldMatrix(true, false); _inv.copy(this.parent.matrixWorld).invert();
    if (face) { face.obj.getWorldPosition(this.mat.uniforms.uHead.value); this.mat.uniforms.uHeadR.value = face.r; } else this.mat.uniforms.uHeadR.value = 0;
    // the figure's speed, in the parent's own frame, so the wisps stream behind it whichever way it faces
    if (rootPos) { if (!this.first && dt > 0) this.vel.copy(rootPos).sub(this.last).divideScalar(dt).clampLength(0, 3); this.last.copy(rootPos); this.first = false; this.mat.uniforms.uVel.value.lerp(_o.copy(this.vel).transformDirection(_inv).multiplyScalar(this.vel.length()), Math.min(1, dt * 4)); }
    const n = this.geo.instanceCount;
    for (let i = 0; i < n; i++) {
      const k = A[this.slot[i]]; const t = this.off[i * 4], ang = this.off[i * 4 + 1], rr = this.off[i * 4 + 2] * k.r;
      k.a.getWorldPosition(_a); if (k.b) k.b.getWorldPosition(_b); else _b.copy(_a);
      _d.copy(_b).sub(_a); const len = _d.length(); if (len > 1e-5) _d.divideScalar(len); else _d.set(0, 1, 0);
      // a radial frame round the limb: any perpendicular, turned by the particle's angle
      _o.set(_d.y, -_d.x, 0); if (_o.lengthSq() < 1e-6) _o.set(0, _d.z, -_d.y); _o.normalize();
      _q.setFromAxisAngle(_d, ang); _o.applyQuaternion(_q);
      _a.addScaledVector(_d, len * t).addScaledVector(_o, rr).applyMatrix4(_inv);
      P[i * 3] = _a.x; P[i * 3 + 1] = _a.y; P[i * 3 + 2] = _a.z;
      _o.transformDirection(_inv);
      D[i * 3] = _o.x; D[i * 3 + 1] = _o.y; D[i * 3 + 2] = _o.z;
    }
    this.geo.attributes.aPos.needsUpdate = true; this.geo.attributes.aDir.needsUpdate = true;
  }
  set opacity(v) { this.mat.uniforms.uOpacity.value = v; }
  get opacity() { return this.mat.uniforms.uOpacity.value; }
  dispose() { this.parent.remove(this.mesh); this.geo.dispose(); this.mat.dispose(); }
}
