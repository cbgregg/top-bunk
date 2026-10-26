// Drifting dust motes around the camera: a few hundred faint specks that wrap around the player, so the air isn't empty.
import * as THREE from 'three';

export class Dust {
  constructor(scene, camera, count = 360) {
    this.camera = camera;
    const pos = new Float32Array(count * 3), seed = new Float32Array(count);
    for (let i = 0; i < count; i++) { pos[i * 3] = Math.random(); pos[i * 3 + 1] = Math.random(); pos[i * 3 + 2] = Math.random(); seed[i] = Math.random() * 100; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('seed', new THREE.BufferAttribute(seed, 1));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      uniforms: { t: { value: 0 }, c: { value: new THREE.Vector3() }, alpha: { value: 0.16 }, size: { value: 2.4 } },
      vertexShader: `uniform float t; uniform vec3 c; uniform float size; attribute float seed; varying float vA;
        void main() {
          vec3 box = vec3(9.0, 3.2, 9.0);
          vec3 p = position * box + vec3(sin(t * 0.07 + seed), sin(t * 0.05 + seed * 1.7) * 0.5 - t * 0.012, cos(t * 0.06 + seed * 2.3));
          p = mod(p - c + box * 0.5, box) - box * 0.5;             // wrap around the camera
          vec4 mv = viewMatrix * vec4(c + p, 1.0);
          gl_Position = projectionMatrix * mv; gl_PointSize = size * (4.0 / max(1.0, -mv.z)) * 1.6;
          vA = smoothstep(4.5, 1.0, length(p)) * (0.5 + 0.5 * sin(t * 0.9 + seed * 7.0));
        }`,
      fragmentShader: `uniform float alpha; varying float vA;
        void main() { float d = length(gl_PointCoord - 0.5) * 2.0; float a = smoothstep(1.0, 0.0, d) * vA * alpha; gl_FragColor = vec4(vec3(0.8, 0.9, 1.0), a); }`,
    });
    this.pts = new THREE.Points(g, this.mat); this.pts.frustumCulled = false; this.pts.userData.noAO = true; scene.add(this.pts);
  }
  update(dt) { this.mat.uniforms.t.value += dt; this.mat.uniforms.c.value.copy(this.camera.position); }
}
